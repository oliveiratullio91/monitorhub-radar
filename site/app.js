const CONFIG_KEY = "radar-produtos-config-v4";
const SNAPSHOT_KEY = "radar-produtos-snapshot-v4";
const EVENTS_KEY = "radar-produtos-events-v4";
const HISTORY_KEY = "radar-produtos-history-v4";
const DEMO_MODE_AVAILABLE = false;
const IS_LOCALHOST = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const dashboardFormatter = new Intl.NumberFormat("pt-BR");

const activitySeries = {
  labels: ["04/05", "05/05", "06/05", "07/05", "08/05", "09/05", "10/05"],
  newProducts: [45, 72, 58, 110, 82, 87, 96],
  priceChanges: [26, 45, 36, 58, 49, 63, 68],
  alerts: [9, 22, 14, 29, 26, 40, 48],
};

const mockAlerts = [
  {
    type: "new",
    label: "Novo Anúncio",
    title: "iPhone 13 128GB - Seminovo",
    source: "Mercado Livre",
    change: "-",
    date: "10/05/2025 10:14",
  },
  {
    type: "drop",
    label: "Queda de Preço",
    title: "Notebook Dell i5 8GB RAM",
    source: "Amazon",
    change: "-R$ 250,00",
    date: "10/05/2025 10:12",
  },
  {
    type: "new",
    label: "Novo Anúncio",
    title: "PS5 Digital Edition",
    source: "Shopee",
    change: "-",
    date: "10/05/2025 10:11",
  },
  {
    type: "up",
    label: "Aumento de Preço",
    title: "Monitor 27 LG UltraGear",
    source: "OLX",
    change: "+R$ 120,00",
    date: "10/05/2025 10:09",
  },
];

const state = {
  products: [],
  events: [],
  sourceErrors: [],
  timer: null,
  live: true,
  loading: false,
  lastUpdated: null,
  serverConfig: null,
  fallbackActive: false,
  fallbackReason: "",
  selectedCategory: "all",
};

const elements = {
  demoEnabled: document.querySelector("#demoEnabled"),
  mercadoLivreEnabled: document.querySelector("#mercadoLivreEnabled"),
  mercadoLivreQuery: document.querySelector("#mercadoLivreQuery"),
  mercadoLivreStatus: document.querySelector("#mercadoLivreStatus"),
  amazonEnabled: document.querySelector("#amazonEnabled"),
  amazonQuery: document.querySelector("#amazonQuery"),
  amazonStatus: document.querySelector("#amazonStatus"),
  refreshInterval: document.querySelector("#refreshInterval"),
  itemLimit: document.querySelector("#itemLimit"),
  globalSearch: document.querySelector("#globalSearch"),
  sortMode: document.querySelector("#sortMode"),
  onlyChanges: document.querySelector("#onlyChanges"),
  refreshNowButton: document.querySelector("#refreshNowButton"),
  toggleLiveButton: document.querySelector("#toggleLiveButton"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  connectionText: document.querySelector("#connectionText"),
  totalProducts: document.querySelector("#totalProducts"),
  newProducts: document.querySelector("#newProducts"),
  dropProducts: document.querySelector("#dropProducts"),
  activeSources: document.querySelector("#activeSources"),
  alertsSent: document.querySelector("#alertsSent"),
  automationLastRun: document.querySelector("#automationLastRun"),
  automationNextRun: document.querySelector("#automationNextRun"),
  automationToday: document.querySelector("#automationToday"),
  activityChart: document.querySelector("#activityChart"),
  recentAlertsBody: document.querySelector("#recentAlertsBody"),
  lastUpdatedText: document.querySelector("#lastUpdatedText"),
  productGrid: document.querySelector("#productGrid"),
  timeline: document.querySelector("#timeline"),
  productTemplate: document.querySelector("#productCardTemplate"),
  timelineTemplate: document.querySelector("#timelineItemTemplate"),
  categoryButtons: document.querySelectorAll(".category-button"),
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getConfig() {
  return {
    demoEnabled: DEMO_MODE_AVAILABLE && elements.demoEnabled.checked,
    mercadoLivreEnabled: elements.mercadoLivreEnabled.checked,
    mercadoLivreQuery: elements.mercadoLivreQuery.value.trim() || "notebook",
    amazonEnabled: elements.amazonEnabled.checked,
    amazonQuery: elements.amazonQuery.value.trim() || "fone bluetooth",
    refreshInterval: Number(elements.refreshInterval.value),
    itemLimit: Math.max(1, Math.min(Number(elements.itemLimit.value || 12), 50)),
  };
}

function applyConfig(config) {
  if (!config) return;
  elements.demoEnabled.checked = DEMO_MODE_AVAILABLE && Boolean(config.demoEnabled);
  elements.mercadoLivreEnabled.checked = config.mercadoLivreEnabled !== false;
  elements.mercadoLivreQuery.value = config.mercadoLivreQuery || "notebook";
  elements.amazonEnabled.checked = config.amazonEnabled !== false;
  elements.amazonQuery.value = config.amazonQuery || "fone bluetooth";
  elements.refreshInterval.value = String(config.refreshInterval || 30000);
  elements.itemLimit.value = String(config.itemLimit || 12);
}

function saveConfig() {
  writeStorage(CONFIG_KEY, getConfig());
  setConnectionText("Configuracao salva");
}

async function loadServerConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    state.serverConfig = await response.json();
  } catch {
    state.serverConfig = null;
  }
  renderServerStatus();
}

function renderServerStatus() {
  const config = state.serverConfig;
  if (!config) {
    setStatusElement(elements.mercadoLivreStatus, "Mercado Livre: servidor indisponivel", false);
    setStatusElement(elements.amazonStatus, "Amazon: servidor indisponivel", false);
    return;
  }

  setStatusElement(
    elements.mercadoLivreStatus,
    config.mercadoLivreConfigured
      ? "Mercado Livre: token ativo"
      : IS_LOCALHOST
        ? "Mercado Livre: local sem token"
        : "Mercado Livre: falta MERCADO_LIVRE_ACCESS_TOKEN",
    config.mercadoLivreConfigured,
  );
  setStatusElement(
    elements.amazonStatus,
    config.amazonConfigured ? `Amazon: ${config.amazonProvider} ativo` : "Amazon: faltam credenciais ou endpoint",
    config.amazonConfigured,
  );
}

function applyAutomaticDemoFallback(hasSavedConfig) {
  if (!state.serverConfig || hasSavedConfig) return;
  setConnectionText("Modo real aguardando credenciais");
}

function setStatusElement(element, text, ready) {
  element.textContent = text;
  element.classList.toggle("ready", Boolean(ready));
  element.classList.toggle("missing", !ready);
}

function prepareDemoMode() {
  elements.demoEnabled.checked = false;
  elements.demoEnabled.disabled = !DEMO_MODE_AVAILABLE;
  elements.demoEnabled.closest(".toggle-row")?.classList.toggle("is-hidden", !DEMO_MODE_AVAILABLE);
}

async function fetchProductsFromBackend(config) {
  const selectedSources = [];
  if (config.demoEnabled) selectedSources.push("demo");
  if (config.mercadoLivreEnabled) selectedSources.push("mercadolivre");
  if (config.amazonEnabled) selectedSources.push("amazon");

  const params = new URLSearchParams({
    sources: selectedSources.join(","),
    mercadoLivreQuery: config.mercadoLivreQuery,
    amazonQuery: config.amazonQuery,
    limit: String(config.itemLimit),
    fallback: "none",
  });

  const response = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

  state.serverConfig = payload.config || state.serverConfig;
  renderServerStatus();
  return payload;
}

async function refreshProducts() {
  if (state.loading) return;

  const config = getConfig();
  state.loading = true;
  state.sourceErrors = [];
  state.fallbackActive = false;
  state.fallbackReason = "";
  updateRunningState();

  if (!config.demoEnabled && !config.mercadoLivreEnabled && !config.amazonEnabled) {
    state.products = [];
    state.loading = false;
    setConnectionText("Nenhuma fonte ativa");
    render();
    return;
  }

  try {
    const payload = await fetchProductsFromBackend(config);
    state.sourceErrors = payload.errors || [];
    state.fallbackActive = Boolean(payload.fallback?.active);
    state.fallbackReason = payload.fallback?.reason || "";
    state.products = withChanges((payload.products || []).filter((product) => product.id && product.title));
    state.lastUpdated = payload.fetchedAt ? new Date(payload.fetchedAt) : new Date();
    if (state.fallbackActive || (config.demoEnabled && !state.serverConfig?.realSourcesReady && !config.mercadoLivreEnabled && !config.amazonEnabled)) {
      setConnectionText("Demo local ativo");
    } else if (state.sourceErrors.some((message) => message.includes("sem itens publicados"))) {
      setConnectionText("Sem anuncios na conta");
    } else if (state.sourceErrors.some((message) => message.includes("HTTP 403"))) {
      setConnectionText("Permissoes pendentes");
    } else {
      setConnectionText(state.sourceErrors.length ? "Credenciais pendentes" : "Atualizado agora");
    }
  } catch (error) {
    state.products = [];
    state.sourceErrors = [error.message || "Falha ao atualizar produtos"];
    state.fallbackActive = false;
    state.fallbackReason = "";
    setConnectionText("Falha na atualizacao");
  } finally {
    state.loading = false;
    render();
    scheduleNextRefresh();
  }
}

function withChanges(products) {
  const previous = readStorage(SNAPSHOT_KEY, {});
  const history = readStorage(HISTORY_KEY, {});
  const next = {};

  const enriched = products.map((product) => {
    const key = `${product.source}:${product.id}`;
    const old = previous[key];
    const oldPrice = old?.price ?? null;
    let changeType = old ? "stable" : "new";
    let priceDiff = null;
    let percentDiff = null;

    if (old && product.price !== null && oldPrice !== null && product.price !== oldPrice) {
      priceDiff = Number((product.price - oldPrice).toFixed(2));
      percentDiff = oldPrice === 0 ? null : Number(((priceDiff / oldPrice) * 100).toFixed(2));
      changeType = product.price < oldPrice ? "drop" : "up";
    }

    next[key] = {
      price: product.price,
      title: product.title,
      url: product.url,
      seenAt: new Date().toISOString(),
    };

    const points = history[key] || [];
    if (product.price !== null) {
      const last = points[points.length - 1];
      if (!last || last.price !== product.price) {
        points.push({ price: product.price, at: new Date().toISOString() });
      }
    }
    history[key] = points.slice(-12);

    const category = categorizeProduct(product);
    return {
      ...product,
      key,
      category,
      previousPrice: oldPrice,
      changeType,
      priceDiff,
      percentDiff,
      history: history[key],
    };
  });

  writeStorage(SNAPSHOT_KEY, next);
  writeStorage(HISTORY_KEY, history);
  appendEvents(enriched.filter((product) => product.changeType !== "stable"));
  return enriched;
}

function appendEvents(changedProducts) {
  if (!changedProducts.length) return;

  const currentEvents = readStorage(EVENTS_KEY, []);
  const created = changedProducts.map((product) => ({
    id: `${product.key}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    type: product.changeType,
    source: product.source,
    title: product.title,
    price: product.price,
    previousPrice: product.previousPrice,
    priceDiff: product.priceDiff,
    at: new Date().toISOString(),
  }));

  state.events = [...created, ...currentEvents].slice(0, 80);
  writeStorage(EVENTS_KEY, state.events);
}

function categorizeProduct(product) {
  const text = `${product.title} ${product.seller} ${product.query}`.toLowerCase();
  if (/(notebook|laptop|ssd|monitor|teclado|mouse|memoria|processador|tablet|impressora)/.test(text)) return "informatica";
  if (/(fone|headset|caixa|speaker|audio|microfone|bluetooth)/.test(text)) return "audio";
  if (/(casa|cozinha|lampada|mesa|cadeira|aspirador|cafeteira|mochila|jacket|shirt)/.test(text)) return "casa";
  if (/(game|console|playstation|xbox|nintendo|controle|gamer)/.test(text)) return "games";
  return "outros";
}

function curationNote(product) {
  if (product.changeType === "drop") return "Queda detectada. Vale confirmar frete, garantia e vendedor antes de decidir.";
  if (product.changeType === "new") return "Novo item no radar. Acompanhe mais leituras para entender se o preco se sustenta.";
  if (product.category === "informatica") return "Compare especificacoes, memoria, armazenamento e garantia com alternativas proximas.";
  if (product.category === "audio") return "Observe autonomia, compatibilidade, conforto e politica de devolucao.";
  if (product.category === "casa") return "Confira dimensoes, material, voltagem quando aplicavel e avaliacoes recentes.";
  if (product.category === "games") return "Verifique regiao, compatibilidade, edicao e disponibilidade antes da compra.";
  return "Use o link original para confirmar detalhes, preco final e disponibilidade.";
}

function scheduleNextRefresh() {
  clearTimeout(state.timer);
  if (!state.live) return;
  state.timer = setTimeout(refreshProducts, getConfig().refreshInterval);
}

function updateRunningState() {
  elements.refreshNowButton.disabled = state.loading;
  elements.refreshNowButton.textContent = state.loading ? "Atualizando" : "Atualizar";
  elements.toggleLiveButton.textContent = state.live ? "Pausar" : "Retomar";
}

function setConnectionText(text) {
  elements.connectionText.textContent = text;
}

function visibleProducts() {
  const term = elements.globalSearch.value.trim().toLowerCase();
  const onlyChanges = elements.onlyChanges.checked;
  let products = [...state.products];

  if (term) {
    products = products.filter((product) => [product.title, product.source, product.seller, product.query].join(" ").toLowerCase().includes(term));
  }

  if (onlyChanges) products = products.filter((product) => product.changeType !== "stable");
  if (state.selectedCategory !== "all") products = products.filter((product) => product.category === state.selectedCategory);

  const sortMode = elements.sortMode.value;
  products.sort((a, b) => {
    if (sortMode === "priceAsc") return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (sortMode === "priceDesc") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
    if (sortMode === "source") return a.source.localeCompare(b.source) || a.title.localeCompare(b.title);
    return changeWeight(a.changeType) - changeWeight(b.changeType) || a.source.localeCompare(b.source);
  });

  return products;
}

function changeWeight(type) {
  return { drop: 0, new: 1, up: 2, stable: 3 }[type] ?? 4;
}

function render() {
  const products = visibleProducts();
  renderMetrics(state.products);
  renderProducts(products);
  renderTimeline();
  renderDashboardStatus();
  renderActivityChart();
  renderRecentAlertsTable();
  updateRunningState();
  elements.lastUpdatedText.textContent = state.lastUpdated
    ? `${state.lastUpdated.toLocaleDateString("pt-BR")} ${state.lastUpdated.toLocaleTimeString("pt-BR")}`
    : "Nenhuma coleta realizada";
}

function renderMetrics(products) {
  const events = readStorage(EVENTS_KEY, []);
  const priceChanges = products.filter((product) => ["drop", "up"].includes(product.changeType)).length;
  const newProducts = products.filter((product) => product.changeType === "new").length;
  const activeSources = new Set(products.map((product) => product.source)).size;

  elements.totalProducts.textContent = dashboardFormatter.format(products.length);
  elements.newProducts.textContent = dashboardFormatter.format(newProducts);
  elements.dropProducts.textContent = dashboardFormatter.format(priceChanges);
  elements.activeSources.textContent = String(activeSources);
  elements.alertsSent.textContent = dashboardFormatter.format(events.length);
}

function renderDashboardStatus() {
  const lastRun = state.lastUpdated || new Date();
  const nextRun = new Date(lastRun.getTime() + getConfig().refreshInterval);
  elements.automationLastRun.textContent = state.lastUpdated
    ? `${state.lastUpdated.toLocaleDateString("pt-BR")} ${state.lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : "Aguardando coleta";
  elements.automationNextRun.textContent = state.live
    ? `${nextRun.toLocaleDateString("pt-BR")} ${nextRun.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : "Atualização pausada";
  elements.automationToday.textContent = String(Math.max(8, Math.min(24, readStorage(EVENTS_KEY, []).length || 8)));
}

function renderActivityChart() {
  const svg = elements.activityChart;
  if (!svg) return;

  svg.textContent = "";
  const width = 760;
  const height = 300;
  const padding = { top: 22, right: 22, bottom: 42, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = 125;
  const yTicks = [0, 25, 50, 75, 100, 125];

  for (const tick of yTicks) {
    const y = padding.top + plotHeight - (tick / maxValue) * plotHeight;
    svg.append(createSvg("line", {
      class: "grid-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: y,
      y2: y,
    }));
    const label = createSvg("text", {
      x: padding.left - 10,
      y: y + 4,
      "text-anchor": "end",
    });
    label.textContent = String(tick);
    svg.append(label);
  }

  activitySeries.labels.forEach((labelText, index) => {
    const x = padding.left + (index / (activitySeries.labels.length - 1)) * plotWidth;
    svg.append(createSvg("line", {
      class: "grid-line",
      x1: x,
      x2: x,
      y1: padding.top,
      y2: height - padding.bottom,
    }));
    const label = createSvg("text", {
      x,
      y: height - 14,
      "text-anchor": "middle",
    });
    label.textContent = labelText;
    svg.append(label);
  });

  svg.append(createSvg("line", {
    class: "axis-line",
    x1: padding.left,
    x2: width - padding.right,
    y1: height - padding.bottom,
    y2: height - padding.bottom,
  }));

  drawSeries(svg, activitySeries.newProducts, "green-line", "var(--green)", padding, plotWidth, plotHeight, maxValue);
  drawSeries(svg, activitySeries.priceChanges, "blue-line", "var(--blue)", padding, plotWidth, plotHeight, maxValue);
  drawSeries(svg, activitySeries.alerts, "orange-line", "var(--orange)", padding, plotWidth, plotHeight, maxValue);
}

function drawSeries(svg, values, className, color, padding, plotWidth, plotHeight, maxValue) {
  const points = values.map((value, index) => ({
    x: padding.left + (index / (values.length - 1)) * plotWidth,
    y: padding.top + plotHeight - (value / maxValue) * plotHeight,
  }));

  svg.append(createSvg("path", {
    class: `series ${className}`,
    d: smoothPath(points),
  }));

  points.forEach((point) => {
    svg.append(createSvg("circle", {
      class: "point",
      cx: point.x,
      cy: point.y,
      r: 6,
      fill: color,
    }));
  });
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const middleX = (previous.x + current.x) / 2;
    path += ` C ${middleX} ${previous.y}, ${middleX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
}

function createSvg(tagName, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function renderRecentAlertsTable() {
  const body = elements.recentAlertsBody;
  if (!body) return;

  body.textContent = "";
  const liveAlerts = readStorage(EVENTS_KEY, []).slice(0, 4).map(eventToAlertRow);
  const rows = [...liveAlerts, ...mockAlerts].slice(0, 4);

  rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    tableRow.append(
      tableCellWithBadge(row),
      textCell(row.title),
      sourceCell(row.source),
      changeCell(row.change),
      textCell(row.date),
      actionCell(),
    );
    body.append(tableRow);
  });
}

function tableCellWithBadge(row) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `badge ${row.type}`;
  badge.textContent = row.label;
  cell.append(badge);
  return cell;
}

function textCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function sourceCell(source) {
  const cell = document.createElement("td");
  const wrapper = document.createElement("span");
  const logo = document.createElement("span");
  const name = document.createElement("span");
  wrapper.className = "source-cell";
  logo.className = "source-logo";
  logo.textContent = sourceInitial(source);
  name.textContent = source;
  wrapper.append(logo, name);
  cell.append(wrapper);
  return cell;
}

function changeCell(change) {
  const cell = document.createElement("td");
  cell.textContent = change;
  if (change.startsWith("-R$")) cell.className = "change-negative";
  if (change.startsWith("+R$")) cell.className = "change-positive";
  return cell;
}

function actionCell() {
  const cell = document.createElement("td");
  const link = document.createElement("a");
  link.className = "details-button";
  link.href = "#anuncios";
  link.textContent = "Ver Detalhes";
  cell.append(link);
  return cell;
}

function eventToAlertRow(event) {
  const type = event.type === "drop" ? "drop" : event.type === "up" ? "up" : "new";
  const label = type === "drop" ? "Queda de Preço" : type === "up" ? "Aumento de Preço" : "Novo Anúncio";
  const change = type === "new" || !event.priceDiff
    ? "-"
    : `${event.priceDiff < 0 ? "-" : "+"}${formatMoney(Math.abs(event.priceDiff))}`;

  return {
    type,
    label,
    title: event.title,
    source: event.source,
    change,
    date: new Date(event.at).toLocaleString("pt-BR"),
  };
}

function sourceInitial(source) {
  const normalized = source.toLowerCase();
  if (normalized.includes("mercado")) return "ML";
  if (normalized.includes("amazon")) return "A";
  if (normalized.includes("shopee")) return "S";
  if (normalized.includes("olx")) return "OL";
  if (normalized.includes("demo")) return "D";
  return source.slice(0, 2).toUpperCase();
}

function renderProducts(products) {
  elements.productGrid.textContent = "";

  if (state.fallbackActive) {
    const warning = document.createElement("div");
    warning.className = "warning-state";
    warning.textContent = state.fallbackReason || "Modo demonstracao ativo enquanto as fontes reais sao configuradas.";
    elements.productGrid.append(warning);
  }

  if (state.sourceErrors.length) {
    const error = document.createElement("div");
    error.className = products.length ? "warning-state" : "error-state";
    error.textContent = state.sourceErrors.map(formatSourceErrorForDisplay).join(" | ");
    elements.productGrid.append(error);
  }

  if (!products.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.loading ? "Buscando produtos..." : "Nenhum produto encontrado com os filtros atuais.";
    elements.productGrid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const product of products) {
    const card = elements.productTemplate.content.firstElementChild.cloneNode(true);
    const imageLink = card.querySelector(".product-image-link");
    const image = card.querySelector(".product-image");
    const sourceBadge = card.querySelector(".source-badge");
    const changeBadge = card.querySelector(".change-badge");
    const title = card.querySelector(".product-title");
    const seller = card.querySelector(".product-seller");
    const note = card.querySelector(".product-note");
    const price = card.querySelector(".product-price");
    const priceChange = card.querySelector(".price-change");
    const historyStrip = card.querySelector(".history-strip");
    const productLink = card.querySelector(".product-link");

    image.src = product.image || placeholderImage(product.source);
    image.alt = product.title;
    imageLink.href = product.url || "#";
    sourceBadge.textContent = product.source;
    changeBadge.textContent = formatChange(product);
    changeBadge.classList.add(product.changeType);
    title.textContent = product.title;
    seller.textContent = product.seller || product.availability || product.query || "Fonte sem vendedor informado";
    note.textContent = curationNote(product);
    price.textContent = formatMoney(product.price, product.currency);
    priceChange.textContent = changeText(product);
    priceChange.classList.add(product.changeType);
    productLink.href = product.url || "#";
    productLink.textContent = product.url ? "Conferir no marketplace" : "Link indisponivel";

    renderHistoryStrip(historyStrip, product.history || []);
    fragment.append(card);
  }

  elements.productGrid.append(fragment);
}

function renderHistoryStrip(container, points) {
  container.textContent = "";
  if (!points.length) return;
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, 1);
  for (const point of points) {
    const bar = document.createElement("span");
    const height = 20 + ((point.price - min) / range) * 80;
    bar.style.height = `${height}%`;
    bar.title = `${formatMoney(point.price)} - ${new Date(point.at).toLocaleString("pt-BR")}`;
    container.append(bar);
  }
}

function renderTimeline() {
  elements.timeline.textContent = "";
  state.events = readStorage(EVENTS_KEY, []);

  if (!state.events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Novos produtos e mudancas de preco aparecem aqui.";
    elements.timeline.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const event of state.events) {
    const item = elements.timelineTemplate.content.firstElementChild.cloneNode(true);
    const label = event.type === "new" ? "Novo produto" : event.type === "drop" ? "Queda de preco" : "Aumento de preco";
    item.querySelector(".timeline-title").textContent = `${label} - ${event.source}`;
    item.querySelector(".timeline-detail").textContent = `${event.title} - ${formatMoney(event.price)}`;
    item.querySelector(".timeline-time").textContent = new Date(event.at).toLocaleString("pt-BR");
    item.querySelector(".timeline-dot").classList.add(event.type);
    fragment.append(item);
  }
  elements.timeline.append(fragment);
}

function formatSourceErrorForDisplay(message) {
  if (IS_LOCALHOST && message.includes("MERCADO_LIVRE_ACCESS_TOKEN")) {
    return "Mercado Livre: este servidor local esta sem token. Use https://monitorhub-radar.vercel.app ou autorize o Mercado Livre localmente.";
  }
  return message;
}

function formatMoney(value, currency = "BRL") {
  if (value === null || value === undefined) return "Sem preco";
  if (currency !== "BRL") return `${currency} ${Number(value).toFixed(2)}`;
  return moneyFormatter.format(value);
}

function formatChange(product) {
  if (product.changeType === "new") return "Novo";
  if (product.changeType === "drop") return "Queda";
  if (product.changeType === "up") return "Aumento";
  return "Estavel";
}

function changeText(product) {
  if (product.changeType === "new") return "primeira leitura";
  if (product.priceDiff === null || product.priceDiff === undefined) return "";
  const sign = product.priceDiff > 0 ? "+" : "";
  const percent = product.percentDiff === null ? "" : ` (${sign}${product.percentDiff}%)`;
  return `${sign}${formatMoney(product.priceDiff, product.currency)}${percent}`;
}

function placeholderImage(label) {
  const text = encodeURIComponent(label || "Produto");
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420' viewBox='0 0 640 420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23121816'/%3E%3Cstop offset='1' stop-color='%23293631'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='420' fill='url(%23g)'/%3E%3Ccircle cx='320' cy='175' r='72' fill='%233dd6b7' opacity='.16'/%3E%3Cpath d='M248 254h144l-26 54h-92z' fill='%23f3bd55' opacity='.16'/%3E%3Ctext x='320' y='354' text-anchor='middle' font-family='Arial' font-size='28' font-weight='700' fill='%23a8b8b1'%3E${text}%3C/text%3E%3C/svg%3E`;
}

function bindEvents() {
  elements.refreshNowButton.addEventListener("click", () => {
    clearTimeout(state.timer);
    refreshProducts();
  });

  elements.toggleLiveButton.addEventListener("click", () => {
    state.live = !state.live;
    if (state.live) refreshProducts();
    else {
      clearTimeout(state.timer);
      setConnectionText("Atualizacao pausada");
      updateRunningState();
    }
  });

  elements.saveConfigButton.addEventListener("click", () => {
    saveConfig();
    clearTimeout(state.timer);
    refreshProducts();
  });

  elements.clearHistoryButton.addEventListener("click", () => {
    state.events = [];
    writeStorage(EVENTS_KEY, []);
    writeStorage(SNAPSHOT_KEY, {});
    writeStorage(HISTORY_KEY, {});
    setConnectionText("Historico limpo");
    renderTimeline();
    renderMetrics(state.products);
  });

  [elements.globalSearch, elements.sortMode, elements.onlyChanges].forEach((element) => {
    element.addEventListener("input", render);
    element.addEventListener("change", render);
  });

  [
    elements.demoEnabled,
    elements.mercadoLivreEnabled,
    elements.mercadoLivreQuery,
    elements.amazonEnabled,
    elements.amazonQuery,
    elements.refreshInterval,
    elements.itemLimit,
  ].forEach((element) => {
    element.addEventListener("change", () => {
      saveConfig();
      clearTimeout(state.timer);
      refreshProducts();
    });
  });

  elements.categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category || "all";
      elements.categoryButtons.forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });
}

async function init() {
  state.events = readStorage(EVENTS_KEY, []);
  const hasSavedConfig = localStorage.getItem(CONFIG_KEY) !== null;
  prepareDemoMode();
  applyConfig(readStorage(CONFIG_KEY, null));
  bindEvents();
  render();
  await loadServerConfig();
  applyAutomaticDemoFallback(hasSavedConfig);
  refreshProducts();
}

init();
