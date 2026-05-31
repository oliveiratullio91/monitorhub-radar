import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const MAX_PRODUCTS = 200;
const feedDir = process.env.VERCEL
  ? path.join(os.tmpdir(), "monitorhub-radar")
  : path.resolve(process.cwd(), ".site-local");
const feedPath = path.join(feedDir, "n8n-products.json");

let memoryFeed = {
  products: [],
  errors: [],
  updatedAt: "",
  runId: "",
  source: "n8n",
};

export async function getN8nProducts(searchParams = new URLSearchParams()) {
  const limit = clamp(Number(searchParams.get("limit") || 50), 1, MAX_PRODUCTS);
  const feed = readFeed();

  return {
    ok: true,
    source: "n8n",
    products: feed.products.slice(0, limit),
    errors: feed.errors || [],
    count: feed.products.length,
    updatedAt: feed.updatedAt || "",
    runId: feed.runId || "",
    fallback: { active: false },
    fetchedAt: new Date().toISOString(),
  };
}

export async function ingestN8nProducts(payload = {}) {
  const context = Array.isArray(payload) ? {} : payload || {};
  const now = new Date().toISOString();
  const records = extractProductArray(payload);
  const products = records
    .map((record, index) => normalizeIncomingProduct(record, context, index, now))
    .filter((product) => product.id && product.title);
  const previousFeed = readFeed();
  const shouldAppend = toBool(context.append, false);
  const nextProducts = shouldAppend
    ? mergeProducts(previousFeed.products, products)
    : products;
  const feed = {
    products: nextProducts.slice(0, MAX_PRODUCTS),
    errors: normalizeErrors(context.errors),
    updatedAt: now,
    runId: String(context.runId || context.executionId || context.execution_id || ""),
    source: String(context.source || "n8n"),
  };

  writeFeed(feed);

  return {
    ok: true,
    accepted: products.length,
    count: feed.products.length,
    updatedAt: feed.updatedAt,
    runId: feed.runId,
  };
}

function extractProductArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload && typeof payload === "object") return [payload];
  return [];
}

function normalizeIncomingProduct(record, context, index, now) {
  const source = String(pick(record, ["source", "marketplace", "platform"]) || context.sourceName || context.marketplace || "Mercado Livre").trim();
  const sourceKind = String(pick(record, ["sourceKind", "source_kind"]) || detectSourceKind(source)).trim();
  const url = String(pick(record, ["url", "item_url", "permalink", "link", "href"]) || "").trim();
  const title = String(pick(record, ["title", "name", "description"]) || "").trim();
  const id = String(pick(record, ["id", "item_id", "itemId", "sku", "asin"]) || stableId({ source, url, title, index })).trim();

  return {
    id,
    title,
    price: toNumber(pick(record, [
      "price",
      "amount",
      "current_price",
      "sale_price",
      "value",
      "buybox.price",
      "prices.price",
    ])),
    currency: String(pick(record, ["currency", "currency_id"]) || context.currency || "BRL").trim(),
    url,
    image: String(pick(record, [
      "image",
      "image_url",
      "thumbnail",
      "secure_thumbnail",
      "picture",
      "pictures.0.url",
      "images.0.url",
    ]) || "").trim(),
    seller: String(pick(record, [
      "seller",
      "seller_name",
      "seller.nickname",
      "seller.id",
      "store",
      "store_name",
      "merchant",
    ]) || "").trim(),
    availability: String(pick(record, ["availability", "available_quantity", "status", "condition"]) || "").trim(),
    source,
    sourceKind,
    query: String(pick(record, ["query", "search"]) || context.query || context.mercadoLivreQuery || "").trim(),
    fetchedAt: String(pick(record, ["fetchedAt", "checked_at", "created_at", "updated_at"]) || now),
    opportunityScore: toNumber(pick(record, ["opportunityScore", "opportunity_score", "score"])),
    notes: String(pick(record, ["notes", "note", "analysis", "reason"]) || "").trim(),
  };
}

function readFeed() {
  if (existsSync(feedPath)) {
    try {
      const parsed = JSON.parse(readFileSync(feedPath, "utf8"));
      memoryFeed = normalizeFeed(parsed);
      return memoryFeed;
    } catch {
      return memoryFeed;
    }
  }
  return memoryFeed;
}

function writeFeed(feed) {
  memoryFeed = normalizeFeed(feed);
  try {
    mkdirSync(feedDir, { recursive: true });
    writeFileSync(feedPath, JSON.stringify(memoryFeed, null, 2), "utf8");
  } catch {
    // Vercel storage can be ephemeral; memoryFeed still serves warm invocations.
  }
}

function normalizeFeed(feed) {
  return {
    products: Array.isArray(feed?.products) ? feed.products : [],
    errors: normalizeErrors(feed?.errors),
    updatedAt: String(feed?.updatedAt || ""),
    runId: String(feed?.runId || ""),
    source: String(feed?.source || "n8n"),
  };
}

function mergeProducts(previousProducts, nextProducts) {
  const byKey = new Map();
  for (const product of [...nextProducts, ...previousProducts]) {
    const key = `${product.source}:${product.id}`;
    if (!byKey.has(key)) byKey.set(key, product);
  }
  return [...byKey.values()];
}

function normalizeErrors(errors) {
  if (!errors) return [];
  if (Array.isArray(errors)) return errors.map((item) => String(item)).filter(Boolean);
  return [String(errors)].filter(Boolean);
}

function stableId({ source, url, title, index }) {
  const seed = [source, url, title, index].join("|");
  return `n8n-${createHash("sha1").update(seed).digest("hex").slice(0, 16)}`;
}

function detectSourceKind(source) {
  const normalized = String(source || "").toLowerCase();
  if (normalized.includes("mercado")) return "mercadolivre";
  if (normalized.includes("amazon")) return "amazon";
  if (normalized.includes("shopee")) return "shopee";
  if (normalized.includes("olx")) return "olx";
  return "n8n";
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

  let normalized = raw;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
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

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(String(value).toLowerCase());
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
