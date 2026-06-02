import { getFeedProducts } from "../../server/n8n-feed.js";

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.status(405).json({ ok: false, error: "Metodo nao permitido" });
    return;
  }

  try {
    const url = new URL(request.url || "/api/feed/products", `https://${request.headers.host || "localhost"}`);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(await getFeedProducts(url.searchParams));
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "RAD-GEN-001 - Falha operacional. Consulte o codigo informado.",
    });
  }
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
