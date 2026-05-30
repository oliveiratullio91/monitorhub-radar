import { getProducts } from "../server/marketplaces.js";

export default async function handler(request, response) {
  try {
    const url = new URL(request.url || "/api/products", `https://${request.headers.host || "localhost"}`);
    const payload = await getProducts(url.searchParams);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(payload);
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado",
    });
  }
}
