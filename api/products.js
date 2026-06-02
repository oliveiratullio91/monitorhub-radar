import { getProducts } from "../server/marketplaces.js";
import { getN8nProducts } from "../server/n8n-feed.js";
import { getAmazonDeals } from "../server/amazon-deals-page.js";
import { getMercadoLivreOffers } from "../server/mercadolivre-offers-page.js";
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
    const catalog = await listProductCatalog(searchParams);
    if (catalog.products?.length) return catalog;
    const fallbackProducts = await getCatalogFallbackProducts(searchParams);
    const fallbackCatalog = buildCatalogSuggestionsFromProducts(fallbackProducts, searchParams);
    return fallbackCatalog.products.length
      ? {
        ...fallbackCatalog,
        catalogFallback: true,
        warning: "RAD-DATA-002 - Catalogo vazio; usando ofertas atuais.",
      }
      : catalog;
  } catch (error) {
    const fallbackProducts = await getCatalogFallbackProducts(searchParams);
    return {
      ...buildCatalogSuggestionsFromProducts(fallbackProducts, searchParams),
      catalogFallback: true,
      warning: "RAD-DATA-002 - Catalogo temporariamente indisponivel; usando oportunidades recentes.",
    };
  }
}

async function getCatalogFallbackProducts(searchParams) {
  const limit = Math.max(200, Math.min(Number(searchParams.get("sourceLimit") || 2000), 2000));
  const feed = await getN8nProducts(new URLSearchParams({ limit: String(limit) })).catch(() => null);
  if (feed?.products?.length) return feed.products;

  const offerLimit = Math.min(Number(searchParams.get("offerLimit") || 160), 240);
  const [mercadoLivre, amazon] = await Promise.all([
    getMercadoLivreOffers(new URLSearchParams({ limit: String(offerLimit), pages: "4" })).catch(() => null),
    getAmazonDeals(new URLSearchParams({ limit: String(offerLimit), pages: "2" })).catch(() => null),
  ]);

  return [
    ...(mercadoLivre?.products || []),
    ...(amazon?.products || []),
  ];
}
