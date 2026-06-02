import { readJsonBody, setCorsHeaders } from "../_body.js";
import { getN8nProducts } from "../../server/n8n-feed.js";
import { dispatchPendingAlertNotifications } from "../../server/notification-dispatcher.js";
import {
  canEvaluateAlerts,
  evaluatePriceAlerts,
  listPendingAlertNotifications,
  updateAlertNotificationStatus,
} from "../../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (!["GET", "PATCH", "POST"].includes(request.method)) return response.status(405).json({ ok: false, error: "Metodo nao permitido" });

  try {
    if (!canEvaluateAlerts(request)) {
      return response.status(401).json({ ok: false, code: "RAD-FEED-002", error: "RAD-FEED-002 - Token de ingestao invalido" });
    }

    response.setHeader("Cache-Control", "no-store");

    if (request.method === "GET") {
      const url = new URL(request.url || "/api/alerts/notifications", `https://${request.headers.host || "localhost"}`);
      const notifications = await listPendingAlertNotifications({ limit: url.searchParams.get("limit") || 100 });
      return response.status(200).json({ ok: true, notifications, count: notifications.length });
    }

    if (request.method === "POST") {
      const url = new URL(request.url || "/api/alerts/notifications", `https://${request.headers.host || "localhost"}`);
      const body = await readJsonBody(request).catch(() => ({}));
      const limit = body.limit || url.searchParams.get("limit") || 100;
      const shouldEvaluate = parseBoolean(body.evaluate ?? url.searchParams.get("evaluate"));
      let evaluation = null;

      if (shouldEvaluate) {
        const products = Array.isArray(body.products)
          ? body.products
          : (await getN8nProducts(new URLSearchParams({ limit: String(body.productLimit || url.searchParams.get("productLimit") || 1000) }))).products;
        evaluation = await evaluatePriceAlerts(products, {
          limit: body.productLimit || url.searchParams.get("productLimit") || 1000,
          markNotified: true,
        });
      }

      const dispatch = await dispatchPendingAlertNotifications({
        limit,
        dryRun: body.dryRun ?? url.searchParams.get("dryRun"),
        channel: body.channel || url.searchParams.get("channel") || "",
      });
      return response.status(200).json({ ok: true, evaluation, dispatch });
    }

    const notification = await updateAlertNotificationStatus(await readJsonBody(request));
    return response.status(200).json({ ok: true, notification });
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado nas notificacoes",
    });
  }
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}
