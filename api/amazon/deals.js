import { getAmazonDeals } from "../../server/amazon-deals-page.js";

export default async function handler(request, response) {
  try {
    const url = new URL(request.url || "/api/amazon/deals", `https://${request.headers.host || "localhost"}`);
    const payload = await getAmazonDeals(url.searchParams);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(payload);
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      products: [],
      errors: [error.message || "Erro inesperado ao consultar ofertas da Amazon"],
      fetchedAt: new Date().toISOString(),
    });
  }
}
