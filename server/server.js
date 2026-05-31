import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorizeMercadoLivreFromCode,
  buildMercadoLivreAuthorizationUrl,
  getProducts,
  publicConfig,
  updateRuntimeEnv,
} from "./marketplaces.js";
import { getN8nProducts, ingestN8nProducts } from "./n8n-feed.js";
import { getMercadoLivreOffers } from "./mercadolivre-offers-page.js";
import { getAmazonDeals } from "./amazon-deals-page.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const siteDir = path.join(rootDir, "site");
const port = Number(process.env.PORT || 8080);
let mercadoLivreOAuthSession = null;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    if (url.pathname === "/api/config") {
      return sendJson(response, { ...publicConfig(), port });
    }

    if (url.pathname === "/api/products") {
      return sendJson(response, await getProducts(url.searchParams));
    }

    if (url.pathname === "/api/mercadolivre/offers") {
      return sendJson(response, await getMercadoLivreOffers(url.searchParams));
    }

    if (url.pathname === "/api/amazon/deals") {
      return sendJson(response, await getAmazonDeals(url.searchParams));
    }

    if (url.pathname === "/api/n8n/products") {
      if (request.method === "OPTIONS") return sendEmpty(response, 204);
      if (request.method === "GET") return sendJson(response, await getN8nProducts(url.searchParams));
      if (request.method === "POST") {
        if (!canWriteN8nFeed(request)) {
          return sendJson(response, { ok: false, error: "Token do n8n invalido" }, 401);
        }
        return sendJson(response, await ingestN8nProducts(await readJson(request)));
      }
      return sendJson(response, { ok: false, error: "Metodo nao permitido" }, 405);
    }

    if (url.pathname === "/api/mercadolivre/oauth/start" && request.method === "POST") {
      const body = await readJson(request);
      return startMercadoLivreOAuth(body, response);
    }

    if (url.pathname === "/api/mercadolivre/oauth/callback") {
      return finishMercadoLivreOAuth(url, response);
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    return sendJson(response, {
      ok: false,
      error: error.message || "Erro inesperado",
    }, Number(error.statusCode || error.status || 500));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Radar de Produtos em http://127.0.0.1:${port}`);
});

async function startMercadoLivreOAuth(body, response) {
  const clientId = String(body.clientId || "").trim();
  const clientSecret = String(body.clientSecret || "").trim();
  const redirectUri = String(body.redirectUri || `http://127.0.0.1:${port}/api/mercadolivre/oauth/callback`).trim();

  if (!clientId || !clientSecret) {
    return sendJson(response, {
      ok: false,
      error: "Informe APP ID e Secret Key do Mercado Livre.",
    }, 400);
  }

  const state = randomBase64Url(24);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  mercadoLivreOAuthSession = { state, codeVerifier, redirectUri };

  updateRuntimeEnv({
    MERCADO_LIVRE_ENABLED: "true",
    MERCADO_LIVRE_SITE_ID: "MLB",
    MERCADO_LIVRE_CLIENT_ID: clientId,
    MERCADO_LIVRE_CLIENT_SECRET: clientSecret,
    MERCADO_LIVRE_REDIRECT_URI: redirectUri,
  }, { persist: true });

  return sendJson(response, {
    ok: true,
    authUrl: buildMercadoLivreAuthorizationUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    }),
  });
}

async function finishMercadoLivreOAuth(url, response) {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return sendHtml(response, oauthHtml("Mercado Livre nao autorizado", errorDescription || error, false), 400);
  }

  if (!code) {
    return sendHtml(response, oauthHtml("Codigo ausente", "O Mercado Livre nao retornou o parametro code.", false), 400);
  }

  if (!mercadoLivreOAuthSession || state !== mercadoLivreOAuthSession.state) {
    return sendHtml(response, oauthHtml("Sessao expirada", "Volte para a tela de conexao e tente novamente.", false), 400);
  }

  try {
    const result = await authorizeMercadoLivreFromCode({
      code,
      redirectUri: mercadoLivreOAuthSession.redirectUri,
      codeVerifier: mercadoLivreOAuthSession.codeVerifier,
    });
    mercadoLivreOAuthSession = null;
    return sendHtml(response, oauthHtml(
      "Mercado Livre conectado",
      `Token salvo no .env. Usuario autorizado: ${result.userId || "nao informado"}.`,
      true,
    ));
  } catch (exchangeError) {
    return sendHtml(response, oauthHtml(
      "Falha ao trocar codigo por token",
      exchangeError.message || "Erro inesperado na autorizacao.",
      false,
    ), 500);
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Payload muito grande");
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function canWriteN8nFeed(request) {
  const token = process.env.N8N_INGEST_TOKEN;
  if (!token) return true;

  const authHeader = String(request.headers.authorization || "");
  const n8nHeader = String(request.headers["x-n8n-token"] || "");
  return authHeader === `Bearer ${token}` || n8nHeader === token;
}

function randomBase64Url(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function oauthHtml(title, message, success) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
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
      <section class="setup-card ${success ? "success" : "error"}">
        <span class="setup-kicker">${success ? "Conexao concluida" : "Conexao interrompida"}</span>
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
        <a class="primary-button" href="/">Voltar ao dashboard</a>
      </section>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function serveStatic(urlPath, response) {
  const requested = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(siteDir, requested));

  if (!filePath.startsWith(siteDir)) {
    return sendJson(response, { ok: false, error: "Caminho invalido" }, 403);
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    sendJson(response, { ok: false, error: "Arquivo nao encontrado" }, 404);
  }
}

function sendHtml(response, html, status = 200) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-N8N-Token",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-N8N-Token",
  });
  response.end();
}
