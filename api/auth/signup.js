import { readJsonBody, setCorsHeaders } from "../_body.js";
import { signUpPriceAlertUser } from "../../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Metodo nao permitido" });

  try {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(await signUpPriceAlertUser(await readJsonBody(request)));
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado no cadastro",
    });
  }
}
