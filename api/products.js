import { getProducts } from "../server/marketplaces.js";
import { getN8nProducts } from "../server/n8n-feed.js";
import {
  buildCatalogSuggestionsFromProducts,
  indexCatalogProducts,
  listProductCatalog,
} from "../server/supabase-alerts.js";
import {
  decodeMercadoLivreTokenCookie,
  mercadoLivreTokenCookie,
} from "./_mercadolivre-oauth.js";

export default async function handler(request, response) {
  try {
    const url = new URL(request.url || "/api/products", `https://${request.headers.host || "localhost"}`);
    if (url.searchParams.get("catalog") === "1") {
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(await getCatalogProducts(url.searchParams));
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

async function getCatalogProducts(searchParams) {
  try {
    return await listProductCatalog(searchParams);
  } catch (error) {
    const fallbackProducts = await getCatalogFallbackProducts(searchParams);
    return {
      ...buildCatalogSuggestionsFromProducts(fallbackProducts, searchParams),
      catalogFallback: true,
      warning: error.message || "Catalogo Supabase indisponivel; usando feed local.",
    };
  }
}

async function getCatalogFallbackProducts(searchParams) {
  const limit = Math.max(200, Math.min(Number(searchParams.get("sourceLimit") || 2000), 2000));
  const feed = await getN8nProducts(new URLSearchParams({ limit: String(limit) })).catch(() => null);
  if (feed?.products?.length) return feed.products;
  return [];
}
