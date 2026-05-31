import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const env = loadEnvFiles([
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), ".env.local"),
]);

export async function getMercadoLivrePromotions(searchParams = new URLSearchParams()) {
  const accessToken = await ensureAccessToken();
  const userId = String(env.MERCADO_LIVRE_USER_ID || "").trim();
  if (!accessToken || !userId) {
    throw new Error("Mercado Livre sem token/user id para consultar promocoes");
  }

  const maxPromotions = clamp(Number(searchParams.get("maxPromotions") || 20), 1, 50);
  const limitPerPromotion = clamp(Number(searchParams.get("limitPerPromotion") || searchParams.get("limit") || 50), 1, 100);
  const minDiscountPercent = Math.max(0, Number(searchParams.get("minDiscountPercent") || 1));
  const allowedTypes = new Set(String(searchParams.get("promotionTypes") || "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean));
  const errors = [];

  const campaignPayload = await fetchMercadoLivreJson(
    `/seller-promotions/users/${encodeURIComponent(userId)}?app_version=v2&limit=${maxPromotions}`,
    accessToken,
  );
  const campaigns = (Array.isArray(campaignPayload?.results) ? campaignPayload.results : [])
    .filter((campaign) => statusValue(campaign.status) === "started")
    .filter((campaign) => !allowedTypes.size || allowedTypes.has(String(campaign.type || "").trim()))
    .slice(0, maxPromotions);

  const promotedById = new Map();
  for (const campaign of campaigns) {
    const promotionId = String(campaign.id || "").trim();
    const promotionType = String(campaign.type || "").trim();
    if (!promotionId || !promotionType) continue;

    try {
      const itemPayload = await fetchMercadoLivreJson(
        `/seller-promotions/promotions/${encodeURIComponent(promotionId)}/items?promotion_type=${encodeURIComponent(promotionType)}&status=started&app_version=v2&limit=${limitPerPromotion}`,
        accessToken,
      );
      const items = Array.isArray(itemPayload?.results) ? itemPayload.results : [];
      for (const item of items) {
        const id = String(item.id || item.item_id || "").trim();
        const price = toNumber(item.price);
        const originalPrice = toNumber(item.original_price);
        const discountPercent = calculateDiscount(price, originalPrice);
        if (!id || !price || !originalPrice || originalPrice <= price || discountPercent < minDiscountPercent) continue;

        const current = promotedById.get(id);
        if (current && current.discountPercent >= discountPercent) continue;
        promotedById.set(id, {
          id,
          price,
          originalPrice,
          discountPercent,
          promotionId,
          promotionType,
          promotionName: String(campaign.name || promotionType),
          promotionStatus: statusValue(item.status) || "started",
        });
      }
    } catch (error) {
      errors.push(`Promocao ${promotionId}: ${error.message}`);
    }
  }

  const promotedItems = [...promotedById.values()];
  const detailsById = await fetchItemDetails(promotedItems.map((item) => item.id), accessToken, errors);
  const now = new Date().toISOString();
  const products = promotedItems
    .map((promo) => normalizePromotionProduct(promo, detailsById.get(promo.id), now))
    .sort((a, b) => (b.discountPercent || 0) - (a.discountPercent || 0));

  if (!products.length && !errors.length) {
    errors.push("Nenhuma promocao ativa com preco promocional/original foi encontrada para esta conta.");
  }

  return {
    ok: errors.length === 0,
    partial: errors.length > 0 && products.length > 0,
    products,
    errors,
    fetchedAt: now,
  };
}

async function fetchItemDetails(ids, accessToken, errors) {
  const detailsById = new Map();
  for (let index = 0; index < ids.length; index += 20) {
    const group = ids.slice(index, index + 20);
    try {
      const payload = await fetchMercadoLivreJson(`/items?ids=${group.join(",")}`, accessToken);
      for (const detail of Array.isArray(payload) ? payload : []) {
        const body = detail?.body || detail;
        if (body?.id) detailsById.set(String(body.id), body);
      }
    } catch (error) {
      errors.push(`Detalhes de ${group.length} itens: ${error.message}`);
    }
  }
  return detailsById;
}

function normalizePromotionProduct(promo, detail = {}, fetchedAt) {
  return {
    id: promo.id,
    title: String(detail?.title || promo.id),
    price: promo.price,
    originalPrice: promo.originalPrice,
    discountPercent: promo.discountPercent,
    currency: detail?.currency_id || "BRL",
    url: String(detail?.permalink || `https://produto.mercadolivre.com.br/${promo.id}`),
    image: detail?.secure_thumbnail || detail?.thumbnail || detail?.pictures?.[0]?.url || "",
    seller: detail?.seller?.nickname || String(detail?.seller_id || ""),
    availability: detail?.available_quantity ? `${detail.available_quantity} disponivel` : String(detail?.status || promo.promotionStatus),
    source: "Mercado Livre Promocoes",
    sourceKind: "mercadolivre",
    query: "Promocoes ativas Mercado Livre",
    fetchedAt,
    opportunityScore: Math.min(100, Math.max(1, Math.round(70 + promo.discountPercent))),
    promotionId: promo.promotionId,
    promotionType: promo.promotionType,
    promotionName: promo.promotionName,
    notes: `${promo.promotionName} (${promo.promotionType}) - ${Math.round(promo.discountPercent)}% OFF`,
  };
}

async function ensureAccessToken() {
  if (env.MERCADO_LIVRE_ACCESS_TOKEN && !isTokenExpiring()) {
    return env.MERCADO_LIVRE_ACCESS_TOKEN;
  }
  if (!env.MERCADO_LIVRE_CLIENT_ID || !env.MERCADO_LIVRE_CLIENT_SECRET || !env.MERCADO_LIVRE_REFRESH_TOKEN) {
    return env.MERCADO_LIVRE_ACCESS_TOKEN || "";
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.MERCADO_LIVRE_CLIENT_ID,
    client_secret: env.MERCADO_LIVRE_CLIENT_SECRET,
    refresh_token: env.MERCADO_LIVRE_REFRESH_TOKEN,
  });

  const payload = await fetchFormJson("https://api.mercadolibre.com/oauth/token", params);
  env.MERCADO_LIVRE_ACCESS_TOKEN = payload.access_token || env.MERCADO_LIVRE_ACCESS_TOKEN || "";
  env.MERCADO_LIVRE_REFRESH_TOKEN = payload.refresh_token || env.MERCADO_LIVRE_REFRESH_TOKEN || "";
  env.MERCADO_LIVRE_USER_ID = payload.user_id || env.MERCADO_LIVRE_USER_ID || "";
  env.MERCADO_LIVRE_TOKEN_EXPIRES_AT = payload.expires_in
    ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
    : "";
  return env.MERCADO_LIVRE_ACCESS_TOKEN;
}

function isTokenExpiring() {
  if (!env.MERCADO_LIVRE_TOKEN_EXPIRES_AT) return false;
  const expiresAt = new Date(env.MERCADO_LIVRE_TOKEN_EXPIRES_AT).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt - Date.now() < 5 * 60 * 1000;
}

async function fetchMercadoLivreJson(pathname, accessToken) {
  return fetchJson(`https://api.mercadolibre.com${pathname}`, {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "monitorhub-promocoes/1.0",
  });
}

async function fetchJson(url, headers = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`timeout apos ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) throwHttpError(response, payload);
  return payload;
}

async function fetchFormJson(url, params, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "monitorhub-promocoes/1.0",
      },
      body: params,
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`timeout apos ${Math.round(timeoutMs / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) throwHttpError(response, payload);
  return payload;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function throwHttpError(response, payload) {
  const detail = payload?.message || payload?.error_description || payload?.error || payload?.raw || response.statusText;
  const error = new Error(`HTTP ${response.status}: ${detail}`);
  error.status = response.status;
  throw error;
}

function loadEnvFiles(filePaths) {
  const values = {};
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index === -1) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value !== "") values[key] = value;
    }
  }
  return { ...values, ...process.env };
}

function statusValue(value) {
  return String(value?.id || value || "").toLowerCase();
}

function calculateDiscount(price, originalPrice) {
  if (!price || !originalPrice || originalPrice <= price) return 0;
  return Number((((originalPrice - price) / originalPrice) * 100).toFixed(2));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/\s/g, "").replace(/R\$/gi, "").replace(/[^0-9,.-]/g, "");
  if (!raw) return null;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;
  if (hasComma && hasDot) normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  else if (hasComma) normalized = raw.replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
