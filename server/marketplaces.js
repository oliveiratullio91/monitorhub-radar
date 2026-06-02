import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ApiClient,
  SearchItemsRequestContent,
  SearchItemsResource,
  TypedDefaultApi,
} from "amazon-creators-api";
import { getAmazonDeals } from "./amazon-deals-page.js";
import { getMercadoLivreOffers } from "./mercadolivre-offers-page.js";

const envPath = path.resolve(process.cwd(), ".env");
const localEnvPath = path.resolve(process.cwd(), ".env.local");
const env = loadEnvFiles([envPath, localEnvPath]);

const DEMO_CATALOG = [
  {
    id: "demo-notebook-dell-i5",
    title: "Notebook Dell Inspiron i5 8GB SSD 256GB",
    basePrice: 2849.9,
    query: "notebook",
    seller: "Catalogo local",
    url: "https://lista.mercadolivre.com.br/notebook-dell-i5",
  },
  {
    id: "demo-fone-jbl-520bt",
    title: "Fone Bluetooth JBL Tune 520BT",
    basePrice: 239.9,
    query: "fone bluetooth",
    seller: "Catalogo local",
    url: "https://www.amazon.com.br/s?k=fone+bluetooth+jbl",
  },
  {
    id: "demo-galaxy-a55",
    title: "Smartphone Samsung Galaxy A55 5G 128GB",
    basePrice: 1899.0,
    query: "smartphone",
    seller: "Catalogo local",
    url: "https://lista.mercadolivre.com.br/galaxy-a55-5g",
  },
  {
    id: "demo-monitor-lg-ultragear",
    title: "Monitor 27 LG UltraGear Full HD 144Hz",
    basePrice: 1199.9,
    query: "monitor gamer",
    seller: "Catalogo local",
    url: "https://www.amazon.com.br/s?k=monitor+lg+ultragear+27",
  },
  {
    id: "demo-ps5-digital",
    title: "Console PlayStation 5 Slim Digital Edition",
    basePrice: 3299.0,
    query: "ps5 digital",
    seller: "Catalogo local",
    url: "https://lista.mercadolivre.com.br/ps5-digital",
  },
  {
    id: "demo-echo-dot",
    title: "Echo Dot 5a Geracao com Alexa",
    basePrice: 349.0,
    query: "echo dot",
    seller: "Catalogo local",
    url: "https://www.amazon.com.br/s?k=echo+dot+5",
  },
  {
    id: "demo-ssd-kingston",
    title: "SSD Kingston NV2 1TB NVMe M.2",
    basePrice: 419.9,
    query: "ssd 1tb nvme",
    seller: "Catalogo local",
    url: "https://lista.mercadolivre.com.br/ssd-1tb-nvme",
  },
  {
    id: "demo-mouse-logitech",
    title: "Mouse Logitech MX Master 3S Sem Fio",
    basePrice: 529.9,
    query: "mouse logitech",
    seller: "Catalogo local",
    url: "https://www.amazon.com.br/s?k=mouse+logitech+mx+master+3s",
  },
  {
    id: "demo-air-fryer",
    title: "Air Fryer Mondial 4L 1500W",
    basePrice: 299.9,
    query: "air fryer",
    seller: "Catalogo local",
    url: "https://lista.mercadolivre.com.br/air-fryer-4l",
  },
  {
    id: "demo-teclado-mecanico",
    title: "Teclado Mecanico Redragon Kumara RGB",
    basePrice: 219.9,
    query: "teclado mecanico",
    seller: "Catalogo local",
    url: "https://www.amazon.com.br/s?k=teclado+mecanico+redragon+kumara",
  },
  {
    id: "demo-iphone-13",
    title: "iPhone 13 128GB Seminovo",
    basePrice: 2799.0,
    query: "iphone 13 128gb",
    seller: "Catalogo local",
    url: "https://lista.mercadolivre.com.br/iphone-13-128gb",
  },
  {
    id: "demo-camera-webcam",
    title: "Webcam Full HD Logitech C920s",
    basePrice: 429.9,
    query: "webcam full hd",
    seller: "Catalogo local",
    url: "https://www.amazon.com.br/s?k=webcam+logitech+c920s",
  },
];

export function publicConfig(options = {}) {
  const mercadoLivreConfigured = isMercadoLivreConfigured();
  const amazonConfigured = isAmazonConfigured();
  const mercadoLivreSessionConfigured = Boolean(options.mercadoLivreAuth?.accessToken || options.mercadoLivreAuth?.refreshToken);

  return {
    demoAvailable: false,
    mercadoLivreEnabled: toBool(env.MERCADO_LIVRE_ENABLED, true),
    mercadoLivreConfigured: mercadoLivreConfigured || mercadoLivreSessionConfigured,
    mercadoLivreSiteId: env.MERCADO_LIVRE_SITE_ID || "MLB",
    mercadoLivreOAuthReady: Boolean(env.MERCADO_LIVRE_CLIENT_ID && env.MERCADO_LIVRE_CLIENT_SECRET),
    mercadoLivreMode: mercadoLivreSessionConfigured ? "session" : mercadoLivreConfigured ? "token" : "missing-token",
    mercadoLivreRedirectUri: env.MERCADO_LIVRE_REDIRECT_URI || "",
    amazonEnabled: toBool(env.AMAZON_ENABLED, true),
    amazonConfigured,
    amazonProvider: env.AMAZON_ENDPOINT_URL ? "endpoint" : "creators",
    realSourcesReady: mercadoLivreConfigured || mercadoLivreSessionConfigured || amazonConfigured,
    requiredSourceCodes: {
      mercadoLivre: mercadoLivreConfigured || mercadoLivreSessionConfigured ? [] : ["RAD-ML-002"],
      amazon: amazonConfigured ? [] : ["RAD-AMZ-002"],
    },
  };
}

export function updateRuntimeEnv(values, options = {}) {
  const cleanValues = Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );

  Object.assign(env, cleanValues);
  if (options.persist && canWriteEnvFile()) {
    writeEnvValues(envPath, cleanValues);
  }
}

export function buildMercadoLivreAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "offline_access read");
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export async function authorizeMercadoLivreFromCode({ code, redirectUri, codeVerifier }) {
  if (!env.MERCADO_LIVRE_CLIENT_ID || !env.MERCADO_LIVRE_CLIENT_SECRET) {
    throw new Error("RAD-ML-002 - Credenciais OAuth ausentes.");
  }

  const payload = await requestMercadoLivreToken({
    grant_type: "authorization_code",
    client_id: env.MERCADO_LIVRE_CLIENT_ID,
    client_secret: env.MERCADO_LIVRE_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  persistMercadoLivreTokenPayload(payload);
  return {
    userId: payload.user_id,
    expiresAt: env.MERCADO_LIVRE_TOKEN_EXPIRES_AT,
  };
}

export async function getProducts(searchParams, options = {}) {
  const requestedLimit = clamp(Number(searchParams.get("limit") || 12), 1, 2000);
  const apiLimit = Math.min(requestedLimit, 50);
  const sources = parseSources(searchParams.get("sources") || "mercadolivre,amazon");
  const fallbackMode = String(searchParams.get("fallback") || "none").toLowerCase();
  const allowDemoFallback = !["0", "false", "none", "off"].includes(fallbackMode);
  const mercadoLivreQuery = searchParams.get("mercadoLivreQuery") || searchParams.get("query") || "notebook";
  const amazonQuery = searchParams.get("amazonQuery") || searchParams.get("query") || "fone bluetooth";
  const errors = [];
  const productGroups = [];
  let fallback = { active: false };

  if (sources.has("demo")) {
    productGroups.push(
      getDemoProducts({ limit: requestedLimit }).catch((error) => {
        errors.push(formatSourceError("Demo", error));
        return [];
      }),
    );
  }

  if (sources.has("mercadolivre") && toBool(env.MERCADO_LIVRE_ENABLED, true)) {
    productGroups.push(
      getMercadoLivreProducts({ query: mercadoLivreQuery, limit: apiLimit }, options).catch((error) => {
        errors.push(formatSourceError("Mercado Livre", error));
        return [];
      }),
    );
  }

  if (sources.has("amazon") && toBool(env.AMAZON_ENABLED, true)) {
    productGroups.push(
      getAmazonProducts({ query: amazonQuery, limit: apiLimit }).catch((error) => {
        errors.push(formatSourceError("Amazon", error));
        return [];
      }),
    );
  }

  let products = (await Promise.all(productGroups)).flat();
  if (hasRealSourceRequest(sources) && products.length < requestedLimit) {
    const publicOffers = await getPublicOfferProducts({ sources, limit: requestedLimit - products.length });
    products = mergeProductsByKey(products, publicOffers.products, requestedLimit);

    if (publicOffers.products.length) {
      fallback = {
        active: true,
        source: "public-offers",
        reason: "Ofertas publicas reais ativas: a vitrine esta usando oportunidades do Mercado Livre e da Amazon enquanto novos destaques sao avaliados.",
      };
      errors.splice(0, errors.length, ...errors.filter((error) => !isResolvedByPublicOffers(error)));
    } else {
      errors.push(...publicOffers.errors);
    }
  }

  if (!products.length && allowDemoFallback && !sources.has("demo") && hasRealSourceRequest(sources) && errors.length) {
    products = await getDemoProducts({ limit: requestedLimit });
    fallback = {
      active: true,
      source: "demo",
      reason: "Fontes em revisao; exibindo catalogo de referencia enquanto novas oportunidades sao avaliadas.",
    };
  }

  return {
    ok: errors.length === 0,
    partial: errors.length > 0 && products.length > 0,
    products: products.slice(0, requestedLimit),
    errors,
    fallback,
    fetchedAt: new Date().toISOString(),
    config: publicConfig(options),
  };
}

async function getPublicOfferProducts({ sources, limit }) {
  const tasks = [];
  const perSourceLimit = Math.min(Math.max(limit, 1), 500);
  const mercadoLivrePages = Math.min(20, Math.max(1, Math.ceil(perSourceLimit / 45)));
  const amazonPages = Math.min(20, Math.max(1, Math.ceil(perSourceLimit / 30)));

  if (sources.has("mercadolivre") && toBool(env.MERCADO_LIVRE_ENABLED, true)) {
    tasks.push(
      getMercadoLivreOffers(new URLSearchParams({
        limit: String(perSourceLimit),
        pages: String(mercadoLivrePages),
      })).then((payload) => ({
        source: "Mercado Livre",
        products: payload.products || [],
        errors: payload.errors || [],
      })).catch((error) => ({
        source: "Mercado Livre",
        products: [],
        errors: [error.message || "falha ao consultar ofertas publicas"],
      })),
    );
  }

  if (sources.has("amazon") && toBool(env.AMAZON_ENABLED, true)) {
    tasks.push(
      getAmazonDeals(new URLSearchParams({
        limit: String(perSourceLimit),
        pages: String(amazonPages),
      })).then((payload) => ({
        source: "Amazon",
        products: payload.products || [],
        errors: payload.errors || [],
      })).catch((error) => ({
        source: "Amazon",
        products: [],
        errors: [error.message || "falha ao consultar ofertas publicas"],
      })),
    );
  }

  const payloads = await Promise.all(tasks);
  return {
    products: payloads.flatMap((payload) => payload.products),
    errors: payloads.flatMap((payload) => payload.errors.map((error) => `${payload.source} ofertas: ${error}`)),
  };
}

function mergeProductsByKey(currentProducts = [], nextProducts = [], limit = 2000) {
  const byKey = new Map();
  for (const product of [...currentProducts, ...nextProducts]) {
    if (!product?.id || !product?.title) continue;
    const key = `${product.sourceKind || product.source || "fonte"}:${product.id || product.url || product.title}`;
    if (!byKey.has(key)) byKey.set(key, product);
    if (byKey.size >= limit) break;
  }
  return [...byKey.values()];
}

function isResolvedByPublicOffers(error) {
  return /MERCADO_LIVRE_ACCESS_TOKEN|AMAZON_PARTNER_TAG|AMAZON_CREDENTIAL|conta conectada sem itens|sem itens publicados|HTTP 403|permissoes/i.test(String(error || ""));
}

function loadEnvFiles(filePaths) {
  const values = {};
  for (const filePath of filePaths) {
    for (const [key, value] of Object.entries(loadEnvFile(filePath))) {
      if (value !== "") values[key] = value;
    }
  }
  return { ...values, ...process.env };
}

function loadEnvFile(filePath) {
  const values = {};
  if (!existsSync(filePath)) return values;

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
    values[key] = value;
  }
  return values;
}

function writeEnvValues(filePath, values) {
  const current = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = current ? current.split(/\r?\n/) : [];
  const pending = new Map(Object.entries(values));
  const updated = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !pending.has(match[1])) return line;

    const key = match[1];
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${formatEnvValue(value)}`;
  });

  if (pending.size) {
    if (updated.length && updated[updated.length - 1].trim()) updated.push("");
    for (const [key, value] of pending) {
      updated.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  writeFileSync(filePath, `${updated.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

function canWriteEnvFile() {
  return !process.env.VERCEL;
}

function formatEnvValue(value) {
  const raw = String(value);
  if (!raw || /^[A-Za-z0-9._:/?&=+%,-]+$/.test(raw)) return raw;
  return JSON.stringify(raw);
}

async function getDemoProducts({ limit }) {
  const fetchedAt = new Date().toISOString();
  return DEMO_CATALOG.slice(0, limit).map((record, index) => ({
    id: record.id,
    title: record.title,
    price: applyDemoPulse(record.basePrice, index),
    currency: "BRL",
    url: record.url,
    image: "",
    seller: record.seller,
    availability: "Simulacao local",
    source: "Demo",
    sourceKind: "demo",
    query: record.query,
    fetchedAt,
  }));
}

async function getMercadoLivreProducts({ query, limit }, options = {}) {
  const accessToken = await ensureMercadoLivreAccessToken(options);
  if (!accessToken) {
    throw new Error("RAD-ML-002 - Fonte Mercado Livre aguardando autorizacao.");
  }

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  const userId = getMercadoLivreUserId(options);

  try {
    return await getMercadoLivreSearchProducts({ query, limit, authHeaders });
  } catch (error) {
    if (![401, 403].includes(Number(error.status)) || !canRefreshMercadoLivreToken(options)) {
      return getMercadoLivreSellerProducts({ query, limit, accessToken, userId, searchError: error }).catch((sellerError) => {
        throw resolveMercadoLivreFallbackError({ sellerError, searchError: error, userId });
      });
    }

    const refreshedToken = await refreshMercadoLivreToken(options.mercadoLivreAuth?.refreshToken, !options.mercadoLivreAuth);
    if (options.mercadoLivreAuth && options.onMercadoLivreAuthUpdate) {
      options.onMercadoLivreAuthUpdate(refreshedToken.auth);
    }

    const refreshedHeaders = {
      Authorization: `Bearer ${refreshedToken.accessToken}`,
      Accept: "application/json",
    };

    try {
      return await getMercadoLivreSearchProducts({ query, limit, authHeaders: refreshedHeaders });
    } catch (retryError) {
      return getMercadoLivreSellerProducts({
        query,
        limit,
        accessToken: refreshedToken.accessToken,
        userId: refreshedToken.auth.userId || userId,
        searchError: retryError,
      }).catch((sellerError) => {
        throw resolveMercadoLivreFallbackError({
          sellerError,
          searchError: retryError,
          userId: refreshedToken.auth.userId || userId,
        });
      });
    }
  }
}

async function getMercadoLivreSearchProducts({ query, limit, authHeaders }) {
  const siteId = env.MERCADO_LIVRE_SITE_ID || "MLB";
  const url = new URL(`https://api.mercadolibre.com/sites/${siteId}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "price_asc");

  const payload = await fetchJson(url, authHeaders);
  return firstArray(payload, "mercadolivre").map((record) => normalizeMercadoLivre(record, query));
}

async function getMercadoLivreSellerProducts({ query, limit, accessToken, userId, searchError }) {
  if (!userId) {
    throw new Error("usuario Mercado Livre nao identificado");
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  const ids = await getMercadoLivreSellerItemIds({ userId, limit, headers });
  if (!ids.length && searchError) {
    const error = new Error("conta conectada sem itens publicados retornados pela API");
    error.status = Number(searchError.status) || 404;
    error.code = "ML_EMPTY_SELLER_ITEMS";
    throw error;
  }
  if (!ids.length) return [];

  const products = [];
  for (const idGroup of chunk(ids, 20)) {
    const detailUrl = new URL("https://api.mercadolibre.com/items");
    detailUrl.searchParams.set("ids", idGroup.join(","));
    const details = await fetchJson(detailUrl, headers);
    for (const item of Array.isArray(details) ? details : []) {
      const record = item?.body || item;
      if (record?.id) products.push(record);
    }
  }

  return products
    .slice(0, limit)
    .map((record) => normalizeMercadoLivre(record, query));
}

async function getMercadoLivreSellerItemIds({ userId, limit, headers }) {
  const attempts = [
    { status: "active", orders: "start_time_desc" },
    { orders: "start_time_desc" },
    { status: "paused", orders: "start_time_desc" },
    { status: "under_review", orders: "start_time_desc" },
    { status: "closed", orders: "start_time_desc" },
  ];
  const ids = [];

  for (const attempt of attempts) {
    const url = new URL(`https://api.mercadolibre.com/users/${userId}/items/search`);
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 100)));
    Object.entries(attempt).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const payload = await fetchJson(url, headers);
    const results = Array.isArray(payload?.results) ? payload.results.map(String).filter(Boolean) : [];
    for (const id of results) {
      if (!ids.includes(id)) ids.push(id);
      if (ids.length >= limit) return ids;
    }
  }

  return ids;
}

function getMercadoLivreUserId(options = {}) {
  return String(options.mercadoLivreAuth?.userId || env.MERCADO_LIVRE_USER_ID || "").trim();
}

function resolveMercadoLivreFallbackError({ sellerError, searchError, userId }) {
  if (sellerError?.code === "ML_EMPTY_SELLER_ITEMS") return sellerError;
  return enhanceMercadoLivreSearchError(searchError, { userId });
}

function enhanceMercadoLivreSearchError(error, options = {}) {
  const status = Number(error.status);
  if (![401, 403].includes(status)) return error;

  const enhanced = new Error(
    status === 403
      ? `HTTP 403: o Mercado Livre negou a busca publica de anuncios.${options.userId ? " Tambem tentei buscar anuncios ativos da conta conectada." : ""} Ative Publicacao e sincronizacao em leitura e escrita, autorize novamente e confirme se a conta possui anuncios ativos.`
      : "HTTP 401: token do Mercado Livre invalido ou expirado. Autorize o app novamente.",
  );
  enhanced.status = status;
  return enhanced;
}

async function getAmazonProducts({ query, limit }) {
  if (env.AMAZON_ENDPOINT_URL) {
    return getAmazonFromEndpoint({ query, limit });
  }
  return getAmazonFromCreatorsApi({ query, limit });
}

async function getAmazonFromEndpoint({ query, limit }) {
  const url = env.AMAZON_ENDPOINT_URL
    .replaceAll("{{query}}", encodeURIComponent(query))
    .replaceAll("{{limit}}", String(limit));

  const headers = { Accept: "application/json" };
  if (env.AMAZON_ENDPOINT_AUTH_HEADER) {
    headers.Authorization = env.AMAZON_ENDPOINT_AUTH_HEADER;
  }

  const payload = await fetchJson(url, headers);
  return firstArray(payload, "amazon").map((record) => normalizeAmazon(record, query));
}

async function getAmazonFromCreatorsApi({ query, limit }) {
  const missing = missingAmazonKeys();
  if (missing.length) {
    throw new Error("RAD-AMZ-002 - Fonte Amazon aguardando autorizacao.");
  }

  const apiClient = new ApiClient();
  apiClient.credentialId = env.AMAZON_CREDENTIAL_ID;
  apiClient.credentialSecret = env.AMAZON_CREDENTIAL_SECRET;
  apiClient.version = env.AMAZON_CREDENTIAL_VERSION;

  const api = new TypedDefaultApi(apiClient);
  const marketplace = env.AMAZON_MARKETPLACE || "www.amazon.com.br";
  const requestContent = new SearchItemsRequestContent();
  requestContent.partnerTag = env.AMAZON_PARTNER_TAG;
  requestContent.keywords = query;
  requestContent.itemCount = Math.min(limit, 10);
  requestContent.resources = [
    "images.primary.medium",
    "itemInfo.title",
    "itemInfo.features",
    "offersV2.listings.price",
    "offersV2.listings.availability",
    "offersV2.listings.condition",
    "offersV2.listings.merchantInfo",
  ].map((resource) => SearchItemsResource.constructFromObject(resource));

  const payload = await api.searchItems(marketplace, requestContent);
  return firstArray(payload, "amazon").map((record) => normalizeAmazon(record, query));
}

async function ensureMercadoLivreAccessToken(options = {}) {
  const sessionAuth = options.mercadoLivreAuth;
  if (sessionAuth?.accessToken && !isMercadoLivreTokenExpiring(sessionAuth.expiresAt)) {
    return sessionAuth.accessToken;
  }

  if (sessionAuth?.refreshToken && canRefreshMercadoLivreToken(options)) {
    const refreshed = await refreshMercadoLivreToken(sessionAuth.refreshToken, false);
    if (options.onMercadoLivreAuthUpdate) {
      options.onMercadoLivreAuthUpdate(refreshed.auth);
    }
    return refreshed.accessToken;
  }

  if (env.MERCADO_LIVRE_ACCESS_TOKEN && !isMercadoLivreTokenExpiring()) {
    return env.MERCADO_LIVRE_ACCESS_TOKEN;
  }

  if (canRefreshMercadoLivreToken(options)) {
    const refreshed = await refreshMercadoLivreToken();
    return refreshed.accessToken;
  }

  return env.MERCADO_LIVRE_ACCESS_TOKEN || "";
}

function isMercadoLivreTokenExpiring(expiresAtValue = env.MERCADO_LIVRE_TOKEN_EXPIRES_AT) {
  if (!expiresAtValue) return false;
  const expiresAt = new Date(expiresAtValue).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt - Date.now() < 5 * 60 * 1000;
}

function canRefreshMercadoLivreToken(options = {}) {
  return Boolean(env.MERCADO_LIVRE_CLIENT_ID && env.MERCADO_LIVRE_CLIENT_SECRET && (options.mercadoLivreAuth?.refreshToken || env.MERCADO_LIVRE_REFRESH_TOKEN));
}

async function refreshMercadoLivreToken(refreshToken = env.MERCADO_LIVRE_REFRESH_TOKEN, persist = true) {
  const payload = await requestMercadoLivreToken({
    grant_type: "refresh_token",
    client_id: env.MERCADO_LIVRE_CLIENT_ID,
    client_secret: env.MERCADO_LIVRE_CLIENT_SECRET,
    refresh_token: refreshToken,
  });
  const auth = normalizeMercadoLivreTokenPayload(payload);
  if (persist) {
    persistMercadoLivreAuth(auth);
  }
  return { accessToken: auth.accessToken, auth };
}

async function requestMercadoLivreToken(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }

  return fetchFormJson("https://api.mercadolibre.com/oauth/token", params);
}

function persistMercadoLivreTokenPayload(payload) {
  persistMercadoLivreAuth(normalizeMercadoLivreTokenPayload(payload));
}

function normalizeMercadoLivreTokenPayload(payload) {
  if (!payload?.access_token) {
    throw new Error("Mercado Livre nao retornou access_token");
  }

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString()
    : "";

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || env.MERCADO_LIVRE_REFRESH_TOKEN || "",
    expiresAt,
    userId: payload.user_id || env.MERCADO_LIVRE_USER_ID || "",
  };
}

function persistMercadoLivreAuth(auth) {
  updateRuntimeEnv({
    MERCADO_LIVRE_ACCESS_TOKEN: auth.accessToken,
    MERCADO_LIVRE_REFRESH_TOKEN: auth.refreshToken,
    MERCADO_LIVRE_TOKEN_EXPIRES_AT: auth.expiresAt,
    MERCADO_LIVRE_USER_ID: auth.userId,
  }, { persist: true });
}

async function fetchJson(url, headers, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "radar-produtos/1.0",
        ...headers,
      },
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`timeout apos ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail = payload?.message || payload?.error || payload?.raw || response.statusText;
    const error = new Error(`HTTP ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function fetchFormJson(url, params, timeoutMs = 20000) {
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
        "User-Agent": "radar-produtos/1.0",
      },
      body: params,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`timeout apos ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail = payload?.message || payload?.error_description || payload?.error || payload?.raw || response.statusText;
    const error = new Error(`HTTP ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function firstArray(payload, sourceKind) {
  if (Array.isArray(payload)) return payload;
  if (sourceKind === "mercadolivre") return Array.isArray(payload?.results) ? payload.results : [];
  if (sourceKind === "amazon") {
    return [
      payload?.searchResult?.items,
      payload?.SearchResult?.Items,
      payload?.items,
      payload?.Items,
      payload?.data?.items,
      payload?.data?.SearchResult?.Items,
    ].find(Array.isArray) || [];
  }
  return [];
}

function normalizeMercadoLivre(record, query) {
  return {
    id: String(record.id || ""),
    title: String(record.title || ""),
    price: toNumber(record.price),
    currency: record.currency_id || "BRL",
    url: record.permalink || "",
    image: record.secure_thumbnail || record.thumbnail || record.pictures?.[0]?.url || "",
    seller: record.seller?.nickname || String(record.seller?.id || ""),
    availability: formatMercadoLivreAvailability(record),
    rawStatus: record.status || "",
    source: "Mercado Livre",
    sourceKind: "mercadolivre",
    query,
    fetchedAt: new Date().toISOString(),
  };
}

function formatMercadoLivreAvailability(record) {
  const statusLabels = {
    active: "Ativo",
    paused: "Pausado",
    under_review: "Em revisao",
    closed: "Finalizado",
    inactive: "Inativo",
  };
  const status = statusLabels[record.status] || record.status;
  const quantity = record.available_quantity ? `${record.available_quantity} disponivel` : "";
  return [status, quantity].filter(Boolean).join(" - ");
}

function normalizeAmazon(record, query) {
  const asin = String(pick(record, ["asin", "ASIN", "id"])).trim();
  const title = String(pick(record, ["itemInfo.title.displayValue", "ItemInfo.Title.DisplayValue", "title", "name"])).trim();
  const detailUrl = String(pick(record, ["detailPageURL", "DetailPageURL", "detailPageUrl", "url", "link"])).trim();

  return {
    id: asin || detailUrl || title,
    title,
    price: toNumber(pick(record, [
      "offersV2.listings.0.price.money.amount",
      "OffersV2.Listings.0.Price.Money.Amount",
      "offers.listings.0.price.amount",
      "Offers.Listings.0.Price.Amount",
      "price.amount",
      "price",
    ])),
    currency: pick(record, [
      "offersV2.listings.0.price.money.currency",
      "OffersV2.Listings.0.Price.Money.Currency",
      "price.currency",
    ]) || "BRL",
    url: buildAmazonProductUrl(detailUrl, asin),
    image: String(pick(record, [
      "images.primary.medium.url",
      "Images.Primary.Medium.URL",
      "images.primary.large.url",
      "Images.Primary.Large.URL",
      "image",
      "image_url",
    ])).trim(),
    seller: String(pick(record, [
      "offersV2.listings.0.merchantInfo.name",
      "OffersV2.Listings.0.MerchantInfo.Name",
      "seller",
      "merchant",
    ])).trim(),
    availability: String(pick(record, [
      "offersV2.listings.0.availability.message",
      "OffersV2.Listings.0.Availability.Message",
      "availability",
    ])).trim(),
    source: "Amazon",
    sourceKind: "amazon",
    query,
    fetchedAt: new Date().toISOString(),
  };
}

function buildAmazonProductUrl(detailUrl, asin) {
  const marketplace = env.AMAZON_MARKETPLACE || "www.amazon.com.br";
  const rawUrl = detailUrl || (asin ? `https://${marketplace}/dp/${asin}` : "");
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (env.AMAZON_PARTNER_TAG && /(^|\.)amazon\./i.test(url.hostname) && !url.searchParams.has("tag")) {
      url.searchParams.set("tag", env.AMAZON_PARTNER_TAG);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function pick(record, paths) {
  for (const itemPath of paths) {
    const value = itemPath.split(".").reduce((current, key) => {
      if (current === undefined || current === null) return undefined;
      if (/^\d+$/.test(key)) return current[Number(key)];
      return current[key];
    }, record);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return null;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatSourceError(source, error) {
  return `${source}: ${error.message || "fonte temporariamente indisponivel"}`;
}

function parseSources(value) {
  return new Set(String(value || "")
    .split(",")
    .map((source) => source.trim().toLowerCase())
    .filter(Boolean));
}

function hasRealSourceRequest(sources) {
  return sources.has("mercadolivre") || sources.has("amazon");
}

function isMercadoLivreConfigured() {
  return Boolean(env.MERCADO_LIVRE_ACCESS_TOKEN || canRefreshMercadoLivreToken());
}

function isAmazonConfigured() {
  if (env.AMAZON_ENDPOINT_URL) return true;
  return missingAmazonKeys().length === 0;
}

function missingAmazonKeys() {
  if (env.AMAZON_ENDPOINT_URL) return [];
  return [
    "AMAZON_PARTNER_TAG",
    "AMAZON_CREDENTIAL_ID",
    "AMAZON_CREDENTIAL_SECRET",
    "AMAZON_CREDENTIAL_VERSION",
  ].filter((key) => !env[key]);
}

function applyDemoPulse(basePrice, index) {
  const windowIndex = Math.floor(Date.now() / (1000 * 60 * 5));
  const wave = ((windowIndex + index * 3) % 9) - 4;
  const price = basePrice + (basePrice * wave * 0.006);
  return Number(Math.max(1, price).toFixed(2));
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(String(value).toLowerCase());
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}
