import { getProducts } from "../server/marketplaces.js";
import { indexCatalogProducts, listProductCatalog } from "../server/supabase-alerts.js";
import {
  decodeMercadoLivreTokenCookie,
  mercadoLivreTokenCookie,
} from "./_mercadolivre-oauth.js";

export default async function handler(request, response) {
  try {
    const url = new URL(request.url || "/api/products", `https://${request.headers.host || "localhost"}`);
    if (url.searchParams.get("catalog") === "1") {
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(await listProductCatalog(url.searchParams));
      return;
    }

    const mercadoLivreAuth = decodeMercadoLivreTokenCookie(request);
    const payload = await getProducts(url.searchParams, {
      mercadoLivreAuth,
      onMercadoLivreAuthUpdate(updatedAuth) {
        response.setHeader("Set-Cookie", mercadoLivreTokenCookie(updatedAuth));
      },
    });
    const catalog = await indexCatalogProducts(payload.products || []);
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({ ...payload, catalogIndexed: catalog.indexed || 0 });
  } catch (error) {
    response.status(Number(error.status || 500)).json({
      ok: false,
      error: error.message || "Erro inesperado",
    });
  }
}
