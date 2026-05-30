import {
  buildMercadoLivreAuthorizationUrl,
  codeChallengeFromVerifier,
  encodeCookiePayload,
  getRequestOrigin,
  oauthCookie,
  randomBase64Url,
} from "../../_mercadolivre-oauth.js";

export default async function handler(request, response) {
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
      error: "Cadastre MERCADO_LIVRE_CLIENT_ID e MERCADO_LIVRE_CLIENT_SECRET nas Environment Variables da Vercel.",
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
