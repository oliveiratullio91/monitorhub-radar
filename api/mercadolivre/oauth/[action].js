import {
  buildMercadoLivreAuthorizationUrl,
  clearOauthCookie,
  codeChallengeFromVerifier,
  decodeCookiePayload,
  encodeCookiePayload,
  exchangeMercadoLivreCode,
  getCookie,
  getRequestOrigin,
  mercadoLivreTokenCookie,
  oauthCookie,
  oauthHtml,
  randomBase64Url,
} from "../../_mercadolivre-oauth.js";

export default async function handler(request, response) {
  const action = getRouteAction(request);

  if (action === "start") return startMercadoLivreOAuth(request, response);
  if (action === "callback") return finishMercadoLivreOAuth(request, response);

  return response.status(404).json({ ok: false, error: "Rota OAuth do Mercado Livre nao encontrada" });
}

function startMercadoLivreOAuth(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, error: "Metodo nao permitido" });
  }

  const body = typeof request.body === "object" && request.body ? request.body : {};
  const clientId = process.env.MERCADO_LIVRE_CLIENT_ID || String(body.clientId || "").trim();
  const clientSecret = process.env.MERCADO_LIVRE_CLIENT_SECRET || String(body.clientSecret || "").trim();
  const redirectUri = process.env.MERCADO_LIVRE_REDIRECT_URI
    || String(body.redirectUri || `${getRequestOrigin(request)}/api/mercadolivre/oauth/callback`).trim();

  if (!clientId || !clientSecret) {
    return response.status(400).json({
      ok: false,
      code: "RAD-ENV-001",
      error: "RAD-ENV-001 - Credenciais OAuth ausentes no ambiente online.",
    });
  }

  const state = randomBase64Url(24);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = codeChallengeFromVerifier(codeVerifier);
  const cookiePayload = encodeCookiePayload({ state, codeVerifier, redirectUri });

  response.setHeader("Set-Cookie", oauthCookie(cookiePayload));
  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json({
    ok: true,
    authUrl: buildMercadoLivreAuthorizationUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    }),
  });
}

async function finishMercadoLivreOAuth(request, response) {
  const url = new URL(request.url || "/api/mercadolivre/oauth/callback", `https://${request.headers.host || "localhost"}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");

  if (error) {
    response.setHeader("Set-Cookie", clearOauthCookie());
    return response.status(400).send(oauthHtml("Mercado Livre nao autorizado", errorDescription || error));
  }

  const session = decodeCookiePayload(getCookie(request, "ml_oauth"));
  if (!code || !session || state !== session.state) {
    response.setHeader("Set-Cookie", clearOauthCookie());
    return response.status(400).send(oauthHtml(
      "Sessao expirada",
      "Volte para a tela de conexao e inicie a autorizacao novamente.",
    ));
  }

  try {
    const payload = await exchangeMercadoLivreCode({
      code,
      redirectUri: session.redirectUri,
      codeVerifier: session.codeVerifier,
    });
    const expiresAt = payload.expires_in
      ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
      : "";
    const sessionPayload = {
      accessToken: payload.access_token || "",
      refreshToken: payload.refresh_token || "",
      expiresAt,
      userId: payload.user_id || "",
    };
    const env = [
      `MERCADO_LIVRE_ACCESS_TOKEN=${payload.access_token || ""}`,
      `MERCADO_LIVRE_REFRESH_TOKEN=${payload.refresh_token || ""}`,
      `MERCADO_LIVRE_TOKEN_EXPIRES_AT=${expiresAt}`,
      `MERCADO_LIVRE_USER_ID=${payload.user_id || ""}`,
    ].join("\n");

    response.setHeader("Set-Cookie", [
      clearOauthCookie(),
      mercadoLivreTokenCookie(sessionPayload),
    ]);
    return response.status(200).send(oauthHtml(
      "Mercado Livre autorizado",
      "Sessao conectada ao Mercado Livre. O dashboard ja pode buscar anuncios reais neste navegador. As variaveis abaixo continuam disponiveis caso voce queira persistir a integracao no ambiente online.",
      { success: true, env },
    ));
  } catch (exchangeError) {
    response.setHeader("Set-Cookie", clearOauthCookie());
    return response.status(500).send(oauthHtml(
      "Falha ao trocar codigo por token",
      exchangeError.message || "Erro inesperado na autorizacao.",
    ));
  }
}

function getRouteAction(request) {
  const url = new URL(request.url || "/api/mercadolivre/oauth", `https://${request.headers.host || "localhost"}`);
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
}
