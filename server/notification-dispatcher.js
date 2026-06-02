import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  listPendingAlertNotifications,
  updateAlertNotificationStatus,
} from "./supabase-alerts.js";

const localEnv = loadEnvFiles([
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), ".env.local"),
]);

export function notificationDeliveryConfig() {
  return {
    email: {
      enabled: isEmailConfigured(),
      provider: detectEmailProvider() || "",
    },
    whatsapp: {
      enabled: isWhatsAppConfigured(),
      provider: isWhatsAppConfigured() ? "whatsapp-cloud" : "",
    },
    telegram: {
      enabled: isTelegramConfigured(),
      mode: envValue("TELEGRAM_ALERTS_MODE") || "mirror",
    },
  };
}

export async function dispatchPendingAlertNotifications(options = {}) {
  const limit = clamp(Number(options.limit || 100), 1, 500);
  const dryRun = parseBoolean(options.dryRun);
  const notifications = await listPendingAlertNotifications({ limit });
  const results = [];

  for (const notification of notifications) {
    if (options.channel && String(options.channel) !== notification.channel) {
      results.push({ id: notification.id, channel: notification.channel, status: "skipped" });
      continue;
    }

    if (dryRun) {
      results.push({ id: notification.id, channel: notification.channel, status: "dry-run" });
      continue;
    }

    try {
      const delivery = await sendAlertNotification(notification);
      await sendTelegramMirror(notification, delivery).catch(() => null);
      await updateAlertNotificationStatus({ id: notification.id, status: "sent" });
      results.push({ id: notification.id, channel: notification.channel, status: "sent", delivery });
    } catch (error) {
      await updateAlertNotificationStatus({
        id: notification.id,
        status: "failed",
        errorMessage: publicDeliveryError(error),
      }).catch(() => null);
      results.push({
        id: notification.id,
        channel: notification.channel,
        status: "failed",
        error: publicDeliveryError(error),
      });
    }
  }

  return {
    ok: true,
    config: notificationDeliveryConfig(),
    count: notifications.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => ["skipped", "dry-run"].includes(result.status)).length,
    results,
  };
}

export async function sendAlertNotification(notification) {
  if (notification.channel === "email") return sendEmailNotification(notification);
  if (notification.channel === "whatsapp") return sendWhatsAppNotification(notification);
  if (notification.channel === "telegram") return sendTelegramNotification(notification);
  throw deliveryError("RAD-NOTIFY-001", "Canal de aviso indisponivel.");
}

async function sendEmailNotification(notification) {
  const to = normalizeEmail(notification.userEmail);
  const from = envValue("EMAIL_FROM") || envValue("SMTP_FROM");
  const provider = detectEmailProvider();

  if (!to) throw deliveryError("RAD-NOTIFY-002", "E-mail de destino ausente.");
  if (!from) throw deliveryError("RAD-NOTIFY-002", "Remetente de e-mail aguardando configuracao.");
  if (!provider) throw deliveryError("RAD-NOTIFY-002", "Envio de e-mail aguardando configuracao.");

  const subject = `Garimpanda encontrou uma oportunidade: ${notification.productTitle || "produto monitorado"}`;
  const text = buildTextMessage(notification);
  const html = buildEmailHtml(notification);

  if (provider === "resend") {
    const payload = await postJson("https://api.resend.com/emails", {
      from,
      to: [to],
      subject,
      text,
      html,
    }, {
      Authorization: `Bearer ${envValue("RESEND_API_KEY")}`,
    });
    return { provider, id: payload.id || "" };
  }

  if (provider === "sendgrid") {
    const fromIdentity = parseEmailIdentity(from);
    const payload = await postJson("https://api.sendgrid.com/v3/mail/send", {
      personalizations: [{ to: [{ email: to }] }],
      from: fromIdentity.name ? { email: fromIdentity.email, name: fromIdentity.name } : { email: fromIdentity.email },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }, {
      Authorization: `Bearer ${envValue("SENDGRID_API_KEY")}`,
    }, { allowEmptyJson: true });
    return { provider, id: payload.id || "" };
  }

  const transport = nodemailer.createTransport({
    host: envValue("SMTP_HOST"),
    port: Number(envValue("SMTP_PORT") || 587),
    secure: parseBoolean(envValue("SMTP_SECURE")) || Number(envValue("SMTP_PORT")) === 465,
    auth: envValue("SMTP_USER") || envValue("SMTP_PASS")
      ? {
        user: envValue("SMTP_USER"),
        pass: envValue("SMTP_PASS"),
      }
      : undefined,
  });
  const info = await transport.sendMail({ from, to, subject, text, html });
  return { provider, id: info.messageId || "" };
}

async function sendWhatsAppNotification(notification) {
  const token = envValue("WHATSAPP_ACCESS_TOKEN") || envValue("META_WHATSAPP_TOKEN");
  const phoneNumberId = envValue("WHATSAPP_PHONE_NUMBER_ID");
  const to = normalizeWhatsAppPhone(notification.whatsappPhone);

  if (!to) throw deliveryError("RAD-NOTIFY-003", "WhatsApp de destino ausente.");
  if (!token || !phoneNumberId) throw deliveryError("RAD-NOTIFY-003", "Envio por WhatsApp aguardando configuracao.");

  const templateName = envValue("WHATSAPP_TEMPLATE_NAME");
  const payload = templateName
    ? buildWhatsAppTemplatePayload(notification, to, templateName)
    : {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        preview_url: true,
        body: buildTextMessage(notification),
      },
    };

  const response = await postJson(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, payload, {
    Authorization: `Bearer ${token}`,
  });
  return { provider: "whatsapp-cloud", id: response.messages?.[0]?.id || "" };
}

async function sendTelegramNotification(notification) {
  const chatId = envValue("TELEGRAM_CHAT_ID");
  if (!isTelegramConfigured()) throw deliveryError("RAD-NOTIFY-004", "Envio por Telegram aguardando configuracao.");
  return sendTelegramMessage(chatId, buildTextMessage(notification));
}

async function sendTelegramMirror(notification, delivery) {
  if (!isTelegramConfigured()) return null;
  if (!parseBoolean(envValue("TELEGRAM_ALERTS_ENABLED"))) return null;
  if (notification.channel === "telegram") return null;

  const provider = delivery?.provider ? `Canal principal: ${delivery.provider}.` : "";
  return sendTelegramMessage(envValue("TELEGRAM_CHAT_ID"), `${buildTextMessage(notification)}\n\n${provider}`);
}

async function sendTelegramMessage(chatId, text) {
  const token = envValue("TELEGRAM_BOT_TOKEN");
  const payload = await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
  });
  return { provider: "telegram", id: payload.result?.message_id ? String(payload.result.message_id) : "" };
}

function buildWhatsAppTemplatePayload(notification, to, templateName) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: envValue("WHATSAPP_TEMPLATE_LANGUAGE") || "pt_BR" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: notification.productTitle || "Produto monitorado" },
          { type: "text", text: formatCurrency(notification.productPrice) },
          { type: "text", text: notification.productUrl || "Link indisponivel" },
        ],
      }],
    },
  };
}

function buildTextMessage(notification) {
  return [
    `Garimpanda encontrou uma oportunidade para voce.`,
    ``,
    `Produto: ${notification.productTitle || "Produto monitorado"}`,
    `Preco encontrado: ${formatCurrency(notification.productPrice)}`,
    notification.message ? `Resumo: ${notification.message}` : "",
    notification.productUrl ? `Ver oferta: ${notification.productUrl}` : "",
  ].filter(Boolean).join("\n");
}

function buildEmailHtml(notification) {
  const title = escapeHtml(notification.productTitle || "Produto monitorado");
  const price = escapeHtml(formatCurrency(notification.productPrice));
  const message = escapeHtml(notification.message || "Encontramos uma oportunidade dentro do preco desejado.");
  const url = String(notification.productUrl || "");
  const button = url
    ? `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#0aa874;color:#fff;text-decoration:none;font-weight:700;">Ver oferta</a>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f0faf6;font-family:Arial,sans-serif;color:#07131f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0faf6;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dcebe5;border-radius:22px;overflow:hidden;">
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 10px;color:#0aa874;font-weight:700;">Garimpanda</p>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;">Preco encontrado no seu radar</h1>
                <p style="margin:0 0 22px;color:#61717c;font-size:16px;line-height:1.5;">${message}</p>
                <div style="padding:18px;border-radius:18px;background:#f5fbf8;border:1px solid #dcebe5;margin-bottom:22px;">
                  <strong style="display:block;font-size:18px;margin-bottom:8px;">${title}</strong>
                  <span style="display:block;color:#0aa874;font-size:24px;font-weight:800;">${price}</span>
                </div>
                ${button}
                <p style="margin:24px 0 0;color:#83919b;font-size:13px;">Voce recebeu este aviso porque criou um alerta de preco no Garimpanda.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function detectEmailProvider() {
  const preferred = String(envValue("EMAIL_PROVIDER") || "").toLowerCase();
  if (preferred && ["resend", "sendgrid", "smtp"].includes(preferred)) return preferred;
  if (envValue("RESEND_API_KEY")) return "resend";
  if (envValue("SENDGRID_API_KEY")) return "sendgrid";
  if (envValue("SMTP_HOST")) return "smtp";
  return "";
}

function isEmailConfigured() {
  return Boolean((envValue("EMAIL_FROM") || envValue("SMTP_FROM")) && detectEmailProvider());
}

function isWhatsAppConfigured() {
  return Boolean((envValue("WHATSAPP_ACCESS_TOKEN") || envValue("META_WHATSAPP_TOKEN")) && envValue("WHATSAPP_PHONE_NUMBER_ID"));
}

function isTelegramConfigured() {
  return Boolean(envValue("TELEGRAM_BOT_TOKEN") && envValue("TELEGRAM_CHAT_ID"));
}

async function postJson(url, body, headers = {}, options = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || payload?.errors?.[0]?.message || payload?.raw || response.statusText;
    throw deliveryError("RAD-NOTIFY-001", `Falha no envio: ${detail}`);
  }

  if (!text && options.allowEmptyJson) return {};
  return payload;
}

function parseEmailIdentity(value) {
  const match = String(value || "").match(/^(.*?)<([^>]+)>$/);
  if (!match) return { email: String(value || "").trim(), name: "" };
  return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "preco nao informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

function publicDeliveryError(error) {
  const message = String(error?.message || "");
  const code = message.match(/RAD-[A-Z]+-\d{3}/)?.[0] || "RAD-NOTIFY-001";
  if (code === "RAD-NOTIFY-002") return "RAD-NOTIFY-002 - Envio de e-mail aguardando configuracao.";
  if (code === "RAD-NOTIFY-003") return "RAD-NOTIFY-003 - Envio por WhatsApp aguardando configuracao.";
  if (code === "RAD-NOTIFY-004") return "RAD-NOTIFY-004 - Envio por Telegram aguardando configuracao.";
  return `${code} - Falha ao enviar aviso.`;
}

function deliveryError(code, message) {
  const error = new Error(`${code} - ${message}`);
  error.code = code;
  return error;
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function envValue(key) {
  return process.env[key] || localEnv[key] || "";
}

function loadEnvFiles(filePaths) {
  const values = {};
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && value !== "") values[key] = value;
    }
  }
  return values;
}
