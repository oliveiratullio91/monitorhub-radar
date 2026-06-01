import { readJsonBody, setCorsHeaders } from "../_body.js";
import { getN8nProducts } from "../../server/n8n-feed.js";
import { canEvaluateAlerts, evaluatePriceAlerts } from "../../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (!["GET", "POST"].includes(request.method)) return response.status(405).json({ ok: false, error: "Metodo nao permitido" });

  try {
    if (!canEvaluateAlerts(request)) {
      return response.status(401).json({ ok: false, error: "Token do n8n invalido" });
    }

    const url = new URL(request.url || "/api/alerts/evaluate", `https://${request.headers.host || "localhost"}`);
    const body = request.method === "POST" ? await readJsonBody(request).catch(() => ({})) : {};
    const products = Array.isArray(body.products)
      ? body.products
      : (await getN8nProducts(new URLSearchParams({ limit: String(body.limit || url.searchParams.get("limit") || 1000) }))).products;
    const payload = await evaluatePriceAlerts(products, {
      limit: body.limit || url.searchParams.get("limit") || 1000,
      markNotified: parseBoolean(body.markNotified ?? url.searchParams.get("markNotified")),
    });

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(payload);
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado ao avaliar alertas",
      matches: [],
    });
  }
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}
