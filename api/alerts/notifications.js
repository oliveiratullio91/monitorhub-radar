import { readJsonBody, setCorsHeaders } from "../_body.js";
import {
  canEvaluateAlerts,
  listPendingAlertNotifications,
  updateAlertNotificationStatus,
} from "../../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (!["GET", "PATCH"].includes(request.method)) return response.status(405).json({ ok: false, error: "Metodo nao permitido" });

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

    const notification = await updateAlertNotificationStatus(await readJsonBody(request));
    return response.status(200).json({ ok: true, notification });
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado nas notificacoes",
    });
  }
}
