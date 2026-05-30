import {
  clearOauthCookie,
  decodeCookiePayload,
  exchangeMercadoLivreCode,
  getCookie,
  oauthHtml,
} from "../../_mercadolivre-oauth.js";

export default async function handler(request, response) {
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
    const env = [
      `MERCADO_LIVRE_ACCESS_TOKEN=${payload.access_token || ""}`,
      `MERCADO_LIVRE_REFRESH_TOKEN=${payload.refresh_token || ""}`,
      `MERCADO_LIVRE_TOKEN_EXPIRES_AT=${expiresAt}`,
      `MERCADO_LIVRE_USER_ID=${payload.user_id || ""}`,
    ].join("\n");

    response.setHeader("Set-Cookie", clearOauthCookie());
    return response.status(200).send(oauthHtml(
      "Mercado Livre autorizado",
      "Copie as variaveis abaixo para as Environment Variables da Vercel e faca um novo deploy para ativar a coleta real.",
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
