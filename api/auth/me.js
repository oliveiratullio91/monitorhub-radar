import { setCorsHeaders } from "../_body.js";
import { getUserFromAuthorizationHeader } from "../../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ ok: false, error: "Metodo nao permitido" });

  try {
    response.setHeader("Cache-Control", "no-store");
    const user = await getUserFromAuthorizationHeader(request.headers.authorization);
    response.status(200).json({ ok: true, user });
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Sessao invalida",
    });
  }
}
