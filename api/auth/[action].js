import { readJsonBody, setCorsHeaders } from "../_body.js";
import {
  getUserFromAuthorizationHeader,
  refreshPriceAlertSession,
  resolveSupabaseOAuthRedirect,
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

    if (action === "refresh") {
      if (request.method !== "POST") return methodNotAllowed(response, "POST");
      return response.status(200).json(await refreshPriceAlertSession(await readJsonBody(request)));
    }

    if (action === "me") {
      if (request.method !== "GET") return methodNotAllowed(response, "GET");
      const user = await getUserFromAuthorizationHeader(request.headers.authorization);
      return response.status(200).json({ ok: true, user });
    }

    if (action === "google") {
      if (request.method !== "GET") return methodNotAllowed(response, "GET");
      const url = new URL(request.url || "/api/auth/google", `https://${request.headers.host || "localhost"}`);
      const origin = getRequestOrigin(request);
      const redirectTo = safeRedirectTo(url.searchParams.get("redirectTo"), origin);
      const failureTo = safeRedirectTo(url.searchParams.get("failureTo"), origin, "/index.html");
      const oauth = await resolveSupabaseOAuthRedirect("google", redirectTo);
      response.writeHead(302, {
        Location: oauth.ok ? oauth.url : withAuthError(failureTo, oauth.code),
        "Cache-Control": "no-store",
      });
      return response.end();
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

function getRequestOrigin(request) {
  const protocol = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  return `${protocol}://${host}`;
}

function safeRedirectTo(value, origin, fallbackPath = "/produtos.html") {
  try {
    const fallback = new URL(fallbackPath, origin);
    if (!value) return fallback.toString();
    const candidate = new URL(value, origin);
    return candidate.origin === fallback.origin ? candidate.toString() : fallback.toString();
  } catch {
    return new URL(fallbackPath, origin).toString();
  }
}

function withAuthError(redirectUrl, code = "google-provider-error") {
  const target = new URL(redirectUrl);
  target.searchParams.set("authError", code);
  return target.toString();
}
