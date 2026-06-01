import { readJsonBody, setCorsHeaders } from "../_body.js";
import {
  getUserFromAuthorizationHeader,
  signInPriceAlertUser,
  signUpPriceAlertUser,
} from "../../server/supabase-alerts.js";

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === "OPTIONS") return response.status(204).end();

  const action = getRouteAction(request);
  response.setHeader("Cache-Control", "no-store");

  try {
    if (action === "login") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      return response.status(200).json(await signInPriceAlertUser(await readJsonBody(request)));
    }

    if (action === "signup") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      return response.status(200).json(await signUpPriceAlertUser(await readJsonBody(request)));
    }

    if (action === "me") {
      if (request.method !== "GET") return methodNotAllowed(response, "GET");
      const user = await getUserFromAuthorizationHeader(request.headers.authorization);
      return response.status(200).json({ ok: true, user });
    }

    return response.status(404).json({ ok: false, error: "Rota de autenticacao nao encontrada" });
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado na autenticacao",
    });
  }
}

function getRouteAction(request) {
  const url = new URL(request.url || "/api/auth", `https://${request.headers.host || "localhost"}`);
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
}

function methodNotAllowed(response, allow) {
  response.setHeader("Allow", allow);
  return response.status(405).json({ ok: false, error: "Metodo nao permitido" });
}
