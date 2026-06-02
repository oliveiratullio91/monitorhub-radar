const AMAZON_DEALS_URL = "https://www.amazon.com.br/deals";
const AMAZON_BASE_URL = "https://www.amazon.com.br";
const PAGE_SIZE = 30;
const MAX_LIMIT = 500;
const MAX_PAGES = 20;
const AAPI_SUBRESOURCES = [
  "title(product.offer.title/v1)",
  "links(product.links/v2)",
  "brandLogo(product.brand-logo/v1).logo(brand.logo/v1)",
  "buyingOptions[].dealBadge(product.deal-badge/v1)",
  "buyingOptions[].dealDetails(product.deal-details/v1)",
  "productImages(product.product-images/v2)",
  "buyingOptions[].price(product.price/v1)",
  "productCategory(product.offer.product-category/v1)",
].map((subresource) => `rankedPromotions[].product(product/v2).${subresource}`).join(",");

export async function getAmazonDeals(searchParams = new URLSearchParams()) {
  const limit = clamp(Number(searchParams.get("limit") || 120), 1, MAX_LIMIT);
  const maxPages = clamp(Number(searchParams.get("pages") || Math.ceil(limit / PAGE_SIZE)), 1, MAX_PAGES);
  const sourceUrl = normalizeDealsUrl(searchParams.get("url"));
  const errors = [];
  const products = [];
  const seen = new Set();
  const fetchedAt = new Date().toISOString();

  const page = await fetchDealsPage(sourceUrl);
  if (isChallengePage(page.html)) {
    return {
      ok: false,
      partial: false,
      products: [],
      errors: ["Amazon exibiu verificacao anti-bot na pagina de ofertas."],
      count: 0,
      sourcePage: sourceUrl,
      fetchedAt,
    };
  }

  const config = extractWidgetConfig(page.html);
  const initialProducts = Array.isArray(config?.productSearchResponse?.products)
    ? config.productSearchResponse.products
    : [];

  for (const product of initialProducts.map((item, index) => normalizeHtmlProduct(item, index, fetchedAt))) {
    pushUnique(products, seen, product, limit);
  }

  if (!config?.marketplaceId || !config?.aapiConfig?.uri || !config?.csrfToken) {
    errors.push("Amazon: configuracao interna de paginacao nao foi encontrada; apenas o primeiro lote foi coletado.");
  } else if (products.length < limit && maxPages > 1) {
    const remainingPages = Math.max(0, Math.min(maxPages - 1, Math.ceil((limit - products.length) / PAGE_SIZE)));
    const cookieHeader = buildCookieHeader(page.setCookies);
    let nextIndex = Number(config.productSearchResponse?.nextIndex || products.length || PAGE_SIZE);

    for (let pageIndex = 0; pageIndex < remainingPages; pageIndex += 1) {
      try {
        const payload = await fetchAapiDealsPage({
          config,
          cookieHeader,
          startIndex: nextIndex,
          pageSize: PAGE_SIZE,
        });
        const rankedPromotions = Array.isArray(payload?.entity?.rankedPromotions)
          ? payload.entity.rankedPromotions
          : [];

        if (!rankedPromotions.length) break;

        for (const promotion of rankedPromotions.map((item, index) => normalizeAapiPromotion(item, nextIndex + index, fetchedAt))) {
          pushUnique(products, seen, promotion, limit);
        }

        const newNextIndex = Number(payload?.entity?.nextIndex);
        if (!Number.isFinite(newNextIndex) || newNextIndex <= nextIndex) break;
        nextIndex = newNextIndex;
        if (products.length >= limit) break;
      } catch (error) {
        errors.push(`Amazon pagina ${pageIndex + 2}: ${error.message || "falha ao consultar ofertas"}`);
        break;
      }
    }
  }

  if (!products.length && !errors.length) {
    errors.push("Amazon: nenhuma oferta encontrada na pagina de ofertas.");
  }

  return {
    ok: errors.length === 0,
    partial: errors.length > 0 && products.length > 0,
    products,
    errors,
    count: products.length,
    sourcePage: sourceUrl,
    fetchedAt,
  };
}

async function fetchDealsPage(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: amazonHtmlHeaders(),
  });
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Amazon HTTP ${response.status}: ${html.slice(0, 160)}`);
  }
  return { html, setCookies: getSetCookieHeaders(response.headers) };
}

async function fetchAapiDealsPage({ config, cookieHeader, startIndex, pageSize }) {
  const url = new URL(`api/marketplaces/${config.marketplaceId}/promotions`, config.aapiConfig.uri);
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("startIndex", String(startIndex));
  url.searchParams.set("calculateRefinements", "false");
  url.searchParams.set("_enableNestedRefs", "true");
  url.searchParams.set("rankingContext", JSON.stringify({
    pageTypeId: config.renderingContext?.pageId || "deals",
    rankGroup: config.symphonyConfig?.rankingStrategy || "PARENT_ASIN_RANKING",
  }));
  url.searchParams.set("filters", JSON.stringify(config.symphonyConfig?.filterInfo || {
    includedDepartments: [],
    excludedDepartments: [],
    includedTags: [],
    excludedTags: ["EINKBF25"],
    promotionTypes: ["LIGHTNING_DEAL", "BEST_DEAL"],
    accessTypes: [],
    brandIds: [],
    unifiedIds: [],
  }));

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "pt-BR",
      Accept: `application/vnd.com.amazon.api+json; type="promotions.search.result/v1"; expand="${AAPI_SUBRESOURCES}"; experiments="BadgeColors_4da10b4,promotions_search_mlt_3flcd"`,
      "x-api-csrf-token": config.csrfToken,
      "x-cc-currency-of-preference": config.currencyIsoCode || "BRL",
      Cookie: cookieHeader,
      Origin: AMAZON_BASE_URL,
      Referer: AMAZON_DEALS_URL,
      "User-Agent": amazonUserAgent(),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
  }
  return JSON.parse(text);
}

function normalizeHtmlProduct(product, index, fetchedAt) {
  const asin = String(product?.asin || `amazon-deal-${index + 1}`);
  const price = toNumber(product?.price?.priceToPay?.price);
  const originalPrice = toNumber(product?.price?.basisPrice?.price);
  const badge = fragmentText(product?.dealBadge?.label);
  const messaging = fragmentText(product?.dealBadge?.messaging);
  const discountPercent = parseDiscount(badge) || calculateDiscount(price, originalPrice);
  const dealDetails = product?.dealDetails || {};
  const image = buildImageUrl(product?.image?.hiRes) || buildImageUrl(product?.image?.lowRes);

  return {
    id: asin,
    title: String(product?.title || product?.image?.altText || "").trim(),
    price,
    originalPrice,
    discountPercent,
    currency: "BRL",
    url: normalizeAmazonProductUrl(product?.link, asin),
    image,
    seller: "Amazon",
    availability: messaging || dealDetails.state || "Oferta Amazon",
    source: "Amazon Ofertas do Dia",
    sourceKind: "amazon",
    query: "Ofertas do Dia Amazon",
    fetchedAt,
    opportunityScore: discountPercent ? Math.min(100, Math.max(1, Math.round(70 + discountPercent))) : null,
    promotionId: String(dealDetails.id || ""),
    promotionType: String(dealDetails.type || "AMAZON_DEALS_PAGE"),
    promotionName: badge || messaging || "Ofertas do Dia",
    notes: discountPercent ? `${Math.round(discountPercent)}% OFF nas Ofertas do Dia Amazon` : "Oferta listada na pagina de Ofertas do Dia Amazon",
  };
}

function normalizeAapiPromotion(promotion, index, fetchedAt) {
  const entity = promotion?.product?.entity || {};
  const asin = String(entity.asin || `amazon-deal-${index + 1}`);
  const buyingOption = entity.buyingOptions?.[0] || {};
  const priceEntity = buyingOption.price?.entity || {};
  const dealBadge = buyingOption.dealBadge?.entity || {};
  const dealDetails = buyingOption.dealDetails?.entity || {};
  const title = entity.title?.entity?.displayString || "";
  const image = firstAapiImage(entity.productImages?.entity?.images);
  const price = toNumber(priceEntity.priceToPay?.moneyValueOrRange?.value?.amount);
  const originalPrice = toNumber(priceEntity.basisPrice?.moneyValueOrRange?.value?.amount);
  const badge = fragmentText(dealBadge.label);
  const messaging = fragmentText(dealBadge.messaging);
  const discountPercent = toNumber(priceEntity.savings?.percentage?.value)
    || parseDiscount(badge)
    || calculateDiscount(price, originalPrice);
  const brand = entity.brandLogo?.entity?.logo?.entity?.altText || "Amazon";

  return {
    id: asin,
    title: String(title).trim(),
    price,
    originalPrice,
    discountPercent,
    currency: priceEntity.priceToPay?.moneyValueOrRange?.value?.currencyCode || "BRL",
    url: normalizeAmazonProductUrl(entity.links?.entity?.viewOnAmazon?.url, asin),
    image,
    seller: String(brand).trim(),
    availability: messaging || dealDetails.state || "Oferta Amazon",
    source: "Amazon Ofertas do Dia",
    sourceKind: "amazon",
    query: "Ofertas do Dia Amazon",
    fetchedAt,
    opportunityScore: discountPercent ? Math.min(100, Math.max(1, Math.round(70 + discountPercent))) : null,
    promotionId: String(dealDetails.id || ""),
    promotionType: String(dealDetails.type || "AMAZON_DEALS_AAPI"),
    promotionName: badge || messaging || "Ofertas do Dia",
    notes: discountPercent ? `${Math.round(discountPercent)}% OFF nas Ofertas do Dia Amazon` : "Oferta listada na pagina de Ofertas do Dia Amazon",
  };
}

function extractWidgetConfig(html) {
  const widgetSlots = [...String(html || "").matchAll(/assets\.mountWidget\('([^']+)'/g)].map((match) => match[1]);
  for (const slot of widgetSlots) {
    const rawConfig = extractJsonObjectAfter(html, `assets.mountWidget('${slot}'`);
    if (!rawConfig || !rawConfig.includes("productSearchResponse")) continue;
    try {
      const config = JSON.parse(rawConfig);
      if (config?.productSearchResponse) return config;
    } catch {
      // Try the next widget before falling back to the embedded response.
    }
  }

  const rawResponse = extractJsonObjectAfter(html, '"productSearchResponse":');
  if (!rawResponse) return {};
  try {
    return { productSearchResponse: JSON.parse(rawResponse) };
  } catch {
    return {};
  }
}

function extractJsonObjectAfter(text, marker) {
  const markerIndex = String(text || "").indexOf(marker);
  if (markerIndex === -1) return "";
  const start = text.indexOf("{", markerIndex + marker.length);
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function normalizeDealsUrl(rawUrl) {
  if (!rawUrl) return AMAZON_DEALS_URL;
  try {
    const url = new URL(rawUrl, AMAZON_BASE_URL);
    if (!url.hostname.endsWith("amazon.com.br")) return AMAZON_DEALS_URL;
    return url.toString();
  } catch {
    return AMAZON_DEALS_URL;
  }
}

function normalizeAmazonUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl, AMAZON_BASE_URL);
    const tag = String(process.env.AMAZON_PARTNER_TAG || "").trim();
    if (tag && !url.searchParams.has("tag")) url.searchParams.set("tag", tag);
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeAmazonProductUrl(rawUrl, asin) {
  return normalizeAmazonUrl(rawUrl) || (asin ? normalizeAmazonUrl(`/dp/${encodeURIComponent(asin)}`) : "");
}

function firstAapiImage(images = []) {
  const main = images.find((image) => image.variant === "MAIN") || images[0] || {};
  return buildImageUrl(main.hiRes) || buildImageUrl(main.lowRes);
}

function buildImageUrl(image) {
  if (!image) return "";
  if (image.baseUrl) return `${image.baseUrl}.${image.extension || "jpg"}`;
  if (image.physicalId) return `https://m.media-amazon.com/images/I/${image.physicalId}.${image.extension || "jpg"}`;
  return "";
}

function fragmentText(value) {
  const fragments = value?.content?.fragments || value?.shortContent?.fragments || [];
  return fragments.map((fragment) => fragment.text || "").join(" ").replace(/\s+/g, " ").trim();
}

function parseDiscount(text) {
  const match = String(text || "").match(/(\d+(?:[,.]\d+)?)\s*%\s*(?:off|OFF)?/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function calculateDiscount(price, originalPrice) {
  if (!price || !originalPrice || originalPrice <= price) return null;
  return Number((((originalPrice - price) / originalPrice) * 100).toFixed(2));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function pushUnique(products, seen, product, limit) {
  if (!product?.id || !product?.title || !product?.url || products.length >= limit) return;
  const key = `${product.source}:${product.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  products.push(product);
}

function buildCookieHeader(setCookies = []) {
  return setCookies.map((cookie) => String(cookie).split(";")[0]).filter(Boolean).join("; ");
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,]+=)/);
}

function amazonHtmlHeaders() {
  return {
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "User-Agent": amazonUserAgent(),
  };
}

function amazonUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 MonitorHub/1.0";
}

function isChallengePage(html) {
  return /captcha|Robot Check|Digite os caracteres|Enter the characters/i.test(html);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
