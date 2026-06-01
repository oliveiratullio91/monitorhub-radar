import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const env = loadEnvFiles([
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), ".env.local"),
]);

const ALERTS_TABLE = "monitorhub_price_alerts";
const NOTIFICATIONS_TABLE = "monitorhub_alert_notifications";
const DEFAULT_MATCH_LIMIT = 1000;

export function publicSupabaseConfig() {
  return {
    supabaseConfigured: isSupabaseConfigured(),
    supabaseAuthConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    supabaseDatabaseConfigured: isSupabaseConfigured(),
    supabaseRequiredEnv: isSupabaseConfigured()
      ? []
      : ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !env[key]),
  };
}

export function isSupabaseConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function buildSupabaseOAuthUrl(provider, redirectTo) {
  ensureSupabaseAuthConfigured();
  const authUrl = new URL("/auth/v1/authorize", withTrailingSlash(env.SUPABASE_URL));
  authUrl.searchParams.set("provider", String(provider || "google").trim().toLowerCase());
  authUrl.searchParams.set("redirect_to", String(redirectTo || "").trim());
  authUrl.searchParams.set("scopes", "email profile");
  return authUrl.toString();
}

export async function resolveSupabaseOAuthRedirect(provider, redirectTo) {
  const authUrl = buildSupabaseOAuthUrl(provider, redirectTo);
  const status = await inspectSupabaseOAuthUrl(authUrl, provider);
  return status.ok ? { ok: true, url: authUrl } : status;
}

export async function signUpPriceAlertUser(body = {}) {
  ensureSupabaseAuthConfigured();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const phone = normalizePhone(body.phone);

  if (!email) throw httpError("Informe um e-mail valido.", 400);
  if (password.length < 6) throw httpError("A senha precisa ter pelo menos 6 caracteres.", 400);

  const payload = await supabaseAuthFetch("/auth/v1/signup", {
    method: "POST",
    body: {
      email,
      password,
      data: {
        name,
        phone,
      },
    },
  });

  return normalizeAuthPayload(payload);
}

export async function signInPriceAlertUser(body = {}) {
  ensureSupabaseAuthConfigured();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) throw httpError("Informe e-mail e senha.", 400);

  const payload = await supabaseAuthFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });

  return normalizeAuthPayload(payload);
}

export async function getUserFromAuthorizationHeader(authHeader = "") {
  ensureSupabaseAuthConfigured();
  const token = extractBearerToken(authHeader);
  if (!token) throw httpError("Sessao ausente.", 401);

  const payload = await supabaseAuthFetch("/auth/v1/user", {
    token,
  });

  return normalizeUser(payload, token);
}

export async function listPriceAlerts(user) {
  ensureSupabaseConfigured();
  const params = new URLSearchParams({
    select: "*",
    user_id: `eq.${user.id}`,
    order: "created_at.desc",
  });
  const records = await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, { service: true });
  return Array.isArray(records) ? records.map(normalizeAlertRecord) : [];
}

export async function createPriceAlert(user, body = {}) {
  ensureSupabaseConfigured();
  const record = validatePriceAlertPayload(body, user);
  const params = new URLSearchParams({ select: "*" });
  const created = await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
    method: "POST",
    service: true,
    prefer: "return=representation",
    body: record,
  });
  return normalizeAlertRecord(firstRecord(created));
}

export async function updatePriceAlert(user, body = {}) {
  ensureSupabaseConfigured();
  const id = String(body.id || "").trim();
  if (!id) throw httpError("Informe o alerta que deve ser atualizado.", 400);

  const patch = {};
  if (body.status !== undefined) patch.status = normalizeAlertStatus(body.status);
  if (body.targetPrice !== undefined || body.target_price !== undefined) {
    patch.target_price = normalizePrice(body.targetPrice ?? body.target_price);
  }
  if (body.notificationChannel !== undefined || body.notification_channel !== undefined) {
    patch.notification_channel = normalizeNotificationChannel(body.notificationChannel ?? body.notification_channel);
  }
  if (!Object.keys(patch).length) throw httpError("Nenhuma alteracao enviada.", 400);

  patch.updated_at = new Date().toISOString();
  const params = new URLSearchParams({
    id: `eq.${id}`,
    user_id: `eq.${user.id}`,
    select: "*",
  });
  const updated = await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
    method: "PATCH",
    service: true,
    prefer: "return=representation",
    body: patch,
  });
  return normalizeAlertRecord(firstRecord(updated));
}

export async function deletePriceAlert(user, id) {
  ensureSupabaseConfigured();
  const cleanId = String(id || "").trim();
  if (!cleanId) throw httpError("Informe o alerta que deve ser removido.", 400);

  const params = new URLSearchParams({
    id: `eq.${cleanId}`,
    user_id: `eq.${user.id}`,
  });
  await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
    method: "DELETE",
    service: true,
  });
  return { ok: true, deletedId: cleanId };
}

export async function listPendingAlertNotifications(options = {}) {
  ensureSupabaseConfigured();
  const limit = clamp(Number(options.limit || 100), 1, 500);
  const params = new URLSearchParams({
    select: "*",
    status: "eq.pending",
    order: "created_at.asc",
    limit: String(limit),
  });
  const records = await supabaseRestFetch(`/${NOTIFICATIONS_TABLE}?${params.toString()}`, { service: true });
  return Array.isArray(records) ? records.map(normalizeNotificationRecord) : [];
}

export async function updateAlertNotificationStatus(body = {}) {
  ensureSupabaseConfigured();
  const id = String(body.id || "").trim();
  if (!id) throw httpError("Informe a notificacao que deve ser atualizada.", 400);

  const status = normalizeNotificationStatus(body.status);
  const patch = {
    status,
    error_message: status === "failed" ? String(body.errorMessage || body.error_message || "").trim() : null,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  };

  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
  });
  const updated = await supabaseRestFetch(`/${NOTIFICATIONS_TABLE}?${params.toString()}`, {
    method: "PATCH",
    service: true,
    prefer: "return=representation",
    body: patch,
  });
  return normalizeNotificationRecord(firstRecord(updated));
}

export async function evaluatePriceAlerts(products = [], options = {}) {
  ensureSupabaseConfigured();
  const limit = clamp(Number(options.limit || DEFAULT_MATCH_LIMIT), 1, DEFAULT_MATCH_LIMIT);
  const activeAlerts = await getActiveAlertsForMatching();
  const matches = [];

  for (const alert of activeAlerts) {
    const product = findBestProductMatch(alert, products);
    if (!product) continue;
    if (!shouldNotify(alert, product)) continue;
    const match = buildAlertMatch(alert, product);
    matches.push(match);
    if (matches.length >= limit) break;
  }

  if (options.markNotified && matches.length) {
    await markMatchesAsNotified(matches);
  }

  return {
    ok: true,
    configured: true,
    matches,
    count: matches.length,
    checkedAlerts: activeAlerts.length,
    checkedProducts: Array.isArray(products) ? products.length : 0,
    fetchedAt: new Date().toISOString(),
  };
}

export function canEvaluateAlerts(request) {
  const token = env.N8N_INGEST_TOKEN;
  if (!token) return true;
  const authHeader = String(request.headers.authorization || "");
  const n8nHeader = String(request.headers["x-n8n-token"] || "");
  return authHeader === `Bearer ${token}` || n8nHeader === token;
}

async function getActiveAlertsForMatching() {
  const params = new URLSearchParams({
    select: "*",
    status: "eq.active",
    order: "created_at.asc",
    limit: "1000",
  });
  const records = await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, { service: true });
  return Array.isArray(records) ? records.map(normalizeAlertRecord) : [];
}

function findBestProductMatch(alert, products) {
  const source = normalizeSourceFilter(alert.source);
  const queryTerms = tokenize(alert.productQuery);
  const brandTerms = tokenize(alert.brand);
  let bestMatch = null;
  let bestScore = -1;

  for (const product of Array.isArray(products) ? products : []) {
    const price = normalizePrice(product.price, { allowNull: true });
    if (price === null || price > alert.targetPrice) continue;
    if (source !== "all" && normalizeSourceFilter(product.sourceKind || product.source) !== source) continue;

    if (matchesSavedProduct(alert, product)) {
      const exactScore = 1000 + Math.max(0, alert.targetPrice - price) / Math.max(alert.targetPrice, 1);
      if (exactScore > bestScore) {
        bestMatch = product;
        bestScore = exactScore;
      }
      continue;
    }

    const text = normalizeSearchText([
      product.title,
      product.seller,
      product.source,
      product.query,
    ].join(" "));
    if (!termsMatch(text, queryTerms) || !termsMatch(text, brandTerms)) continue;

    const score = queryTerms.length + brandTerms.length + Math.max(0, alert.targetPrice - price) / Math.max(alert.targetPrice, 1);
    if (score > bestScore) {
      bestMatch = product;
      bestScore = score;
    }
  }

  return bestMatch;
}

function matchesSavedProduct(alert, product) {
  const currentKey = normalizeComparable(productKey(product));
  const currentId = normalizeComparable(product.id);
  const currentUrl = normalizeComparable(product.url);

  return Boolean(
    (alert.productKey && currentKey && normalizeComparable(alert.productKey) === currentKey)
    || (alert.productId && currentId && normalizeComparable(alert.productId) === currentId)
    || (alert.productUrl && currentUrl && normalizeComparable(alert.productUrl) === currentUrl)
  );
}

function termsMatch(text, terms) {
  return terms.every((term) => text.includes(term));
}

function shouldNotify(alert, product) {
  const key = productKey(product);
  if (alert.matchedProductKey !== key) return true;
  if (!alert.lastNotifiedAt) return true;
  const last = new Date(alert.lastNotifiedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > 24 * 60 * 60 * 1000;
}

function buildAlertMatch(alert, product) {
  return {
    alertId: alert.id,
    userId: alert.userId,
    userEmail: alert.userEmail,
    userName: alert.userName,
    whatsappPhone: alert.whatsappPhone,
    notificationChannel: alert.notificationChannel,
    productQuery: alert.productQuery,
    targetPrice: alert.targetPrice,
    product: {
      id: String(product.id || ""),
      key: productKey(product),
      title: String(product.title || ""),
      price: normalizePrice(product.price, { allowNull: true }),
      originalPrice: normalizePrice(product.originalPrice, { allowNull: true }),
      discountPercent: normalizePrice(product.discountPercent, { allowNull: true }),
      currency: product.currency || "BRL",
      source: product.source || "",
      sourceKind: product.sourceKind || "",
      url: product.url || "",
      image: product.image || "",
      seller: product.seller || "",
    },
    message: buildMatchMessage(alert, product),
    matchedAt: new Date().toISOString(),
  };
}

function buildMatchMessage(alert, product) {
  const price = normalizePrice(product.price, { allowNull: true });
  const priceText = price === null ? "preco nao informado" : formatCurrency(price);
  return `Encontramos ${product.title} por ${priceText}, dentro do alvo de ${formatCurrency(alert.targetPrice)}. Link: ${product.url || "indisponivel"}`;
}

async function markMatchesAsNotified(matches) {
  for (const match of matches) {
    const notificationChannels = channelsForNotification(match.notificationChannel);
    for (const channel of notificationChannels) {
      await supabaseRestFetch(`/${NOTIFICATIONS_TABLE}`, {
        method: "POST",
        service: true,
        prefer: "return=minimal",
        body: {
          alert_id: match.alertId,
          user_id: match.userId,
          channel,
          product_key: match.product.key,
          product_title: match.product.title,
          product_price: match.product.price,
          product_url: match.product.url,
          message: match.message,
          status: "pending",
        },
      }).catch(() => null);
    }

    const params = new URLSearchParams({
      id: `eq.${match.alertId}`,
      select: "id",
    });
    await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
      method: "PATCH",
      service: true,
      prefer: "return=minimal",
      body: {
        last_notified_at: new Date().toISOString(),
        matched_product_key: match.product.key,
        updated_at: new Date().toISOString(),
      },
    });
  }
}

function channelsForNotification(channel) {
  return channel === "both" ? ["email", "whatsapp"] : [normalizeNotificationChannel(channel)];
}

function validatePriceAlertPayload(body, user) {
  const productQuery = String(body.productQuery || body.product_query || "").trim();
  const brand = String(body.brand || "").trim();
  const targetPrice = normalizePrice(body.targetPrice ?? body.target_price);
  const source = normalizeSourceFilter(body.source || "all");
  const notificationChannel = normalizeNotificationChannel(body.notificationChannel || body.notification_channel || "email");
  const notificationEmail = normalizeEmail(body.notificationEmail || body.notification_email || user.email);
  const whatsappPhone = normalizePhone(body.whatsappPhone || body.whatsapp_phone || user.phone);
  const selectedProduct = normalizeSelectedProduct(body.product || body.selectedProduct || body.selected_product || {});

  if (productQuery.length < 3) throw httpError("Informe o produto com pelo menos 3 caracteres.", 400);
  if (!targetPrice || targetPrice <= 0) throw httpError("Informe um preco alvo valido.", 400);
  if (["email", "both"].includes(notificationChannel) && !notificationEmail) {
    throw httpError("Informe um e-mail para receber o alerta.", 400);
  }
  if (["whatsapp", "both"].includes(notificationChannel) && !whatsappPhone) {
    throw httpError("Informe um WhatsApp para receber o alerta.", 400);
  }

  return {
    user_id: user.id,
    user_email: notificationEmail,
    user_name: user.name || "",
    whatsapp_phone: whatsappPhone,
    product_query: productQuery,
    product_id: selectedProduct.id,
    product_key: selectedProduct.key,
    product_title: selectedProduct.title,
    product_url: selectedProduct.url,
    product_image: selectedProduct.image,
    product_source_label: selectedProduct.source,
    product_current_price: selectedProduct.currentPrice,
    product_original_price: selectedProduct.originalPrice,
    product_currency: selectedProduct.currency,
    brand,
    source,
    target_price: targetPrice,
    notification_channel: notificationChannel,
    status: "active",
  };
}

function normalizeAlertRecord(record = {}) {
  return {
    id: String(record.id || ""),
    userId: String(record.user_id || ""),
    userEmail: String(record.user_email || ""),
    userName: String(record.user_name || ""),
    whatsappPhone: String(record.whatsapp_phone || ""),
    productQuery: String(record.product_query || ""),
    productId: String(record.product_id || ""),
    productKey: String(record.product_key || ""),
    productTitle: String(record.product_title || ""),
    productUrl: String(record.product_url || ""),
    productImage: String(record.product_image || ""),
    productSourceLabel: String(record.product_source_label || ""),
    productCurrentPrice: normalizePrice(record.product_current_price, { allowNull: true }),
    productOriginalPrice: normalizePrice(record.product_original_price, { allowNull: true }),
    productCurrency: String(record.product_currency || "BRL"),
    product: {
      id: String(record.product_id || ""),
      key: String(record.product_key || ""),
      title: String(record.product_title || ""),
      url: String(record.product_url || ""),
      image: String(record.product_image || ""),
      source: String(record.product_source_label || ""),
      currentPrice: normalizePrice(record.product_current_price, { allowNull: true }),
      originalPrice: normalizePrice(record.product_original_price, { allowNull: true }),
      currency: String(record.product_currency || "BRL"),
    },
    brand: String(record.brand || ""),
    source: normalizeSourceFilter(record.source || "all"),
    targetPrice: normalizePrice(record.target_price, { allowNull: true }),
    notificationChannel: normalizeNotificationChannel(record.notification_channel || "email"),
    status: normalizeAlertStatus(record.status || "active"),
    lastNotifiedAt: String(record.last_notified_at || ""),
    matchedProductKey: String(record.matched_product_key || ""),
    createdAt: String(record.created_at || ""),
    updatedAt: String(record.updated_at || ""),
  };
}

function normalizeNotificationRecord(record = {}) {
  return {
    id: String(record.id || ""),
    alertId: String(record.alert_id || ""),
    userId: String(record.user_id || ""),
    channel: String(record.channel || ""),
    productKey: String(record.product_key || ""),
    productTitle: String(record.product_title || ""),
    productPrice: normalizePrice(record.product_price, { allowNull: true }),
    productUrl: String(record.product_url || ""),
    message: String(record.message || ""),
    status: normalizeNotificationStatus(record.status || "pending"),
    errorMessage: String(record.error_message || ""),
    sentAt: String(record.sent_at || ""),
    createdAt: String(record.created_at || ""),
  };
}

function normalizeAuthPayload(payload = {}) {
  const user = normalizeUser(payload.user || payload, payload.access_token || payload.session?.access_token || "");
  const accessToken = payload.access_token || payload.session?.access_token || "";
  const refreshToken = payload.refresh_token || payload.session?.refresh_token || "";
  return {
    ok: true,
    user,
    session: accessToken ? {
      accessToken,
      refreshToken,
      expiresAt: payload.expires_at || "",
      expiresIn: payload.expires_in || "",
    } : null,
    requiresEmailConfirmation: Boolean(user.id && !accessToken),
  };
}

async function inspectSupabaseOAuthUrl(authUrl, provider) {
  try {
    const response = await fetch(authUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
    });

    if (response.status >= 300 && response.status < 400) return { ok: true };
    if (response.status < 400) return { ok: true };

    const message = await readOAuthErrorMessage(response);
    if (response.status === 400 && /unsupported provider|provider is not enabled/i.test(message)) {
      return {
        ok: false,
        code: `${provider || "google"}-provider-disabled`,
        message: "Login com Google ainda nao foi habilitado no Supabase.",
      };
    }

    return {
      ok: false,
      code: `${provider || "google"}-provider-error`,
      message: message || "Nao foi possivel iniciar o login social.",
    };
  } catch {
    return { ok: true };
  }
}

async function readOAuthErrorMessage(response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";
  try {
    const payload = JSON.parse(text);
    return String(payload.msg || payload.message || payload.error_description || payload.error || text);
  } catch {
    return text;
  }
}

function normalizeUser(user = {}) {
  const metadata = user.user_metadata || user.raw_user_meta_data || {};
  const email = normalizeEmail(user.email);
  return {
    id: String(user.id || ""),
    email,
    name: String(metadata.full_name || metadata.name || user.name || email.split("@")[0] || "").trim(),
    phone: normalizePhone(metadata.phone || user.phone || ""),
    avatarUrl: String(metadata.avatar_url || metadata.picture || user.avatar_url || "").trim(),
  };
}

function normalizeSelectedProduct(product = {}) {
  const id = String(product.id || "").trim();
  const url = String(product.url || "").trim();
  const title = String(product.title || "").trim();
  const source = String(product.source || product.sourceLabel || "").trim();
  const sourceKind = normalizeSourceFilter(product.sourceKind || source);
  const key = String(product.key || product.productKey || (id ? `${source || sourceKind}:${id}` : "")).trim();

  if (!id && !url && !title) {
    return {
      id: "",
      key: "",
      title: "",
      url: "",
      image: "",
      source: "",
      currentPrice: null,
      originalPrice: null,
      currency: "BRL",
    };
  }

  return {
    id,
    key,
    title,
    url,
    image: String(product.image || "").trim(),
    source,
    currentPrice: normalizePrice(product.currentPrice ?? product.price, { allowNull: true }),
    originalPrice: normalizePrice(product.originalPrice, { allowNull: true }),
    currency: String(product.currency || "BRL").trim().toUpperCase() || "BRL",
    sourceKind,
  };
}

async function supabaseAuthFetch(pathname, options = {}) {
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: options.token ? `Bearer ${options.token}` : `Bearer ${env.SUPABASE_ANON_KEY}`,
  };
  return supabaseFetch(pathname, { ...options, headers });
}

async function supabaseRestFetch(pathname, options = {}) {
  const key = options.service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  if (options.prefer) headers.Prefer = options.prefer;
  return supabaseFetch(`/rest/v1${pathname}`, { ...options, headers });
}

async function supabaseFetch(pathname, options = {}) {
  const url = new URL(pathname, withTrailingSlash(env.SUPABASE_URL));
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail = payload?.msg || payload?.message || payload?.error_description || payload?.error || payload?.hint || payload?.raw || response.statusText;
    throw httpError(`Supabase HTTP ${response.status}: ${detail}`, response.status);
  }

  return payload;
}

function ensureSupabaseAuthConfigured() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw httpError("Configure SUPABASE_URL e SUPABASE_ANON_KEY.", 503);
  }
}

function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw httpError("Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.", 503);
  }
}

function firstRecord(payload) {
  if (Array.isArray(payload) && payload[0]) return payload[0];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  throw httpError("Registro nao encontrado no Supabase.", 404);
}

function productKey(product) {
  return `${product.source || product.sourceKind || "marketplace"}:${product.id || product.url || product.title}`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparable(value) {
  return String(value || "").trim().toLowerCase();
}

function tokenize(value) {
  return normalizeSearchText(value).split(" ").filter((term) => term.length >= 2);
}

function normalizePrice(value, options = {}) {
  if (value === null || value === undefined || value === "") return options.allowNull ? null : 0;
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(2)) : options.allowNull ? null : 0;
  const raw = String(value)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return options.allowNull ? null : 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;
  if (hasComma && hasDot) {
    normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : options.allowNull ? null : 0;
}

function normalizeSourceFilter(value) {
  const normalized = String(value || "all").toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("amazon")) return "amazon";
  if (normalized.includes("mercado")) return "mercadolivre";
  if (["mercadolivre", "ml"].includes(normalized)) return "mercadolivre";
  return "all";
}

function normalizeNotificationChannel(value) {
  const normalized = String(value || "email").toLowerCase();
  if (["whatsapp", "both"].includes(normalized)) return normalized;
  return "email";
}

function normalizeAlertStatus(value) {
  return String(value || "active").toLowerCase() === "paused" ? "paused" : "active";
}

function normalizeNotificationStatus(value) {
  const normalized = String(value || "pending").toLowerCase();
  if (["sent", "failed"].includes(normalized)) return normalized;
  return "pending";
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function extractBearerToken(authHeader) {
  const match = String(authHeader || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function httpError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function withTrailingSlash(value) {
  return String(value || "").endsWith("/") ? value : `${value}/`;
}

function loadEnvFiles(filePaths) {
  const values = {};
  for (const filePath of filePaths) {
    for (const [key, value] of Object.entries(loadEnvFile(filePath))) {
      if (value !== "") values[key] = value;
    }
  }
  return { ...values, ...process.env };
}

function loadEnvFile(filePath) {
  const values = {};
  if (!existsSync(filePath)) return values;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
