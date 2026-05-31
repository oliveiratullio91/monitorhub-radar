import { readJsonBody, setCorsHeaders } from "./_body.js";
import {
  createPriceAlert,
  deletePriceAlert,
  getUserFromAuthorizationHeader,
  listPriceAlerts,
  updatePriceAlert,
} from "../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();

  try {
    response.setHeader("Cache-Control", "no-store");
    const user = await getUserFromAuthorizationHeader(request.headers.authorization);

    if (request.method === "GET") {
      return response.status(200).json({ ok: true, alerts: await listPriceAlerts(user) });
    }

    if (request.method === "POST") {
      return response.status(200).json({ ok: true, alert: await createPriceAlert(user, await readJsonBody(request)) });
    }

    if (request.method === "PATCH") {
      return response.status(200).json({ ok: true, alert: await updatePriceAlert(user, await readJsonBody(request)) });
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url || "/api/alerts", `https://${request.headers.host || "localhost"}`);
      const body = await readJsonBody(request).catch(() => ({}));
      return response.status(200).json(await deletePriceAlert(user, url.searchParams.get("id") || body.id));
    }

    response.status(405).json({ ok: false, error: "Metodo nao permitido" });
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado nos alertas",
    });
  }
}
