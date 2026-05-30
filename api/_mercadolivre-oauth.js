import { createHash, randomBytes } from "node:crypto";

export function getRequestOrigin(request) {
  const proto = request.headers["x-forwarded-proto"] || "https";
  const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
  return `${proto}://${host}`;
}

export function randomBase64Url(bytes) {
  return randomBytes(bytes).toString("base64url");
}

export function codeChallengeFromVerifier(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildMercadoLivreAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "offline_access read");
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export async function exchangeMercadoLivreCode({ code, redirectUri, codeVerifier }) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.MERCADO_LIVRE_CLIENT_ID || "",
    client_secret: process.env.MERCADO_LIVRE_CLIENT_SECRET || "",
    code,
    redirect_uri: redirectUri,
  });

  if (codeVerifier) params.set("code_verifier", codeVerifier);

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "radar-produtos/1.0",
    },
    body: params,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error_description || payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

export function getCookie(request, name) {
  const raw = request.headers.cookie || "";
  return raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

export function encodeCookiePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCookiePayload(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function oauthCookie(value) {
  return `ml_oauth=${value}; Path=/api/mercadolivre/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=900`;
}

export function clearOauthCookie() {
  return "ml_oauth=; Path=/api/mercadolivre/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export function oauthHtml(title, message, options = {}) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const envBlock = options.env
    ? `<pre>${escapeHtml(options.env)}</pre>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="setup-page">
      <section class="setup-card ${options.success ? "success" : "error"}">
        <span class="setup-kicker">${options.success ? "Conexao concluida" : "Conexao interrompida"}</span>
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
        ${envBlock}
        <a class="primary-button" href="/">Voltar ao dashboard</a>
      </section>
    </main>
  </body>
</html>`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
