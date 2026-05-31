const OFFERS_URL = "https://www.mercadolivre.com.br/ofertas";

export async function getMercadoLivreOffers(searchParams = new URLSearchParams()) {
  const maxPages = clamp(Number(searchParams.get("pages") || 5), 1, 20);
  const limit = clamp(Number(searchParams.get("limit") || 120), 1, 500);
  const startPage = clamp(Number(searchParams.get("startPage") || 1), 1, 200);
  const products = [];
  const errors = [];
  const seen = new Set();
  const pages = Array.from({ length: maxPages }, (_, index) => startPage + index);

  const pageResults = await Promise.all(pages.map(async (page) => {
    try {
      const html = await fetchOffersHtml(page);
      if (isChallengePage(html)) {
        return { page, products: [], error: `Pagina ${page}: Mercado Livre exibiu verificacao anti-bot.` };
      }

      const pageProducts = parseOffersHtml(html, page);
      if (!pageProducts.length) {
        return { page, products: [], error: `Pagina ${page}: nenhuma oferta encontrada no HTML.` };
      }

      return { page, products: pageProducts, error: "" };
    } catch (error) {
      return { page, products: [], error: `Pagina ${page}: ${error.message || "falha ao consultar ofertas"}` };
    }
  }));

  for (const result of pageResults.sort((a, b) => a.page - b.page)) {
    if (result.error) errors.push(result.error);
    for (const product of result.products) {
      const key = `${product.source}:${product.id || product.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      products.push(product);
      if (products.length >= limit) break;
    }
    if (products.length >= limit) break;
  }

  return {
    ok: errors.length === 0,
    partial: errors.length > 0 && products.length > 0,
    products,
    errors,
    count: products.length,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchOffersHtml(page) {
  const url = new URL(OFFERS_URL);
  if (page > 1) url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 MonitorHub/1.0",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 160)}`);
  }
  return text;
}

function parseOffersHtml(html, page) {
  const fetchedAt = new Date().toISOString();
  const cards = html.split(/<div class="andes-card poly-card/).slice(1);
  return cards
    .map((chunk, index) => parseOfferCard(`<div class="andes-card poly-card${chunk}`, page, index, fetchedAt))
    .filter((product) => product.id && product.title && product.url);
}

function parseOfferCard(cardHtml, page, index, fetchedAt) {
  const titleLink = findTitleLink(cardHtml);
  const image = decodeHtml(matchAttr(cardHtml, /<img[^>]*class="[^"]*poly-component__picture[^"]*"[^>]*>/i, "src"));
  const seller = stripTags(matchText(cardHtml, /<span[^>]*class="[^"]*poly-component__seller[^"]*"[^>]*>([\s\S]*?)<\/span>/i));
  const highlight = stripTags(matchText(cardHtml, /<span[^>]*class="[^"]*poly-component__highlight[^"]*"[^>]*>([\s\S]*?)<\/span>/i));
  const previousLabel = decodeHtml(matchText(cardHtml, /<s[^>]*class="[^"]*andes-money-amount--previous[^"]*"[^>]*aria-label="([^"]+)"/i));
  const currentBlock = matchText(cardHtml, /<div[^>]*class="[^"]*poly-price__current[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const currentLabel = decodeHtml(matchText(currentBlock, /aria-label="([^"]+)"/i));
  const discountText = stripTags(matchText(cardHtml, /<span[^>]*class="[^"]*(?:poly-price__disc_label|andes-money-amount__discount)[^"]*"[^>]*>([\s\S]*?)<\/span>/i));
  const price = parsePriceLabel(currentLabel);
  const originalPrice = parsePriceLabel(previousLabel);
  const discountPercent = parseDiscount(discountText) || calculateDiscount(price, originalPrice);
  const url = normalizeUrl(titleLink.href);

  return {
    id: extractMercadoLivreId(url) || `oferta-${page}-${index + 1}`,
    title: titleLink.title,
    price,
    originalPrice,
    discountPercent,
    currency: "BRL",
    url,
    image,
    seller: seller.replace(/^Por\s+/i, ""),
    availability: highlight || "Oferta Mercado Livre",
    source: "Mercado Livre Ofertas",
    sourceKind: "mercadolivre",
    query: `Ofertas Mercado Livre - pagina ${page}`,
    fetchedAt,
    opportunityScore: discountPercent ? Math.min(100, Math.max(1, Math.round(70 + discountPercent))) : null,
    promotionType: "OFERTAS_PAGE",
    promotionName: highlight || "Pagina de Ofertas",
    notes: discountPercent ? `${Math.round(discountPercent)}% OFF na pagina de ofertas` : "Oferta listada na pagina publica de ofertas",
  };
}

function findTitleLink(cardHtml) {
  const linkMatch = cardHtml.match(/<a\s+([^>]*class="[^"]*poly-component__title[^"]*"[^>]*)>([\s\S]*?)<\/a>/i);
  if (!linkMatch) return { href: "", title: "" };
  return {
    href: decodeHtml(matchAttributeFromTag(linkMatch[1], "href")),
    title: stripTags(linkMatch[2]),
  };
}

function matchAttr(html, elementPattern, attrName) {
  const element = html.match(elementPattern)?.[0] || "";
  return matchAttributeFromTag(element, attrName);
}

function matchAttributeFromTag(tag, attrName) {
  const match = String(tag || "").match(new RegExp(`${attrName}="([^"]*)"`, "i"));
  return match?.[1] || "";
}

function matchText(value, pattern) {
  return String(value || "").match(pattern)?.[1] || "";
}

function normalizeUrl(rawUrl) {
  return decodeHtml(rawUrl).replace(/&amp;/g, "&");
}

function extractMercadoLivreId(url) {
  try {
    const parsed = new URL(url);
    const wid = parsed.searchParams.get("wid");
    if (wid) return wid;
    const productMatch = parsed.pathname.match(/\/p\/(MLB\d+)/i);
    if (productMatch) return productMatch[1].toUpperCase();
    const itemMatch = parsed.pathname.match(/(MLB-?\d+)/i);
    if (itemMatch) return itemMatch[1].replace("-", "").toUpperCase();
  } catch {
    return "";
  }
  return "";
}

function parsePriceLabel(label) {
  const text = decodeHtml(label).toLowerCase();
  const reaisMatch = text.match(/([\d.]+)\s+reais?/i);
  if (!reaisMatch) return null;

  const reais = Number(reaisMatch[1].replace(/\./g, ""));
  const cents = Number(text.match(/(\d+)\s+centavos?/i)?.[1] || 0);
  if (!Number.isFinite(reais)) return null;
  return Number((reais + cents / 100).toFixed(2));
}

function parseDiscount(text) {
  const match = String(text || "").match(/(\d+(?:[,.]\d+)?)\s*%\s*OFF/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function calculateDiscount(price, originalPrice) {
  if (!price || !originalPrice || originalPrice <= price) return null;
  return Number((((originalPrice - price) / originalPrice) * 100).toFixed(2));
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function isChallengePage(html) {
  return /_bmstate|continue-button|\/anubis|verifyChallenge/i.test(html);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
