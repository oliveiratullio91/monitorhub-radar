import { getFeedProducts, getN8nProducts, ingestN8nProducts } from "../../server/n8n-feed.js";

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  try {
    const url = new URL(request.url || "/api/n8n/products", `https://${request.headers.host || "localhost"}`);
    const publicFeed = url.pathname === "/api/feed/products" || url.searchParams.get("publicFeed") === "1";

    if (request.method === "GET") {
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(await (publicFeed ? getFeedProducts(url.searchParams) : getN8nProducts(url.searchParams)));
      return;
    }

    if (request.method === "POST") {
      if (!canWriteFeed(request)) {
        response.status(401).json({ ok: false, code: "RAD-FEED-002", error: "RAD-FEED-002 - Token de ingestao invalido" });
        return;
      }

      const payload = await readBody(request);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(await ingestN8nProducts(payload));
      return;
    }

    response.setHeader("Allow", "GET, POST, OPTIONS");
    response.status(405).json({ ok: false, error: "Metodo nao permitido" });
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado",
    });
  }
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-N8N-Token");
}

function canWriteFeed(request) {
  const token = process.env.N8N_INGEST_TOKEN;
  if (!token) return true;

  const authHeader = String(request.headers.authorization || "");
  const n8nHeader = String(request.headers["x-n8n-token"] || "");
  return authHeader === `Bearer ${token}` || n8nHeader === token;
}

async function readBody(request) {
  if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString("utf8") || "{}");
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
