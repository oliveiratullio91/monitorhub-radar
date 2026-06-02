import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const env = loadEnvFiles([
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), ".env.local"),
]);

const ALERTS_TABLE = "monitorhub_price_alerts";
const NOTIFICATIONS_TABLE = "monitorhub_alert_notifications";
const CATALOG_TABLE = "monitorhub_product_catalog";
const DEFAULT_MATCH_LIMIT = 1000;
const CATALOG_ALIAS_LIMIT = 12;
const CATALOG_CHUNK_SIZE = 80;

const PRODUCT_TYPES = [
  { key: "smart-tv", label: "Smart TV", terms: ["smart tv", "tv", "televisao", "televisor"] },
  { key: "notebook", label: "Notebook", terms: ["notebook", "laptop", "ultrabook"] },
  { key: "iphone", label: "iPhone", terms: ["iphone"] },
  { key: "smartphone", label: "Smartphone", terms: ["smartphone", "celular", "telefone"] },
  { key: "monitor", label: "Monitor", terms: ["monitor"] },
  { key: "headphone", label: "Fone de ouvido", terms: ["fone de ouvido", "fone bluetooth", "headphone", "headset", "earbud"] },
  { key: "smartwatch", label: "Smartwatch", terms: ["smartwatch", "relogio inteligente", "watch"] },
  { key: "tablet", label: "Tablet", terms: ["tablet", "ipad"] },
  { key: "console", label: "Console", terms: ["playstation", "ps5", "xbox", "nintendo switch", "console"] },
  { key: "cafeteira", label: "Cafeteira", terms: ["cafeteira", "espresso", "nespresso"] },
  { key: "air-fryer", label: "Air Fryer", terms: ["air fryer", "fritadeira"] },
  { key: "aspirador", label: "Aspirador", terms: ["aspirador", "robo aspirador"] },
  { key: "power-bank", label: "Power Bank", terms: ["power bank", "carregador portatil"] },
  { key: "teclado", label: "Teclado", terms: ["teclado"] },
  { key: "mouse", label: "Mouse", terms: ["mouse"] },
  { key: "caixa-som", label: "Caixa de som", terms: ["caixa de som", "speaker", "jbl flip"] },
];

const BRAND_NAMES = [
  "samsung",
  "lg",
  "tcl",
  "philips",
  "sony",
  "xiaomi",
  "apple",
  "motorola",
  "dell",
  "lenovo",
  "acer",
  "asus",
  "jbl",
  "anker",
  "redragon",
  "logitech",
  "kingston",
  "sandisk",
  "wd",
  "seagate",
  "mondial",
  "philco",
  "midea",
  "electrolux",
  "consul",
  "brastemp",
  "multilaser",
  "positivo",
  "amazon",
  "nintendo",
  "microsoft",
  "playstation",
  "hp",
];

export function publicSupabaseConfig() {
  const dataServiceConfigured = isSupabaseConfigured();
  return {
    dataServiceConfigured,
    authServiceConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    databaseServiceConfigured: dataServiceConfigured,
    requiredServiceCodes: dataServiceConfigured ? [] : ["RAD-AUTH-001", "RAD-DATA-001"],
  };
}

export function isSupabaseConfigured() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function buildSupabaseOAuthUrl(provider, redirectTo) {
  ensureSupabaseAuthConfigured();
  const authUrl = new URL("/auth/v1/authorize", withTrailingSlash(env.SUPABASE_URL));
  authUrl.searchParams.set("provider", String(provider || "google").trim().toLowerCase());
  authUrl.searchParams.set("redirect_to", String(redirectTo || "").trim());
  authUrl.searchParams.set("scopes", "email profile");
  return authUrl.toString();
}

export async function resolveSupabaseOAuthRedirect(provider, redirectTo) {
  const authUrl = buildSupabaseOAuthUrl(provider, redirectTo);
  const status = await inspectSupabaseOAuthUrl(authUrl, provider);
  return status.ok ? { ok: true, url: authUrl } : status;
}

export async function signUpPriceAlertUser(body = {}) {
  ensureSupabaseAuthConfigured();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const phone = normalizePhone(body.phone);

  if (!email) throw httpError("Informe um e-mail valido.", 400);
  if (password.length < 6) throw httpError("A senha precisa ter pelo menos 6 caracteres.", 400);

  const payload = await supabaseAuthFetch("/auth/v1/signup", {
    method: "POST",
    body: {
      email,
      password,
      data: {
        name,
        phone,
      },
    },
  });

  return normalizeAuthPayload(payload);
}

export async function signInPriceAlertUser(body = {}) {
  ensureSupabaseAuthConfigured();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) throw httpError("Informe e-mail e senha.", 400);

  const payload = await supabaseAuthFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });

  return normalizeAuthPayload(payload);
}

export async function refreshPriceAlertSession(body = {}) {
  ensureSupabaseAuthConfigured();
  const refreshToken = String(body.refreshToken || body.refresh_token || "").trim();
  if (!refreshToken) throw httpError("Refresh token ausente.", 401);

  const payload = await supabaseAuthFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });

  return normalizeAuthPayload(payload);
}

export async function getUserFromAuthorizationHeader(authHeader = "") {
  ensureSupabaseAuthConfigured();
  const token = extractBearerToken(authHeader);
  if (!token) throw httpError("Sessao ausente.", 401);

  const payload = await supabaseAuthFetch("/auth/v1/user", {
    token,
  });

  return normalizeUser(payload, token);
}

export async function listPriceAlerts(user) {
  ensureSupabaseConfigured();
  const params = new URLSearchParams({
    select: "*",
    user_id: `eq.${user.id}`,
    order: "created_at.desc",
  });
  const records = await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, { service: true });
  return Array.isArray(records) ? records.map(normalizeAlertRecord) : [];
}

export async function listProductCatalog(searchParams = new URLSearchParams()) {
  ensureSupabaseConfigured();
  const rawQuery = String(searchParams.get("query") || searchParams.get("q") || "").trim();
  const terms = tokenize(rawQuery);
  const limit = clamp(Number(searchParams.get("limit") || 30), 1, 100);
  const params = new URLSearchParams({
    select: "*",
    order: "last_seen_at.desc",
    limit: String(terms.length ? 1000 : limit),
  });

  const records = await supabaseRestFetch(`/${CATALOG_TABLE}?${params.toString()}`, { service: true });
  let products = Array.isArray(records) ? records.map(normalizeCatalogRecord) : [];

  if (terms.length) {
    products = products
      .map((product) => ({
        ...product,
        matchScore: scoreCatalogProduct(product, terms),
      }))
      .filter((product) => product.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore || b.seenCount - a.seenCount)
      .slice(0, limit);
  }

  return {
    ok: true,
    products: products.slice(0, limit),
    count: Math.min(products.length, limit),
    query: rawQuery,
  };
}

export function buildCatalogSuggestionsFromProducts(products = [], searchParams = new URLSearchParams()) {
  const rawQuery = String(searchParams.get("query") || searchParams.get("q") || "").trim();
  const terms = tokenize(rawQuery);
  const limit = clamp(Number(searchParams.get("limit") || 30), 1, 100);
  let suggestions = buildCatalogRecords(products).map((record) => normalizeCatalogRecord({
    ...record,
    id: "",
  }));

  if (terms.length) {
    suggestions = suggestions
      .map((product) => ({
        ...product,
        matchScore: scoreCatalogProduct(product, terms),
      }))
      .filter((product) => product.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore || b.seenCount - a.seenCount);
  } else {
    suggestions = suggestions.sort((a, b) => b.seenCount - a.seenCount);
  }

  return {
    ok: true,
    fallback: true,
    products: suggestions.slice(0, limit),
    count: Math.min(suggestions.length, limit),
    query: rawQuery,
  };
}

export async function indexCatalogProducts(products = []) {
  if (!isSupabaseConfigured()) {
    return { ok: false, skipped: true, reason: "supabase-not-configured" };
  }

  try {
    const records = buildCatalogRecords(products);
    if (!records.length) return { ok: true, indexed: 0, products: [] };
    const indexed = await upsertCatalogRecords(records);
    return { ok: true, indexed: indexed.length, products: indexed };
  } catch (error) {
    return { ok: false, indexed: 0, error: error.message || "Falha ao indexar catalogo" };
  }
}

export async function createPriceAlert(user, body = {}) {
  ensureSupabaseConfigured();
  const catalogProduct = await resolveCatalogProductForAlert(body);
  const record = validatePriceAlertPayload(body, user, catalogProduct);
  const params = new URLSearchParams({ select: "*" });
  const created = await insertPriceAlertRecord(params, record);
  return normalizeAlertRecord(firstRecord(created));
}

async function insertPriceAlertRecord(params, record) {
  try {
    return await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
      method: "POST",
      service: true,
      prefer: "return=representation",
      body: record,
    });
  } catch (error) {
    if (!isSupabaseCatalogSchemaError(error)) throw error;
    const legacyRecord = { ...record };
    delete legacyRecord.catalog_product_id;
    delete legacyRecord.canonical_product_key;
    delete legacyRecord.canonical_product_name;
    return supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
      method: "POST",
      service: true,
      prefer: "return=representation",
      body: legacyRecord,
    });
  }
}

export async function updatePriceAlert(user, body = {}) {
  ensureSupabaseConfigured();
  const id = String(body.id || "").trim();
  if (!id) throw httpError("Informe o alerta que deve ser atualizado.", 400);

  const patch = {};
  if (body.status !== undefined) patch.status = normalizeAlertStatus(body.status);
  if (body.targetPrice !== undefined || body.target_price !== undefined) {
    patch.target_price = normalizePrice(body.targetPrice ?? body.target_price);
  }
  if (body.notificationChannel !== undefined || body.notification_channel !== undefined) {
    patch.notification_channel = normalizeNotificationChannel(body.notificationChannel ?? body.notification_channel);
  }
  if (body.notificationEmail !== undefined || body.notification_email !== undefined) {
    patch.user_email = normalizeEmail(body.notificationEmail ?? body.notification_email);
  }
  if (body.whatsappPhone !== undefined || body.whatsapp_phone !== undefined) {
    patch.whatsapp_phone = normalizePhone(body.whatsappPhone ?? body.whatsapp_phone);
  }
  if (["email", "both"].includes(patch.notification_channel) && !patch.user_email) {
    throw httpError("Informe um e-mail para receber o alerta.", 400);
  }
  if (["whatsapp", "both"].includes(patch.notification_channel) && !patch.whatsapp_phone) {
    throw httpError("Informe um WhatsApp para receber o alerta.", 400);
  }
  if (!Object.keys(patch).length) throw httpError("Nenhuma alteracao enviada.", 400);

  patch.updated_at = new Date().toISOString();
  const params = new URLSearchParams({
    id: `eq.${id}`,
    user_id: `eq.${user.id}`,
    select: "*",
  });
  const updated = await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
    method: "PATCH",
    service: true,
    prefer: "return=representation",
    body: patch,
  });
  return normalizeAlertRecord(firstRecord(updated));
}

export async function deletePriceAlert(user, id) {
  ensureSupabaseConfigured();
  const cleanId = String(id || "").trim();
  if (!cleanId) throw httpError("Informe o alerta que deve ser removido.", 400);

  const params = new URLSearchParams({
    id: `eq.${cleanId}`,
    user_id: `eq.${user.id}`,
  });
  await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
    method: "DELETE",
    service: true,
  });
  return { ok: true, deletedId: cleanId };
}

export async function listPendingAlertNotifications(options = {}) {
  ensureSupabaseConfigured();
  const limit = clamp(Number(options.limit || 100), 1, 500);
  const params = new URLSearchParams({
    select: "*",
    status: "eq.pending",
    order: "created_at.asc",
    limit: String(limit),
  });
  const records = await supabaseRestFetch(`/${NOTIFICATIONS_TABLE}?${params.toString()}`, { service: true });
  return Array.isArray(records) ? records.map(normalizeNotificationRecord) : [];
}

export async function updateAlertNotificationStatus(body = {}) {
  ensureSupabaseConfigured();
  const id = String(body.id || "").trim();
  if (!id) throw httpError("Informe a notificacao que deve ser atualizada.", 400);

  const status = normalizeNotificationStatus(body.status);
  const patch = {
    status,
    error_message: status === "failed" ? String(body.errorMessage || body.error_message || "").trim() : null,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  };

  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
  });
  const updated = await supabaseRestFetch(`/${NOTIFICATIONS_TABLE}?${params.toString()}`, {
    method: "PATCH",
    service: true,
    prefer: "return=representation",
    body: patch,
  });
  return normalizeNotificationRecord(firstRecord(updated));
}

export async function evaluatePriceAlerts(products = [], options = {}) {
  ensureSupabaseConfigured();
  const limit = clamp(Number(options.limit || DEFAULT_MATCH_LIMIT), 1, DEFAULT_MATCH_LIMIT);
  const activeAlerts = await getActiveAlertsForMatching();
  const matches = [];

  for (const alert of activeAlerts) {
    const product = findBestProductMatch(alert, products);
    if (!product) continue;
    if (!shouldNotify(alert, product)) continue;
    const match = buildAlertMatch(alert, product);
    matches.push(match);
    if (matches.length >= limit) break;
  }

  if (options.markNotified && matches.length) {
    await markMatchesAsNotified(matches);
  }

  return {
    ok: true,
    configured: true,
    matches,
    count: matches.length,
    checkedAlerts: activeAlerts.length,
    checkedProducts: Array.isArray(products) ? products.length : 0,
    fetchedAt: new Date().toISOString(),
  };
}

export function canEvaluateAlerts(request) {
  const token = env.N8N_INGEST_TOKEN;
  if (!token) return true;
  const authHeader = String(request.headers.authorization || "");
  const n8nHeader = String(request.headers["x-n8n-token"] || "");
  return authHeader === `Bearer ${token}` || n8nHeader === token;
}

async function getActiveAlertsForMatching() {
  const params = new URLSearchParams({
    select: "*",
    status: "eq.active",
    order: "created_at.asc",
    limit: "1000",
  });
  const records = await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, { service: true });
  return Array.isArray(records) ? records.map(normalizeAlertRecord) : [];
}

function findBestProductMatch(alert, products) {
  const source = normalizeSourceFilter(alert.source);
  const queryTerms = tokenize(alert.canonicalProductName || alert.productQuery);
  const brandTerms = tokenize(alert.brand);
  let bestMatch = null;
  let bestScore = -1;

  for (const product of Array.isArray(products) ? products : []) {
    const price = normalizePrice(product.price, { allowNull: true });
    if (price === null || price > alert.targetPrice) continue;
    if (source !== "all" && normalizeSourceFilter(product.sourceKind || product.source) !== source) continue;

    if (matchesSavedProduct(alert, product)) {
      const exactScore = 1000 + Math.max(0, alert.targetPrice - price) / Math.max(alert.targetPrice, 1);
      if (exactScore > bestScore) {
        bestMatch = product;
        bestScore = exactScore;
      }
      continue;
    }

    const productCatalog = canonicalizeProduct(product.title, product);
    const text = normalizeSearchText([
      product.title,
      product.seller,
      product.source,
      product.query,
      productCatalog.canonicalName,
      productCatalog.searchText,
    ].join(" "));
    if (!productTermsMatch(text, queryTerms) || !termsMatch(text, brandTerms)) continue;

    const termHits = queryTerms.filter((term) => text.includes(term)).length;
    const score = termHits + brandTerms.length + Math.max(0, alert.targetPrice - price) / Math.max(alert.targetPrice, 1);
    if (score > bestScore) {
      bestMatch = product;
      bestScore = score;
    }
  }

  return bestMatch;
}

function matchesSavedProduct(alert, product) {
  const currentKey = normalizeComparable(productKey(product));
  const currentId = normalizeComparable(product.id);
  const currentUrl = normalizeComparable(product.url);

  return Boolean(
    (alert.productKey && currentKey && normalizeComparable(alert.productKey) === currentKey)
    || (alert.productId && currentId && normalizeComparable(alert.productId) === currentId)
    || (alert.productUrl && currentUrl && normalizeComparable(alert.productUrl) === currentUrl)
  );
}

function termsMatch(text, terms) {
  return terms.every((term) => text.includes(term));
}

function productTermsMatch(text, terms) {
  if (!terms.length) return true;
  const numericTerms = terms.filter((term) => /^\d/.test(term));
  if (!termsMatch(text, numericTerms)) return false;
  const hits = terms.filter((term) => text.includes(term)).length;
  return hits >= Math.max(1, Math.ceil(terms.length * 0.65));
}

function shouldNotify(alert, product) {
  const key = productKey(product);
  if (alert.matchedProductKey !== key) return true;
  if (!alert.lastNotifiedAt) return true;
  const last = new Date(alert.lastNotifiedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > 24 * 60 * 60 * 1000;
}

function buildAlertMatch(alert, product) {
  return {
    alertId: alert.id,
    userId: alert.userId,
    userEmail: alert.userEmail,
    userName: alert.userName,
    whatsappPhone: alert.whatsappPhone,
    notificationChannel: alert.notificationChannel,
    productQuery: alert.productQuery,
    canonicalProductName: alert.canonicalProductName,
    targetPrice: alert.targetPrice,
    product: {
      id: String(product.id || ""),
      key: productKey(product),
      title: String(product.title || ""),
      price: normalizePrice(product.price, { allowNull: true }),
      originalPrice: normalizePrice(product.originalPrice, { allowNull: true }),
      discountPercent: normalizePrice(product.discountPercent, { allowNull: true }),
      currency: product.currency || "BRL",
      source: product.source || "",
      sourceKind: product.sourceKind || "",
      url: product.url || "",
      image: product.image || "",
      seller: product.seller || "",
    },
    message: buildMatchMessage(alert, product),
    matchedAt: new Date().toISOString(),
  };
}

function buildMatchMessage(alert, product) {
  const price = normalizePrice(product.price, { allowNull: true });
  const priceText = price === null ? "preco nao informado" : formatCurrency(price);
  return `Encontramos ${product.title} por ${priceText}, dentro do alvo de ${formatCurrency(alert.targetPrice)}. Link: ${product.url || "indisponivel"}`;
}

async function markMatchesAsNotified(matches) {
  for (const match of matches) {
    const notificationChannels = channelsForNotification(match.notificationChannel);
    for (const channel of notificationChannels) {
      await supabaseRestFetch(`/${NOTIFICATIONS_TABLE}`, {
        method: "POST",
        service: true,
        prefer: "return=minimal",
        body: {
          alert_id: match.alertId,
          user_id: match.userId,
          channel,
          product_key: match.product.key,
          product_title: match.product.title,
          product_price: match.product.price,
          product_url: match.product.url,
          message: match.message,
          status: "pending",
        },
      }).catch(() => null);
    }

    const params = new URLSearchParams({
      id: `eq.${match.alertId}`,
      select: "id",
    });
    await supabaseRestFetch(`/${ALERTS_TABLE}?${params.toString()}`, {
      method: "PATCH",
      service: true,
      prefer: "return=minimal",
      body: {
        last_notified_at: new Date().toISOString(),
        matched_product_key: match.product.key,
        updated_at: new Date().toISOString(),
      },
    });
  }
}

function channelsForNotification(channel) {
  return channel === "both" ? ["email", "whatsapp"] : [normalizeNotificationChannel(channel)];
}

function validatePriceAlertPayload(body, user, catalogProduct) {
  const productQuery = String(catalogProduct?.canonicalName || body.productQuery || body.product_query || "").trim();
  const brand = String(body.brand || "").trim();
  const targetPrice = normalizePrice(body.targetPrice ?? body.target_price);
  const source = normalizeSourceFilter(body.source || "all");
  const notificationChannel = normalizeNotificationChannel(body.notificationChannel || body.notification_channel || "email");
  const notificationEmail = normalizeEmail(body.notificationEmail || body.notification_email || user.email);
  const whatsappPhone = normalizePhone(body.whatsappPhone || body.whatsapp_phone || user.phone);
  const selectedProduct = normalizeSelectedProduct(body.product || body.selectedProduct || body.selected_product || {});
  const catalogSample = catalogProductToSelectedProduct(catalogProduct);
  const savedProduct = selectedProduct.title || selectedProduct.id || selectedProduct.url ? selectedProduct : catalogSample;

  if (productQuery.length < 3) throw httpError("Informe o produto com pelo menos 3 caracteres.", 400);
  if (!targetPrice || targetPrice <= 0) throw httpError("Informe um preco alvo valido.", 400);
  if (["email", "both"].includes(notificationChannel) && !notificationEmail) {
    throw httpError("Informe um e-mail para receber o alerta.", 400);
  }
  if (["whatsapp", "both"].includes(notificationChannel) && !whatsappPhone) {
    throw httpError("Informe um WhatsApp para receber o alerta.", 400);
  }

  return {
    user_id: user.id,
    user_email: notificationEmail,
    user_name: user.name || "",
    whatsapp_phone: whatsappPhone,
    product_query: productQuery,
    catalog_product_id: isUuid(catalogProduct?.id) ? catalogProduct.id : null,
    canonical_product_key: catalogProduct?.canonicalKey || "",
    canonical_product_name: catalogProduct?.canonicalName || productQuery,
    product_id: savedProduct.id,
    product_key: savedProduct.key,
    product_title: savedProduct.title,
    product_url: savedProduct.url,
    product_image: savedProduct.image,
    product_source_label: savedProduct.source,
    product_current_price: savedProduct.currentPrice,
    product_original_price: savedProduct.originalPrice,
    product_currency: savedProduct.currency,
    brand,
    source,
    target_price: targetPrice,
    notification_channel: notificationChannel,
    status: "active",
  };
}

function normalizeAlertRecord(record = {}) {
  return {
    id: String(record.id || ""),
    userId: String(record.user_id || ""),
    userEmail: String(record.user_email || ""),
    userName: String(record.user_name || ""),
    whatsappPhone: String(record.whatsapp_phone || ""),
    productQuery: String(record.product_query || ""),
    catalogProductId: String(record.catalog_product_id || ""),
    canonicalProductKey: String(record.canonical_product_key || ""),
    canonicalProductName: String(record.canonical_product_name || ""),
    productId: String(record.product_id || ""),
    productKey: String(record.product_key || ""),
    productTitle: String(record.product_title || ""),
    productUrl: String(record.product_url || ""),
    productImage: String(record.product_image || ""),
    productSourceLabel: String(record.product_source_label || ""),
    productCurrentPrice: normalizePrice(record.product_current_price, { allowNull: true }),
    productOriginalPrice: normalizePrice(record.product_original_price, { allowNull: true }),
    productCurrency: String(record.product_currency || "BRL"),
    product: {
      id: String(record.product_id || ""),
      key: String(record.product_key || ""),
      title: String(record.product_title || ""),
      url: String(record.product_url || ""),
      image: String(record.product_image || ""),
      source: String(record.product_source_label || ""),
      currentPrice: normalizePrice(record.product_current_price, { allowNull: true }),
      originalPrice: normalizePrice(record.product_original_price, { allowNull: true }),
      currency: String(record.product_currency || "BRL"),
    },
    catalogProduct: {
      id: String(record.catalog_product_id || ""),
      canonicalKey: String(record.canonical_product_key || ""),
      canonicalName: String(record.canonical_product_name || ""),
    },
    brand: String(record.brand || ""),
    source: normalizeSourceFilter(record.source || "all"),
    targetPrice: normalizePrice(record.target_price, { allowNull: true }),
    notificationChannel: normalizeNotificationChannel(record.notification_channel || "email"),
    status: normalizeAlertStatus(record.status || "active"),
    lastNotifiedAt: String(record.last_notified_at || ""),
    matchedProductKey: String(record.matched_product_key || ""),
    createdAt: String(record.created_at || ""),
    updatedAt: String(record.updated_at || ""),
  };
}

function normalizeNotificationRecord(record = {}) {
  return {
    id: String(record.id || ""),
    alertId: String(record.alert_id || ""),
    userId: String(record.user_id || ""),
    channel: String(record.channel || ""),
    productKey: String(record.product_key || ""),
    productTitle: String(record.product_title || ""),
    productPrice: normalizePrice(record.product_price, { allowNull: true }),
    productUrl: String(record.product_url || ""),
    message: String(record.message || ""),
    status: normalizeNotificationStatus(record.status || "pending"),
    errorMessage: String(record.error_message || ""),
    sentAt: String(record.sent_at || ""),
    createdAt: String(record.created_at || ""),
  };
}

function normalizeAuthPayload(payload = {}) {
  const user = normalizeUser(payload.user || payload, payload.access_token || payload.session?.access_token || "");
  const accessToken = payload.access_token || payload.session?.access_token || "";
  const refreshToken = payload.refresh_token || payload.session?.refresh_token || "";
  const expiresIn = payload.expires_in || payload.session?.expires_in || "";
  return {
    ok: true,
    user,
    session: accessToken ? {
      accessToken,
      refreshToken,
      expiresAt: normalizeSessionExpiresAt(payload.expires_at || payload.session?.expires_at || "", expiresIn),
      expiresIn,
    } : null,
    requiresEmailConfirmation: Boolean(user.id && !accessToken),
  };
}

function normalizeSessionExpiresAt(expiresAt, expiresIn) {
  if (expiresAt) {
    const raw = String(expiresAt).trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric * 1000).toISOString();
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }

  const seconds = Number(expiresIn || 0);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : "";
}

async function inspectSupabaseOAuthUrl(authUrl, provider) {
  try {
    const response = await fetch(authUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
    });

    if (response.status >= 300 && response.status < 400) return { ok: true };
    if (response.status < 400) return { ok: true };

    const message = await readOAuthErrorMessage(response);
    if (response.status === 400 && /unsupported provider|provider is not enabled/i.test(message)) {
      return {
        ok: false,
        code: `${provider || "google"}-provider-disabled`,
        message: "RAD-AUTH-003 - Login social ainda nao foi habilitado.",
      };
    }

    return {
      ok: false,
      code: `${provider || "google"}-provider-error`,
      message: message || "Nao foi possivel iniciar o login social.",
    };
  } catch {
    return { ok: true };
  }
}

async function readOAuthErrorMessage(response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";
  try {
    const payload = JSON.parse(text);
    return String(payload.msg || payload.message || payload.error_description || payload.error || text);
  } catch {
    return text;
  }
}

function normalizeUser(user = {}) {
  const metadata = user.user_metadata || user.raw_user_meta_data || {};
  const email = normalizeEmail(user.email);
  return {
    id: String(user.id || ""),
    email,
    name: String(metadata.full_name || metadata.name || user.name || email.split("@")[0] || "").trim(),
    phone: normalizePhone(metadata.phone || user.phone || ""),
    avatarUrl: String(metadata.avatar_url || metadata.picture || user.avatar_url || "").trim(),
  };
}

async function resolveCatalogProductForAlert(body = {}) {
  const embeddedCatalog = normalizeEmbeddedCatalogProduct(body.catalogProduct || body.catalog_product);
  const catalogId = String(body.catalogProductId || body.catalog_product_id || body.catalogProduct?.id || "").trim();
  if (catalogId) {
    try {
      return await getCatalogProductBy("id", catalogId);
    } catch (error) {
      if (embeddedCatalog && isSupabaseCatalogSchemaError(error)) return embeddedCatalog;
      throw error;
    }
  }

  const catalogKey = String(
    body.canonicalProductKey
    || body.canonical_product_key
    || body.catalogProduct?.canonicalKey
    || body.catalogProduct?.canonical_key
    || "",
  ).trim();
  if (catalogKey) {
    try {
      return await getCatalogProductBy("canonical_key", catalogKey);
    } catch (error) {
      if (embeddedCatalog && isSupabaseCatalogSchemaError(error)) return embeddedCatalog;
      throw error;
    }
  }
  if (embeddedCatalog) return embeddedCatalog;

  const selectedProduct = normalizeSelectedProduct(body.product || body.selectedProduct || body.selected_product || {});
  if (selectedProduct.title || selectedProduct.id || selectedProduct.url) {
    const records = buildCatalogRecords([{
      id: selectedProduct.id,
      title: selectedProduct.title,
      price: selectedProduct.currentPrice,
      originalPrice: selectedProduct.originalPrice,
      currency: selectedProduct.currency,
      url: selectedProduct.url,
      image: selectedProduct.image,
      source: selectedProduct.source,
      sourceKind: selectedProduct.sourceKind,
    }]);
    if (!records.length) throw httpError("Produto selecionado invalido para o catalogo.", 400);
    try {
      const indexed = await upsertCatalogRecords(records, { throwOnError: true });
      return indexed[0] || getCatalogProductBy("canonical_key", records[0].canonical_key);
    } catch (error) {
      if (isSupabaseCatalogSchemaError(error)) return normalizeCatalogRecord({ ...records[0], id: "" });
      throw error;
    }
  }

  const productQuery = String(body.productQuery || body.product_query || "").trim();
  if (productQuery) {
    const canonical = canonicalizeProduct(productQuery);
    const existing = await getCatalogProductBy("canonical_key", canonical.canonicalKey).catch(() => null);
    if (existing) return existing;
  }

  throw httpError("Escolha um produto ja catalogado antes de criar o alerta.", 400);
}

function normalizeEmbeddedCatalogProduct(product = {}) {
  const canonicalName = String(product.canonicalName || product.canonical_name || "").trim();
  const canonicalKey = String(product.canonicalKey || product.canonical_key || "").trim();
  if (!canonicalName || !canonicalKey) return null;
  return normalizeCatalogRecord({
    id: isUuid(product.id) ? product.id : "",
    canonical_key: canonicalKey,
    canonical_name: canonicalName,
    product_type: product.productType || product.product_type || "",
    brand: product.brand || "",
    specs: product.specs || {},
    aliases: product.aliases || [],
    sources: product.sources || [],
    sample_title: product.sampleTitle || product.sample_title || "",
    sample_product_id: product.sampleProductId || product.sample_product_id || "",
    sample_url: product.sampleUrl || product.sample_url || "",
    sample_image: product.sampleImage || product.sample_image || "",
    last_price: product.lastPrice ?? product.last_price ?? null,
    currency: product.currency || "BRL",
    search_text: product.searchText || product.search_text || "",
    seen_count: product.seenCount || product.seen_count || 1,
    first_seen_at: product.firstSeenAt || product.first_seen_at || "",
    last_seen_at: product.lastSeenAt || product.last_seen_at || "",
  });
}

async function getCatalogProductBy(column, value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) throw httpError("Produto do catalogo nao informado.", 400);

  const params = new URLSearchParams({
    select: "*",
    [column]: `eq.${cleanValue}`,
    limit: "1",
  });
  const records = await supabaseRestFetch(`/${CATALOG_TABLE}?${params.toString()}`, { service: true });
  if (!Array.isArray(records) || !records[0]) {
    throw httpError("Produto selecionado nao existe mais no catalogo.", 400);
  }
  return normalizeCatalogRecord(records[0]);
}

function buildCatalogRecords(products = []) {
  const byKey = new Map();
  const now = new Date().toISOString();

  for (const product of Array.isArray(products) ? products : []) {
    const item = product || {};
    const title = String(item.title || item.name || "").trim();
    if (title.length < 3) continue;

    const canonical = canonicalizeProduct(title, item);
    if (!canonical.canonicalKey || canonical.canonicalName.length < 3) continue;

    const source = compactSourceName(item.source || item.sourceKind || "");
    const existing = byKey.get(canonical.canonicalKey);
    const alias = title.slice(0, 220);
    const record = existing || {
      canonical_key: canonical.canonicalKey,
      canonical_name: canonical.canonicalName,
      product_type: canonical.productType,
      brand: canonical.brand,
      specs: canonical.specs,
      aliases: [],
      sources: [],
      sample_title: title,
      sample_product_id: String(item.id || "").trim(),
      sample_url: String(item.url || "").trim(),
      sample_image: String(item.image || "").trim(),
      last_price: normalizePrice(item.price ?? item.currentPrice, { allowNull: true }),
      currency: String(item.currency || "BRL").trim().toUpperCase() || "BRL",
      search_text: canonical.searchText,
      seen_count: 0,
      first_seen_at: now,
      last_seen_at: now,
    };

    record.aliases = mergeTextList(record.aliases, [alias], CATALOG_ALIAS_LIMIT);
    record.sources = mergeTextList(record.sources, [source].filter(Boolean), 6);
    record.seen_count += 1;
    record.last_seen_at = now;
    if (!record.sample_image && item.image) record.sample_image = String(item.image).trim();
    if (!record.sample_url && item.url) record.sample_url = String(item.url).trim();
    if (!record.sample_product_id && item.id) record.sample_product_id = String(item.id).trim();
    if (item.price ?? item.currentPrice) record.last_price = normalizePrice(item.price ?? item.currentPrice, { allowNull: true });
    record.search_text = normalizeSearchText([
      record.search_text,
      title,
      item.query,
      item.seller,
      source,
    ].join(" "));
    byKey.set(canonical.canonicalKey, record);
  }

  return [...byKey.values()];
}

async function upsertCatalogRecords(records, options = {}) {
  if (!records.length) return [];
  try {
    const existingByKey = await fetchCatalogRecordsByKeys(records.map((record) => record.canonical_key));
    const mergedRecords = records.map((record) => mergeCatalogRecord(record, existingByKey.get(record.canonical_key)));
    const upserted = [];

    for (const chunk of chunksOf(mergedRecords, CATALOG_CHUNK_SIZE)) {
      const params = new URLSearchParams({
        on_conflict: "canonical_key",
        select: "*",
      });
      const payload = await supabaseRestFetch(`/${CATALOG_TABLE}?${params.toString()}`, {
        method: "POST",
        service: true,
        prefer: "resolution=merge-duplicates,return=representation",
        body: chunk,
      });
      if (Array.isArray(payload)) upserted.push(...payload.map(normalizeCatalogRecord));
    }

    return upserted;
  } catch (error) {
    if (options.throwOnError) throw error;
    return [];
  }
}

async function fetchCatalogRecordsByKeys(keys) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  const byKey = new Map();
  if (!uniqueKeys.length) return byKey;

  for (const chunk of chunksOf(uniqueKeys, CATALOG_CHUNK_SIZE)) {
    const params = new URLSearchParams({
      select: "*",
      canonical_key: `in.(${chunk.join(",")})`,
    });
    const records = await supabaseRestFetch(`/${CATALOG_TABLE}?${params.toString()}`, { service: true });
    for (const record of Array.isArray(records) ? records : []) {
      byKey.set(record.canonical_key, normalizeCatalogRecord(record));
    }
  }

  return byKey;
}

function mergeCatalogRecord(record, existing) {
  if (!existing) return record;
  return {
    ...record,
    id: existing.id,
    aliases: mergeTextList(existing.aliases, record.aliases, CATALOG_ALIAS_LIMIT),
    sources: mergeTextList(existing.sources, record.sources, 6),
    sample_title: existing.sampleTitle || record.sample_title,
    sample_product_id: existing.sampleProductId || record.sample_product_id,
    sample_url: existing.sampleUrl || record.sample_url,
    sample_image: existing.sampleImage || record.sample_image,
    seen_count: Number(existing.seenCount || 0) + Number(record.seen_count || 0),
    first_seen_at: existing.firstSeenAt || record.first_seen_at,
    search_text: normalizeSearchText([
      existing.searchText,
      record.search_text,
      ...(existing.aliases || []),
      ...(record.aliases || []),
    ].join(" ")),
  };
}

function normalizeCatalogRecord(record = {}) {
  return {
    id: String(record.id || ""),
    canonicalKey: String(record.canonical_key || ""),
    canonicalName: String(record.canonical_name || ""),
    productType: String(record.product_type || ""),
    brand: String(record.brand || ""),
    specs: normalizeJsonObject(record.specs),
    aliases: normalizeTextArray(record.aliases),
    sources: normalizeTextArray(record.sources),
    sampleTitle: String(record.sample_title || ""),
    sampleProductId: String(record.sample_product_id || ""),
    sampleUrl: String(record.sample_url || ""),
    sampleImage: String(record.sample_image || ""),
    lastPrice: normalizePrice(record.last_price, { allowNull: true }),
    currency: String(record.currency || "BRL"),
    seenCount: Number(record.seen_count || 0),
    firstSeenAt: String(record.first_seen_at || ""),
    lastSeenAt: String(record.last_seen_at || ""),
    searchText: String(record.search_text || ""),
  };
}

function catalogProductToSelectedProduct(catalogProduct) {
  if (!catalogProduct) return normalizeSelectedProduct({});
  const source = catalogProduct.sources?.[0] || "";
  return normalizeSelectedProduct({
    id: catalogProduct.sampleProductId || catalogProduct.id,
    key: catalogProduct.canonicalKey,
    title: catalogProduct.sampleTitle || catalogProduct.canonicalName,
    url: catalogProduct.sampleUrl,
    image: catalogProduct.sampleImage,
    source,
    price: catalogProduct.lastPrice,
    currency: catalogProduct.currency,
  });
}

function scoreCatalogProduct(product, terms) {
  const queryType = detectQueryProductType(terms);
  if (queryType && product.productType && product.productType !== queryType.key) return 0;

  const canonicalText = normalizeSearchText([
    product.canonicalName,
    product.brand,
    product.productType,
  ].join(" "));
  const text = normalizeSearchText([
    canonicalText,
    product.searchText,
    ...(product.aliases || []),
    ...(product.sources || []),
  ].join(" "));
  const hits = terms.filter((term) => text.includes(term)).length;
  if (!hits) return 0;
  const canonicalHits = terms.filter((term) => canonicalText.includes(term)).length;
  if (queryType && !canonicalHits && product.productType !== queryType.key) return 0;
  const numericTerms = terms.filter((term) => /^\d/.test(term));
  const numericHits = numericTerms.filter((term) => text.includes(term)).length;
  if (numericTerms.length && numericHits !== numericTerms.length) return 0;
  const exactBoost = text.includes(normalizeSearchText(terms.join(" "))) ? 4 : 0;
  const typeBoost = queryType && product.productType === queryType.key ? 28 : 0;
  return canonicalHits * 22 + hits * 6 + typeBoost + exactBoost + Math.min(product.seenCount || 0, 12);
}

function detectQueryProductType(terms = []) {
  const text = normalizeSearchText(terms.join(" "));
  if (!text) return null;
  const smartTvType = PRODUCT_TYPES.find((type) => type.key === "smart-tv");
  if (smartTvType && /\b(tv|smart tv|televisao|televisor)\b/.test(text)) return smartTvType;
  return PRODUCT_TYPES
    .filter((type) => type.key !== "smart-tv")
    .find((type) => type.terms.some((term) => containsNormalizedTerm(text, normalizeSearchText(term)))) || null;
}

function canonicalizeProduct(title, product = {}) {
  const normalizedTitle = normalizeSearchText(title);
  const productType = detectProductType(normalizedTitle);
  const brand = detectBrand(normalizedTitle);
  const specs = extractProductSpecs(normalizedTitle, productType);
  const fallbackName = compactProductFallbackName(normalizedTitle);
  const parts = [
    productType?.label || fallbackName,
    brand?.label && !sameText(productType?.label, brand.label) ? brand.label : "",
    ...specs.primary,
  ].filter(Boolean);
  const canonicalName = compactSpaces(parts.join(" ")).slice(0, 120) || String(title || "").trim().slice(0, 120);
  const canonicalKey = slugify(canonicalName);
  const typeTerms = productType ? [productType.label, ...productType.terms] : [];
  const searchText = normalizeSearchText([
    canonicalName,
    title,
    product.query,
    product.seller,
    brand?.label,
    ...typeTerms,
    ...specs.search,
  ].join(" "));

  return {
    canonicalKey,
    canonicalName,
    productType: productType?.key || "",
    brand: brand?.label || "",
    specs: specs.value,
    searchText,
  };
}

function detectProductType(text) {
  const smartTvType = PRODUCT_TYPES.find((type) => type.key === "smart-tv");
  if (smartTvType && isSmartTvProduct(text)) return smartTvType;
  return PRODUCT_TYPES
    .filter((type) => type.key !== "smart-tv")
    .find((type) => type.terms.some((term) => containsNormalizedTerm(text, normalizeSearchText(term)))) || null;
}

function isSmartTvProduct(text) {
  if (/(^| )(suporte|controle|cabo|antena|conversor|filtro|regua|tomada|tv box|box tv)( |$)/.test(text)) {
    return false;
  }
  if (containsNormalizedTerm(text, "smart tv") || containsNormalizedTerm(text, "televisao") || containsNormalizedTerm(text, "televisor")) {
    return true;
  }
  if (!containsNormalizedTerm(text, "tv")) return false;
  return Boolean(
    /\b([2-9][0-9]|1[0-1][0-9])\s*(?:pol|polegadas|inch|")\b/.test(text)
    || /\b(qled|oled|uhd|4k|8k|led|hdr|tizen|roku|webos)\b/.test(text)
  );
}

function detectBrand(text) {
  const brand = BRAND_NAMES.find((item) => containsNormalizedTerm(text, normalizeSearchText(item)));
  if (!brand) return null;
  return {
    key: brand,
    label: brand.split(/\s+/).map(titleCaseToken).join(" "),
  };
}

function extractProductSpecs(text, productType) {
  const primary = [];
  const search = [];
  const value = {};

  const model = extractModelSpec(text);
  if (model) {
    primary.push(model);
    search.push(model);
    value.model = model;
  }

  const inches = extractInchesSpec(text, productType);
  if (inches) {
    const spec = `${inches}"`;
    primary.push(spec);
    search.push(spec, `${inches} polegadas`, `${inches} pol`);
    value.inches = inches;
  }

  const storage = firstMatch(text, /\b(\d+)\s*(tb|gb)\b/);
  if (storage) {
    const spec = `${storage[1]}${storage[2].toUpperCase()}`;
    if (!primary.includes(spec)) primary.push(spec);
    search.push(spec);
    value.storage = spec;
  }

  const refreshRate = firstMatch(text, /\b(\d{2,3})\s*hz\b/);
  if (refreshRate) {
    const spec = `${refreshRate[1]}Hz`;
    primary.push(spec);
    search.push(spec);
    value.refreshRate = spec;
  }

  const capacity = firstMatch(text, /\b(\d+(?:[,.]\d+)?)\s*l\b/);
  if (capacity && ["air-fryer", "cafeteira"].includes(productType?.key)) {
    const spec = `${capacity[1].replace(",", ".")}L`;
    primary.push(spec);
    search.push(spec);
    value.capacity = spec;
  }

  return {
    primary: [...new Set(primary)].slice(0, 4),
    search: [...new Set(search)],
    value,
  };
}

function extractModelSpec(text) {
  const patterns = [
    /\biphone\s*(\d{1,2}(?:\s*(?:pro|max|plus|mini))?)\b/,
    /\bgalaxy\s*([a-z]\d{2,3})\b/,
    /\baspire\s*(\d)\b/,
    /\bplaystation\s*(5|4)\b/,
    /\bps\s*(5|4)\b/,
    /\bxbox\s*series\s*([sx])\b/,
    /\becho\s*dot\s*(\d)?\b/,
    /\bjbl\s*(?:tune|flip)?\s*([a-z]?\d{2,4}[a-z]*)\b/,
  ];

  for (const pattern of patterns) {
    const match = firstMatch(text, pattern);
    if (!match) continue;
    return titleCaseWords(match[0].replace(/\s+/g, " "));
  }
  return "";
}

function extractInchesSpec(text, productType) {
  const explicit = firstMatch(text, /\b([2-9][0-9]|1[0-1][0-9])\s*(?:pol|polegadas|inch|")\b/);
  if (explicit) return explicit[1];
  if (productType?.key === "smart-tv" || productType?.key === "monitor") {
    const loose = firstMatch(text, /\b([2-9][0-9]|1[0-1][0-9])\b/);
    if (loose) return loose[1];
  }
  return "";
}

function compactProductFallbackName(text) {
  const stop = new Set(["com", "para", "sem", "por", "de", "da", "do", "das", "dos", "em", "novo", "original", "oferta", "promocao"]);
  const tokens = text.split(" ").filter((token) => token.length > 2 && !stop.has(token));
  return titleCaseWords(tokens.slice(0, 4).join(" ")) || "Produto";
}

function normalizeSelectedProduct(product = {}) {
  const id = String(product.id || "").trim();
  const url = String(product.url || "").trim();
  const title = String(product.title || "").trim();
  const source = String(product.source || product.sourceLabel || "").trim();
  const sourceKind = normalizeSourceFilter(product.sourceKind || source);
  const key = String(product.key || product.productKey || (id ? `${source || sourceKind}:${id}` : "")).trim();

  if (!id && !url && !title) {
    return {
      id: "",
      key: "",
      title: "",
      url: "",
      image: "",
      source: "",
      currentPrice: null,
      originalPrice: null,
      currency: "BRL",
    };
  }

  return {
    id,
    key,
    title,
    url,
    image: String(product.image || "").trim(),
    source,
    currentPrice: normalizePrice(product.currentPrice ?? product.price, { allowNull: true }),
    originalPrice: normalizePrice(product.originalPrice, { allowNull: true }),
    currency: String(product.currency || "BRL").trim().toUpperCase() || "BRL",
    sourceKind,
  };
}

async function supabaseAuthFetch(pathname, options = {}) {
  const headers = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: options.token ? `Bearer ${options.token}` : `Bearer ${env.SUPABASE_ANON_KEY}`,
  };
  return supabaseFetch(pathname, { ...options, headers });
}

async function supabaseRestFetch(pathname, options = {}) {
  const key = options.service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  if (options.prefer) headers.Prefer = options.prefer;
  return supabaseFetch(`/rest/v1${pathname}`, { ...options, headers });
}

async function supabaseFetch(pathname, options = {}) {
  const url = new URL(pathname, withTrailingSlash(env.SUPABASE_URL));
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail = payload?.msg || payload?.message || payload?.error_description || payload?.error || payload?.hint || payload?.raw || response.statusText;
    throw httpError(`RAD-DATA-001 - Servico de dados respondeu HTTP ${response.status}.`, response.status);
  }

  return payload;
}

function ensureSupabaseAuthConfigured() {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw httpError("RAD-AUTH-001 - Servico de autenticacao aguardando configuracao.", 503);
  }
}

function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw httpError("RAD-DATA-001 - Servico de dados aguardando configuracao.", 503);
  }
}

function firstRecord(payload) {
  if (Array.isArray(payload) && payload[0]) return payload[0];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  throw httpError("RAD-DATA-004 - Registro nao encontrado.", 404);
}

function productKey(product) {
  return `${product.source || product.sourceKind || "marketplace"}:${product.id || product.url || product.title}`;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSourceName(value) {
  const source = String(value || "").trim();
  const normalized = normalizeSourceFilter(source);
  if (normalized === "amazon") return "Amazon";
  if (normalized === "mercadolivre") return "Mercado Livre";
  return source;
}

function normalizeJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value.slice(1, -1).split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function mergeTextList(current = [], next = [], limit = 10) {
  const byKey = new Map();
  for (const item of [...normalizeTextArray(current), ...normalizeTextArray(next)]) {
    const clean = String(item || "").trim();
    if (!clean) continue;
    const key = normalizeSearchText(clean);
    if (!byKey.has(key)) byKey.set(key, clean);
  }
  return [...byKey.values()].slice(0, limit);
}

function chunksOf(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function containsNormalizedTerm(text, term) {
  if (!text || !term) return false;
  if (term.includes(" ")) return text.includes(term);
  return new RegExp(`(^| )${escapeRegExp(term)}( |$)`).test(text);
}

function sameText(left, right) {
  return normalizeSearchText(left) === normalizeSearchText(right);
}

function compactSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return normalizeSearchText(value).replace(/\s+/g, "-").slice(0, 140);
}

function titleCaseToken(value) {
  const upper = new Set(["lg", "tcl", "jbl", "hp", "wd"]);
  const lower = String(value || "").toLowerCase();
  if (upper.has(lower)) return lower.toUpperCase();
  if (lower === "iphone") return "iPhone";
  if (lower === "ipad") return "iPad";
  if (lower === "ps5") return "PS5";
  return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : "";
}

function titleCaseWords(value) {
  return String(value || "").split(/\s+/).filter(Boolean).map(titleCaseToken).join(" ");
}

function firstMatch(text, pattern) {
  const match = String(text || "").match(pattern);
  return match || null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeComparable(value) {
  return String(value || "").trim().toLowerCase();
}

function tokenize(value) {
  return normalizeSearchText(value).split(" ").filter((term) => term.length >= 2);
}

function normalizePrice(value, options = {}) {
  if (value === null || value === undefined || value === "") return options.allowNull ? null : 0;
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(2)) : options.allowNull ? null : 0;
  const raw = String(value)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return options.allowNull ? null : 0;

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
  return Number.isFinite(number) ? Number(number.toFixed(2)) : options.allowNull ? null : 0;
}

function normalizeSourceFilter(value) {
  const normalized = String(value || "all").toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("amazon")) return "amazon";
  if (normalized.includes("mercado")) return "mercadolivre";
  if (["mercadolivre", "ml"].includes(normalized)) return "mercadolivre";
  return "all";
}

function normalizeNotificationChannel(value) {
  const normalized = String(value || "email").toLowerCase();
  if (["whatsapp", "both"].includes(normalized)) return normalized;
  return "email";
}

function normalizeAlertStatus(value) {
  return String(value || "active").toLowerCase() === "paused" ? "paused" : "active";
}

function normalizeNotificationStatus(value) {
  const normalized = String(value || "pending").toLowerCase();
  if (["sent", "failed"].includes(normalized)) return normalized;
  return "pending";
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function extractBearerToken(authHeader) {
  const match = String(authHeader || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function httpError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isSupabaseCatalogSchemaError(error) {
  const message = String(error?.message || "");
  return /monitorhub_product_catalog|catalog_product_id|canonical_product_key|canonical_product_name|schema cache|Could not find the table|Could not find the column/i.test(message);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function withTrailingSlash(value) {
  return String(value || "").endsWith("/") ? value : `${value}/`;
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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
