import { readJsonBody, setCorsHeaders } from "../_body.js";
import { getN8nProducts } from "../../server/n8n-feed.js";
import { dispatchPendingAlertNotifications } from "../../server/notification-dispatcher.js";
import { canEvaluateAlerts, evaluatePriceAlerts } from "../../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (!["GET", "POST"].includes(request.method)) return response.status(405).json({ ok: false, error: "Metodo nao permitido" });

  try {
    if (!canEvaluateAlerts(request)) {
      return response.status(401).json({ ok: false, code: "RAD-FEED-002", error: "RAD-FEED-002 - Token de ingestao invalido" });
    }

    const url = new URL(request.url || "/api/alerts/dispatch", `https://${request.headers.host || "localhost"}`);
    const body = request.method === "POST" ? await readJsonBody(request).catch(() => ({})) : {};
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

    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ ok: true, evaluation, dispatch });
  } catch (error) {
    return response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado ao enviar avisos",
    });
  }
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}
