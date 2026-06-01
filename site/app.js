const CONFIG_KEY = "radar-produtos-config-v4";
const SNAPSHOT_KEY = "radar-produtos-snapshot-v4";
const EVENTS_KEY = "radar-produtos-events-v4";
const HISTORY_KEY = "radar-produtos-history-v4";
const ALERT_AUTH_KEY = "monitorhub-alert-auth-v1";
const ALERT_DRAFT_KEY = "garimpanda-alert-draft-v1";
const VIEW_MODE_KEY = "garimpanda-product-view-mode-v1";
const DEMO_MODE_AVAILABLE = false;
const IS_LOCALHOST = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const IS_HOME_PAGE = document.body.classList.contains("home-page");
const PRICE_RANGE_DEFAULT_MAX = 10000;
const PRICE_RANGE_STEP = 1;

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
  n8nFeedActive: false,
  n8nUpdatedAt: "",
  fallbackActive: false,
  fallbackReason: "",
  selectedCategory: "all",
  currentPage: 1,
  pageSize: 20,
  minDiscount: 0,
  minRating: 0,
  productViewMode: IS_HOME_PAGE ? "grid" : readStorage(VIEW_MODE_KEY, "grid"),
  auth: readStorage(ALERT_AUTH_KEY, null),
  priceAlerts: [],
  alertsLoading: false,
  selectedAlertProduct: null,
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
  sourceFilter: document.querySelector("#sourceFilter"),
  minPriceFilter: document.querySelector("#minPriceFilter"),
  maxPriceFilter: document.querySelector("#maxPriceFilter"),
  minPriceRange: document.querySelector("#minPriceRange"),
  maxPriceRange: document.querySelector("#maxPriceRange"),
  priceRangeControl: document.querySelector("#priceRangeControl"),
  discountButtons: document.querySelectorAll(".discount-filter"),
  ratingButtons: document.querySelectorAll(".rating-filter"),
  clearProductFiltersButton: document.querySelector("#clearProductFiltersButton"),
  viewModeButtons: document.querySelectorAll("[data-view-mode]"),
  productResultCount: document.querySelector("#productResultCount"),
  productRangeText: document.querySelector("#productRangeText"),
  productPagination: document.querySelector("#productPagination"),
  pageSizeSelect: document.querySelector("#pageSizeSelect"),
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
  supabaseStatus: document.querySelector("#supabaseStatus"),
  authForms: document.querySelector("#authForms"),
  signupForm: document.querySelector("#signupForm"),
  signupName: document.querySelector("#signupName"),
  signupEmail: document.querySelector("#signupEmail"),
  signupPhone: document.querySelector("#signupPhone"),
  signupPassword: document.querySelector("#signupPassword"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  logoutButton: document.querySelector("#logoutButton"),
  alertsWorkspace: document.querySelector("#alertsWorkspace"),
  sessionUserName: document.querySelector("#sessionUserName"),
  sessionUserEmail: document.querySelector("#sessionUserEmail"),
  priceAlertForm: document.querySelector("#priceAlertForm"),
  selectedProductPreview: document.querySelector("#selectedProductPreview"),
  alertProductQuery: document.querySelector("#alertProductQuery"),
  alertBrand: document.querySelector("#alertBrand"),
  alertTargetPrice: document.querySelector("#alertTargetPrice"),
  alertSource: document.querySelector("#alertSource"),
  alertChannel: document.querySelector("#alertChannel"),
  alertNotificationEmail: document.querySelector("#alertNotificationEmail"),
  alertWhatsappPhone: document.querySelector("#alertWhatsappPhone"),
  reloadAlertsButton: document.querySelector("#reloadAlertsButton"),
  priceAlertsList: document.querySelector("#priceAlertsList"),
  userChips: document.querySelectorAll("[data-user-chip]"),
  googleLoginButtons: document.querySelectorAll("[data-google-login]"),
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

async function consumeOAuthRedirect() {
  const params = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "");
  const accessToken = params.get("access_token");
  const error = params.get("error_description") || params.get("error");

  if (error) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setSupabaseStatus(`Login com Google interrompido: ${error}`, false);
    return;
  }

  if (!accessToken) return;

  const refreshToken = params.get("refresh_token") || "";
  const expiresIn = Number(params.get("expires_in") || 0);
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : "";
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

  state.auth = {
    user: {},
    session: {
      accessToken,
      refreshToken,
      expiresAt,
    },
  };

  try {
    const payload = await apiRequest("/api/auth/me");
    state.auth.user = payload.user;
    writeStorage(ALERT_AUTH_KEY, state.auth);
    setSupabaseStatus("Login com Google confirmado.", true);
  } catch (error) {
    clearAuthSession();
    setSupabaseStatus(error.message || "Nao foi possivel concluir o login com Google.", false);
  }
}

function startGoogleLogin(targetPath = `${window.location.pathname}${window.location.search}`) {
  const redirectTo = new URL(targetPath || "/produtos.html", window.location.origin);
  window.location.href = `/api/auth/google?redirectTo=${encodeURIComponent(redirectTo.toString())}`;
}

function getConfig() {
  return {
    demoEnabled: DEMO_MODE_AVAILABLE && Boolean(elements.demoEnabled?.checked),
    mercadoLivreEnabled: elements.mercadoLivreEnabled?.checked !== false,
    mercadoLivreQuery: elements.mercadoLivreQuery?.value.trim() || "ofertas",
    amazonEnabled: elements.amazonEnabled?.checked !== false,
    amazonQuery: elements.amazonQuery?.value.trim() || "ofertas do dia",
    refreshInterval: Number(elements.refreshInterval?.value || 30000),
    itemLimit: Math.max(20, Math.min(Number(elements.itemLimit?.value || 1000), 2000)),
  };
}

function applyConfig(config) {
  if (!config) return;
  if (elements.demoEnabled) elements.demoEnabled.checked = DEMO_MODE_AVAILABLE && Boolean(config.demoEnabled);
  if (elements.mercadoLivreEnabled) elements.mercadoLivreEnabled.checked = config.mercadoLivreEnabled !== false;
  if (elements.mercadoLivreQuery) elements.mercadoLivreQuery.value = config.mercadoLivreQuery || "ofertas";
  if (elements.amazonEnabled) elements.amazonEnabled.checked = config.amazonEnabled !== false;
  if (elements.amazonQuery) elements.amazonQuery.value = config.amazonQuery || "ofertas do dia";
  if (elements.refreshInterval) elements.refreshInterval.value = String(config.refreshInterval || 30000);
  if (elements.itemLimit) elements.itemLimit.value = String(Math.max(Number(config.itemLimit || 1000), 1000));
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
    setSupabaseStatus("Supabase: servidor indisponivel", false);
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
  setSupabaseStatus(
    config.supabaseConfigured ? "Supabase: cadastro e alertas ativos" : `Supabase: configure ${config.supabaseRequiredEnv?.join(", ") || "variaveis"}`,
    config.supabaseConfigured,
  );
}

function applyAutomaticDemoFallback(hasSavedConfig) {
  if (!state.serverConfig || hasSavedConfig) return;
  setConnectionText("Modo real aguardando credenciais");
}

function setStatusElement(element, text, ready) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("ready", Boolean(ready));
  element.classList.toggle("missing", !ready);
}

function setSupabaseStatus(text, ready) {
  if (!elements.supabaseStatus) return;
  elements.supabaseStatus.textContent = text;
  elements.supabaseStatus.classList.toggle("ready", Boolean(ready));
  elements.supabaseStatus.classList.toggle("missing", !ready);
}

function prepareDemoMode() {
  if (!elements.demoEnabled) return;
  elements.demoEnabled.checked = false;
  elements.demoEnabled.disabled = !DEMO_MODE_AVAILABLE;
  elements.demoEnabled.closest(".toggle-row")?.classList.toggle("is-hidden", !DEMO_MODE_AVAILABLE);
}

function normalizeRadarSourceSelection(changedElement = null) {
  if (!elements.mercadoLivreEnabled || !elements.amazonEnabled) return;
  if (elements.mercadoLivreEnabled.checked || elements.amazonEnabled.checked) return;

  if (changedElement === elements.mercadoLivreEnabled) {
    elements.amazonEnabled.checked = true;
    return;
  }

  elements.mercadoLivreEnabled.checked = true;
}

async function fetchProductsFromBackend(config) {
  const n8nPayload = await fetchN8nProducts(config.itemLimit);
  if (n8nPayload && (n8nPayload.products?.length || n8nPayload.updatedAt || n8nPayload.errors?.length)) {
    setStatusElement(elements.mercadoLivreStatus, "n8n: feed conectado ao dashboard", true);
    return n8nPayload;
  }

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

async function fetchN8nProducts(limit) {
  try {
    const params = new URLSearchParams({ limit: String(limit) });
    const response = await fetch(`/api/n8n/products?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    return {
      ...payload,
      source: "n8n",
      products: Array.isArray(payload.products) ? payload.products : [],
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      fallback: payload.fallback || { active: false },
      fetchedAt: payload.updatedAt || payload.fetchedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function verifyStoredSession() {
  if (!state.auth?.session?.accessToken) {
    renderPriceAlertsArea();
    return;
  }

  try {
    const payload = await apiRequest("/api/auth/me");
    state.auth.user = payload.user;
    writeStorage(ALERT_AUTH_KEY, state.auth);
    await loadPriceAlerts();
  } catch {
    clearAuthSession();
  }
  renderPriceAlertsArea();
}

async function submitSignup(event) {
  event.preventDefault();
  setAuthLoading(true);
  try {
    const payload = await apiRequest("/api/auth/signup", {
      method: "POST",
      body: {
        name: elements.signupName.value,
        email: elements.signupEmail.value,
        phone: elements.signupPhone.value,
        password: elements.signupPassword.value,
      },
      skipAuth: true,
    });
    handleAuthPayload(payload);
    if (payload.requiresEmailConfirmation) {
      setSupabaseStatus("Cadastro criado. Confirme o e-mail no Supabase antes de entrar.", true);
    } else {
      setSupabaseStatus("Conta criada e conectada.", true);
      await loadPriceAlerts();
    }
    elements.signupPassword.value = "";
  } catch (error) {
    setSupabaseStatus(error.message || "Falha ao cadastrar usuario.", false);
  } finally {
    setAuthLoading(false);
    renderPriceAlertsArea();
  }
}

async function submitLogin(event) {
  event.preventDefault();
  setAuthLoading(true);
  try {
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        email: elements.loginEmail.value,
        password: elements.loginPassword.value,
      },
      skipAuth: true,
    });
    handleAuthPayload(payload);
    setSupabaseStatus("Usuario conectado ao Supabase.", true);
    elements.loginPassword.value = "";
    await loadPriceAlerts();
  } catch (error) {
    setSupabaseStatus(error.message || "Falha ao entrar.", false);
  } finally {
    setAuthLoading(false);
    renderPriceAlertsArea();
  }
}

function handleAuthPayload(payload) {
  if (!payload?.session?.accessToken) return;
  state.auth = {
    user: payload.user,
    session: payload.session,
  };
  writeStorage(ALERT_AUTH_KEY, state.auth);
  prefillAlertContacts();
  renderUserHeader();
}

function clearAuthSession() {
  state.auth = null;
  state.priceAlerts = [];
  localStorage.removeItem(ALERT_AUTH_KEY);
  renderUserHeader();
  renderPriceAlertsArea();
}

async function loadPriceAlerts() {
  if (!state.auth?.session?.accessToken) return;
  state.alertsLoading = true;
  renderPriceAlertsArea();
  try {
    const payload = await apiRequest("/api/alerts");
    state.priceAlerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  } catch (error) {
    setSupabaseStatus(error.message || "Falha ao carregar alertas.", false);
  } finally {
    state.alertsLoading = false;
    renderPriceAlertsArea();
  }
}

async function submitPriceAlert(event) {
  event.preventDefault();
  if (!state.auth?.session?.accessToken) {
    setSupabaseStatus("Entre na sua conta para criar alertas.", false);
    return;
  }

  const productQuery = elements.alertProductQuery.value.trim();
  const targetPrice = Number(elements.alertTargetPrice.value);
  if (!productQuery || !targetPrice) {
    setSupabaseStatus("Informe produto e preco maximo.", false);
    return;
  }

  setAlertFormLoading(true);
  try {
    const payload = await apiRequest("/api/alerts", {
      method: "POST",
      body: {
        productQuery,
        brand: elements.alertBrand.value,
        targetPrice,
        source: elements.alertSource.value,
        notificationChannel: elements.alertChannel.value,
        notificationEmail: elements.alertNotificationEmail.value,
        whatsappPhone: elements.alertWhatsappPhone.value,
        product: state.selectedAlertProduct,
      },
    });
    state.priceAlerts = [payload.alert, ...state.priceAlerts];
    elements.priceAlertForm.reset();
    state.selectedAlertProduct = null;
    prefillAlertContacts();
    setSupabaseStatus("Alerta salvo. O n8n vai comparar nas proximas coletas.", true);
  } catch (error) {
    setSupabaseStatus(error.message || "Falha ao salvar alerta.", false);
  } finally {
    setAlertFormLoading(false);
    renderPriceAlertsArea();
  }
}

async function deleteSavedAlert(id) {
  try {
    await apiRequest(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    state.priceAlerts = state.priceAlerts.filter((alert) => alert.id !== id);
    setSupabaseStatus("Alerta removido.", true);
  } catch (error) {
    setSupabaseStatus(error.message || "Falha ao remover alerta.", false);
  } finally {
    renderPriceAlertsArea();
  }
}

async function toggleSavedAlert(alert) {
  try {
    const nextStatus = alert.status === "active" ? "paused" : "active";
    const payload = await apiRequest("/api/alerts", {
      method: "PATCH",
      body: { id: alert.id, status: nextStatus },
    });
    state.priceAlerts = state.priceAlerts.map((item) => item.id === alert.id ? payload.alert : item);
    setSupabaseStatus(nextStatus === "active" ? "Alerta reativado." : "Alerta pausado.", true);
  } catch (error) {
    setSupabaseStatus(error.message || "Falha ao alterar alerta.", false);
  } finally {
    renderPriceAlertsArea();
  }
}

async function apiRequest(url, options = {}) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (!options.skipAuth && state.auth?.session?.accessToken) {
    headers.Authorization = `Bearer ${state.auth.session.accessToken}`;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    cache: "no-store",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function setAuthLoading(loading) {
  [elements.signupForm, elements.loginForm].forEach((form) => {
    form?.querySelectorAll("button, input").forEach((item) => {
      item.disabled = loading;
    });
  });
  elements.googleLoginButtons.forEach((button) => {
    button.disabled = loading;
  });
}

function setAlertFormLoading(loading) {
  elements.priceAlertForm?.querySelectorAll("button, input, select").forEach((item) => {
    item.disabled = loading;
  });
}

function prefillAlertContacts() {
  const user = state.auth?.user || {};
  if (elements.alertNotificationEmail && !elements.alertNotificationEmail.value) {
    elements.alertNotificationEmail.value = user.email || "";
  }
  if (elements.alertWhatsappPhone && !elements.alertWhatsappPhone.value) {
    elements.alertWhatsappPhone.value = user.phone || "";
  }
}

function prefillAlertFromProduct(product) {
  const draft = {
    productQuery: product.title || "",
    brand: product.seller && product.seller.length <= 30 ? product.seller : "",
    targetPrice: product.price ? Number(product.price).toFixed(2) : "",
    source: product.sourceKind === "amazon" ? "amazon" : product.sourceKind === "mercadolivre" ? "mercadolivre" : "all",
    product: selectedProductDraft(product),
  };
  sessionStorage.setItem(ALERT_DRAFT_KEY, JSON.stringify(draft));

  if (!elements.priceAlertForm || !elements.alertProductQuery) {
    window.location.href = "./radar.html#meus-alertas";
    return;
  }

  if (!state.auth?.session?.accessToken) {
    location.hash = "#meus-alertas";
    setSupabaseStatus("Entre ou cadastre-se para criar alertas personalizados.", false);
    applyAlertDraft(draft);
    return;
  }

  location.hash = "#meus-alertas";
  applyAlertDraft(draft);
  prefillAlertContacts();
  setSupabaseStatus("Produto preenchido. Ajuste o preco alvo antes de salvar.", true);
}

function applyStoredAlertDraft() {
  if (!elements.priceAlertForm || !elements.alertProductQuery) return;
  try {
    const draft = JSON.parse(sessionStorage.getItem(ALERT_DRAFT_KEY) || "null");
    if (!draft) return;
    applyAlertDraft(draft);
    sessionStorage.removeItem(ALERT_DRAFT_KEY);
  } catch {
    sessionStorage.removeItem(ALERT_DRAFT_KEY);
  }
}

function applyAlertDraft(draft) {
  state.selectedAlertProduct = draft.product || null;
  if (elements.alertProductQuery) elements.alertProductQuery.value = draft.productQuery || "";
  if (elements.alertBrand) elements.alertBrand.value = draft.brand || "";
  if (elements.alertTargetPrice) elements.alertTargetPrice.value = draft.targetPrice || "";
  if (elements.alertSource) elements.alertSource.value = draft.source || "all";
  renderSelectedProductPreview();
}

function selectedProductDraft(product) {
  if (!product) return null;
  return {
    id: String(product.id || ""),
    key: String(product.key || `${product.source || product.sourceKind || "marketplace"}:${product.id || product.url || product.title}`),
    title: String(product.title || ""),
    url: String(product.url || ""),
    image: String(product.image || ""),
    source: compactSourceName(product.source),
    sourceKind: String(product.sourceKind || ""),
    currentPrice: product.price ?? null,
    originalPrice: product.originalPrice ?? null,
    currency: product.currency || "BRL",
  };
}

function renderSelectedProductPreview() {
  const container = elements.selectedProductPreview;
  if (!container) return;
  container.textContent = "";
  container.classList.toggle("is-hidden", !state.selectedAlertProduct);
  if (!state.selectedAlertProduct) return;

  const product = state.selectedAlertProduct;
  const image = document.createElement("img");
  image.src = product.image || placeholderImage(product.source);
  image.alt = "";

  const content = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = "Produto selecionado";
  const title = document.createElement("strong");
  title.textContent = product.title || "Produto do catalogo";
  const meta = document.createElement("p");
  meta.textContent = [
    product.source || "Fonte",
    product.currentPrice ? `preco atual ${formatMoney(product.currentPrice, product.currency)}` : "",
  ].filter(Boolean).join(" | ");
  content.append(label, title, meta);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "text-button";
  clearButton.textContent = "Remover";
  clearButton.addEventListener("click", () => {
    state.selectedAlertProduct = null;
    renderSelectedProductPreview();
  });

  container.append(image, content, clearButton);
}

function renderPriceAlertsArea() {
  const isLoggedIn = Boolean(state.auth?.session?.accessToken);
  renderUserHeader();
  elements.authForms?.classList.toggle("is-hidden", isLoggedIn);
  elements.alertsWorkspace?.classList.toggle("is-hidden", !isLoggedIn);
  elements.logoutButton?.classList.toggle("is-hidden", !isLoggedIn);

  const user = state.auth?.user || {};
  if (elements.sessionUserName) {
    elements.sessionUserName.textContent = user.name || "Usuario conectado";
  }
  if (elements.sessionUserEmail) {
    elements.sessionUserEmail.textContent = user.email || "Sincronizado com Supabase";
  }

  prefillAlertContacts();
  renderSelectedProductPreview();
  renderSavedPriceAlerts();
}

function renderUserHeader() {
  if (!elements.userChips?.length) return;
  const user = state.auth?.user || {};
  const isLoggedIn = Boolean(state.auth?.session?.accessToken);
  const displayName = isLoggedIn ? displayUserName(user) : "Visitante";
  const status = isLoggedIn ? "Radar ativo" : "Entrar para alertas";
  const initials = userInitials(displayName, user.email);

  elements.userChips.forEach((chip) => {
    const avatar = chip.querySelector("[data-user-avatar]");
    const name = chip.querySelector("[data-user-name]");
    const userStatus = chip.querySelector("[data-user-status]");

    chip.classList.toggle("is-logged-in", isLoggedIn);
    chip.setAttribute("href", isLoggedIn ? "./radar.html#meus-alertas" : "./index.html");
    chip.setAttribute("aria-label", isLoggedIn ? `Conta de ${displayName}` : "Entrar no Garimpanda");

    if (name) name.textContent = isLoggedIn ? `Ola, ${displayName}` : displayName;
    if (userStatus) userStatus.textContent = status;
    if (!avatar) return;

    avatar.textContent = "";
    avatar.classList.toggle("has-photo", Boolean(isLoggedIn && user.avatarUrl));
    if (isLoggedIn && user.avatarUrl) {
      const image = document.createElement("img");
      image.src = user.avatarUrl;
      image.alt = "";
      image.referrerPolicy = "no-referrer";
      avatar.append(image);
    } else {
      avatar.textContent = initials;
    }
  });
}

function displayUserName(user = {}) {
  const value = String(user.name || "").trim();
  if (value) return value.split(/\s+/).slice(0, 2).join(" ");
  const email = String(user.email || "").trim();
  return email ? email.split("@")[0] : "Usuario";
}

function userInitials(name, email = "") {
  const source = String(name || email || "U").trim();
  const words = source.includes("@") ? [source.split("@")[0]] : source.split(/\s+/);
  return words.slice(0, 2).map((word) => word[0] || "").join("").toUpperCase() || "U";
}

function renderSavedPriceAlerts() {
  const list = elements.priceAlertsList;
  if (!list) return;

  list.textContent = "";
  if (!state.auth?.session?.accessToken) return;

  if (state.alertsLoading) {
    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = "Carregando alertas salvos...";
    list.append(loading);
    return;
  }

  if (!state.priceAlerts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhum alerta salvo ainda. Escolha um produto e defina um preco maximo.";
    list.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.priceAlerts.forEach((alert) => {
    const card = document.createElement("article");
    card.className = "saved-alert-card";
    card.dataset.status = alert.status;

    const header = document.createElement("div");
    header.className = "saved-alert-header";
    const titleWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = alert.productTitle || alert.productQuery;
    const meta = document.createElement("p");
    meta.textContent = [
      sourceLabel(alert.source),
      alert.brand ? `Marca: ${alert.brand}` : "",
      channelLabel(alert.notificationChannel),
    ].filter(Boolean).join(" | ");
    titleWrap.append(title, meta);

    const status = document.createElement("span");
    status.className = `alert-status ${alert.status === "paused" ? "paused" : "active"}`;
    status.textContent = alert.status === "paused" ? "Pausado" : "Ativo";
    header.append(titleWrap, status);

    const productSummary = document.createElement("div");
    productSummary.className = "saved-alert-product";
    if (alert.productImage || alert.productUrl || alert.productCurrentPrice) {
      const image = document.createElement("img");
      image.src = alert.productImage || placeholderImage(alert.productSourceLabel || alert.source);
      image.alt = "";
      const productCopy = document.createElement("div");
      const productTitle = document.createElement("span");
      productTitle.textContent = alert.productQuery;
      const productMeta = document.createElement("small");
      productMeta.textContent = [
        alert.productSourceLabel || sourceLabel(alert.source),
        alert.productCurrentPrice ? `preco salvo ${formatMoney(alert.productCurrentPrice, alert.productCurrency)}` : "",
      ].filter(Boolean).join(" | ");
      productCopy.append(productTitle, productMeta);
      productSummary.append(image, productCopy);
      if (alert.productUrl) {
        const link = document.createElement("a");
        link.href = alert.productUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = "Ver produto";
        productSummary.append(link);
      }
    }

    const details = document.createElement("div");
    details.className = "saved-alert-details";
    details.append(
      alertMetric("Preco alvo", formatMoney(alert.targetPrice)),
      alertMetric("Ultimo aviso", alert.lastNotifiedAt ? new Date(alert.lastNotifiedAt).toLocaleString("pt-BR") : "Ainda nao enviado"),
      alertMetric("Contato", alert.notificationChannel === "whatsapp" ? alert.whatsappPhone : alert.userEmail),
    );

    const actions = document.createElement("div");
    actions.className = "saved-alert-actions";
    const toggleButton = document.createElement("button");
    toggleButton.className = "secondary-button compact";
    toggleButton.type = "button";
    toggleButton.textContent = alert.status === "paused" ? "Reativar" : "Pausar";
    toggleButton.addEventListener("click", () => toggleSavedAlert(alert));

    const deleteButton = document.createElement("button");
    deleteButton.className = "text-button danger";
    deleteButton.type = "button";
    deleteButton.textContent = "Excluir";
    deleteButton.addEventListener("click", () => deleteSavedAlert(alert.id));
    actions.append(toggleButton, deleteButton);

    card.append(header);
    if (productSummary.childElementCount) card.append(productSummary);
    card.append(details, actions);
    fragment.append(card);
  });

  list.append(fragment);
}

function alertMetric(label, value) {
  const item = document.createElement("span");
  item.className = "alert-metric";
  const strong = document.createElement("strong");
  strong.textContent = label;
  const small = document.createElement("small");
  small.textContent = value || "-";
  item.append(strong, small);
  return item;
}

function sourceLabel(source) {
  if (source === "amazon") return "Amazon";
  if (source === "mercadolivre") return "Mercado Livre";
  return "Todas as fontes";
}

function channelLabel(channel) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "both") return "E-mail e WhatsApp";
  return "E-mail";
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
    state.n8nFeedActive = false;
    state.n8nUpdatedAt = "";
    state.loading = false;
    setConnectionText("Nenhuma fonte ativa");
    render();
    return;
  }

  try {
    const payload = await fetchProductsFromBackend(config);
    state.n8nFeedActive = payload.source === "n8n";
    state.n8nUpdatedAt = payload.updatedAt || "";
    state.sourceErrors = payload.errors || [];
    state.fallbackActive = Boolean(payload.fallback?.active);
    state.fallbackReason = payload.fallback?.reason || "";
    state.products = withChanges((payload.products || []).filter((product) => product.id && product.title));
    state.lastUpdated = payload.fetchedAt ? new Date(payload.fetchedAt) : new Date();
    if (state.n8nFeedActive && state.products.length) {
      setConnectionText("Feed n8n atualizado");
    } else if (state.n8nFeedActive) {
      setConnectionText("Aguardando produtos do n8n");
    } else if (state.fallbackActive || (config.demoEnabled && !state.serverConfig?.realSourcesReady && !config.mercadoLivreEnabled && !config.amazonEnabled)) {
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
    state.n8nFeedActive = false;
    state.n8nUpdatedAt = "";
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
  if (/(fone|headset|caixa|speaker|audio|microfone|bluetooth|jbl|sound|buds)/.test(text)) return "audio";
  if (/(notebook|laptop|ssd|monitor|teclado|mouse|memoria|processador|tablet|impressora|roteador|hd|pendrive)/.test(text)) return "informatica";
  if (/(celular|smartphone|iphone|motorola|samsung|xiaomi|smart tv|tv |televisor|camera|carregador|power bank|relogio|smartwatch|console)/.test(text)) return "eletronicos";
  if (/(cafeteira|liquidificador|air fryer|fritadeira|batedeira|panela|cozinha|forno|cooktop|geladeira)/.test(text)) return "cozinha";
  if (/(camisa|calca|tenis|sapato|vestido|bolsa|mochila|jacket|shirt|moda|roupa)/.test(text)) return "moda";
  if (/(casa|lampada|mesa|cadeira|aspirador|robo aspirador|decoracao|organizadora)/.test(text)) return "casa";
  if (/(game|console|playstation|xbox|nintendo|controle|gamer)/.test(text)) return "games";
  return "outros";
}

function curationNote(product) {
  if (isPromotion(product)) {
    const label = product.promotionName || product.promotionType || "promocao ativa";
    const discount = promotionDiscountText(product);
    return `${label}${discount ? ` - ${discount}` : ""}. Item enviado pelo n8n por estar com preco promocional no Mercado Livre.`;
  }
  if (product.changeType === "drop") return "Queda detectada. Vale confirmar frete, garantia e vendedor antes de decidir.";
  if (product.changeType === "new") return "Novo item no radar. Acompanhe mais leituras para entender se o preco se sustenta.";
  if (product.category === "eletronicos") return "Confira garantia, voltagem, compatibilidade e reputacao do vendedor.";
  if (product.category === "informatica") return "Compare especificacoes, memoria, armazenamento e garantia com alternativas proximas.";
  if (product.category === "audio") return "Observe autonomia, compatibilidade, conforto e politica de devolucao.";
  if (product.category === "cozinha") return "Confira capacidade, voltagem, dimensoes e avaliacoes recentes.";
  if (product.category === "moda") return "Verifique tamanho, material, tabela de medidas e politica de troca.";
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
  if (elements.refreshNowButton) {
    elements.refreshNowButton.disabled = state.loading;
    elements.refreshNowButton.textContent = state.loading ? "Atualizando" : "Atualizar";
  }
  if (elements.toggleLiveButton) {
    elements.toggleLiveButton.textContent = state.live ? "Pausar" : "Retomar";
  }
}

function setConnectionText(text) {
  if (elements.connectionText) elements.connectionText.textContent = text;
}

function productSourceToken(product) {
  return String(product.sourceKind || product.source || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function selectedSourceFilters() {
  const checkboxSources = [
    { element: elements.mercadoLivreEnabled, value: "mercadolivre" },
    { element: elements.amazonEnabled, value: "amazon" },
  ].filter((item) => item.element);

  if (checkboxSources.length) {
    return checkboxSources.filter((item) => item.element.checked).map((item) => item.value);
  }

  const source = elements.sourceFilter?.value || "all";
  return source === "all" ? [] : [source];
}

function visibleProducts() {
  const term = elements.globalSearch?.value.trim().toLowerCase() || "";
  const onlyChanges = Boolean(elements.onlyChanges?.checked);
  const selectedSources = selectedSourceFilters();
  const { min: minPrice, max: maxPrice, maxLimit: maxPriceLimit } = normalizedPriceValues();
  let products = [...state.products];

  if (term) {
    products = products.filter((product) => [product.title, product.source, product.seller, product.query, product.category].join(" ").toLowerCase().includes(term));
  }

  if (onlyChanges) products = products.filter((product) => product.changeType !== "stable");
  if (state.selectedCategory !== "all") products = products.filter((product) => product.category === state.selectedCategory);
  if (selectedSources.length) products = products.filter((product) => selectedSources.some((source) => productSourceToken(product).includes(source)));
  if (minPrice > 0) products = products.filter((product) => Number(product.price || 0) >= minPrice);
  if (maxPrice < maxPriceLimit) products = products.filter((product) => Number(product.price || 0) <= maxPrice);
  if (state.minDiscount > 0) products = products.filter((product) => Number(product.discountPercent || discountFromPrices(product) || 0) >= state.minDiscount);
  if (state.minRating > 0) products = products.filter((product) => productRatingValue(product) >= state.minRating);

  const sortMode = elements.sortMode?.value || "change";
  products.sort((a, b) => {
    if (sortMode === "priceAsc") return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (sortMode === "priceDesc") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
    if (sortMode === "discount") return (discountFromPrices(b) ?? 0) - (discountFromPrices(a) ?? 0);
    if (sortMode === "source") return a.source.localeCompare(b.source) || a.title.localeCompare(b.title);
    return changeWeight(a.changeType) - changeWeight(b.changeType) || a.source.localeCompare(b.source);
  });

  return products;
}

function discountFromPrices(product) {
  const explicit = Number(product.discountPercent);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (product.originalPrice && product.price && product.originalPrice > product.price) {
    return ((product.originalPrice - product.price) / product.originalPrice) * 100;
  }
  return 0;
}

function changeWeight(type) {
  return { drop: 0, new: 1, up: 2, stable: 3 }[type] ?? 4;
}

function clampCurrentPage(totalProducts) {
  const totalPages = Math.max(1, Math.ceil(totalProducts / state.pageSize));
  state.currentPage = Math.max(1, Math.min(state.currentPage, totalPages));
}

function paginatedProducts(products) {
  const start = (state.currentPage - 1) * state.pageSize;
  return products.slice(start, start + state.pageSize);
}

function renderProductSummary(totalProducts, pageCount) {
  if (!elements.productResultCount || !elements.productRangeText) return;
  const start = totalProducts ? (state.currentPage - 1) * state.pageSize + 1 : 0;
  const end = totalProducts ? start + pageCount - 1 : 0;
  elements.productResultCount.textContent = `${dashboardFormatter.format(totalProducts)} produtos encontrados`;
  elements.productRangeText.textContent = `Mostrando ${dashboardFormatter.format(start)}-${dashboardFormatter.format(end)} de ${dashboardFormatter.format(totalProducts)}`;
}

function normalizedProductViewMode(mode) {
  return mode === "list" ? "list" : "grid";
}

function setProductViewMode(mode, persist = true) {
  state.productViewMode = normalizedProductViewMode(mode);
  renderProductViewMode();
  if (persist) writeStorage(VIEW_MODE_KEY, state.productViewMode);
}

function renderProductViewMode() {
  const mode = normalizedProductViewMode(state.productViewMode);
  state.productViewMode = mode;
  elements.productGrid?.classList.toggle("product-list-view", mode === "list");
  elements.productGrid?.classList.toggle("product-card-view", mode === "grid");
  elements.viewModeButtons.forEach((button) => {
    const isActive = button.dataset.viewMode === mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderPagination(totalProducts) {
  const container = elements.productPagination;
  if (!container) return;
  container.textContent = "";
  const totalPages = Math.max(1, Math.ceil(totalProducts / state.pageSize));
  if (totalPages <= 1) return;

  const pages = paginationPages(totalPages, state.currentPage);
  container.append(paginationButton("‹", state.currentPage - 1, state.currentPage === 1));
  pages.forEach((page) => {
    if (page === "...") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "pagination-ellipsis";
      ellipsis.textContent = "...";
      container.append(ellipsis);
      return;
    }
    container.append(paginationButton(String(page), page, false, page === state.currentPage));
  });
  container.append(paginationButton("›", state.currentPage + 1, state.currentPage === totalPages));
}

function paginationPages(totalPages, currentPage) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) pages.push("...");
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < totalPages - 1) pages.push("...");
  pages.push(totalPages);
  return pages;
}

function paginationButton(label, page, disabled, active = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.className = active ? "active" : "";
  button.addEventListener("click", () => {
    state.currentPage = page;
    render();
    document.querySelector("#anuncios")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  return button;
}

function renderCategoryCounts(products) {
  const counts = products.reduce((accumulator, product) => {
    accumulator.all += 1;
    accumulator[product.category] = (accumulator[product.category] || 0) + 1;
    return accumulator;
  }, {
    all: 0,
    eletronicos: 0,
    casa: 0,
    informatica: 0,
    audio: 0,
    games: 0,
    cozinha: 0,
    moda: 0,
    outros: 0,
  });

  setCountText("categoryCountAll", counts.all);
  setCountText("categoryCountEletronicos", counts.eletronicos);
  setCountText("categoryCountCasa", counts.casa);
  setCountText("categoryCountInformatica", counts.informatica);
  setCountText("categoryCountAudio", counts.audio);
  setCountText("categoryCountGames", counts.games);
  setCountText("categoryCountCozinha", counts.cozinha);
  setCountText("categoryCountModa", counts.moda);
  setCountText("categoryCountOutros", counts.outros);
}

function setCountText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = dashboardFormatter.format(value || 0);
}

function render() {
  renderUserHeader();
  renderPriceRangeControls(state.products);
  const products = visibleProducts();
  clampCurrentPage(products.length);
  const pageProducts = paginatedProducts(products);
  renderProductViewMode();
  renderMetrics(state.products);
  renderCategoryCounts(state.products);
  renderProductSummary(products.length, pageProducts.length);
  renderProducts(pageProducts);
  renderPagination(products.length);
  renderTimeline();
  renderDashboardStatus();
  renderActivityChart();
  renderRecentAlertsTable();
  renderPriceAlertsArea();
  updateRunningState();
  if (elements.lastUpdatedText) {
    elements.lastUpdatedText.textContent = state.lastUpdated
      ? `${state.lastUpdated.toLocaleDateString("pt-BR")} ${state.lastUpdated.toLocaleTimeString("pt-BR")}`
      : "Nenhuma coleta realizada";
  }
}

function renderPriceRangeControls(products) {
  if (!elements.minPriceRange || !elements.maxPriceRange || !elements.priceRangeControl) return;

  const rangeMax = priceRangeMax(products);
  [elements.minPriceRange, elements.maxPriceRange].forEach((range) => {
    range.max = String(rangeMax);
    range.step = String(PRICE_RANGE_STEP);
  });

  syncPriceRangesFromFields();
}

function priceRangeMax(products) {
  const highestPrice = products.reduce((highest, product) => {
    const values = [product.price, product.originalPrice].map(Number).filter(Number.isFinite);
    return Math.max(highest, ...values);
  }, 0);
  if (!highestPrice) return PRICE_RANGE_DEFAULT_MAX;
  const rounded = Math.ceil(highestPrice / 500) * 500;
  return Math.max(1000, rounded);
}

function renderMetrics(products) {
  if (!elements.totalProducts && !elements.newProducts && !elements.dropProducts && !elements.activeSources && !elements.alertsSent) return;
  const events = readStorage(EVENTS_KEY, []);
  const priceChanges = products.filter((product) => ["drop", "up"].includes(product.changeType)).length;
  const newProducts = products.filter((product) => product.changeType === "new").length;
  const activeSources = new Set(products.map((product) => product.source)).size;

  if (elements.totalProducts) elements.totalProducts.textContent = dashboardFormatter.format(products.length);
  if (elements.newProducts) elements.newProducts.textContent = dashboardFormatter.format(newProducts);
  if (elements.dropProducts) elements.dropProducts.textContent = dashboardFormatter.format(priceChanges);
  if (elements.activeSources) elements.activeSources.textContent = String(activeSources);
  if (elements.alertsSent) elements.alertsSent.textContent = dashboardFormatter.format(events.length);
}

function renderDashboardStatus() {
  if (!elements.automationLastRun && !elements.automationNextRun && !elements.automationToday) return;
  const lastRun = state.lastUpdated || new Date();
  const nextRun = new Date(lastRun.getTime() + getConfig().refreshInterval);
  if (elements.automationLastRun) elements.automationLastRun.textContent = state.lastUpdated
    ? `${state.lastUpdated.toLocaleDateString("pt-BR")} ${state.lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : "Aguardando coleta";
  if (elements.automationNextRun) elements.automationNextRun.textContent = state.live
    ? `${nextRun.toLocaleDateString("pt-BR")} ${nextRun.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : "Atualização pausada";
  if (elements.automationToday) elements.automationToday.textContent = String(Math.max(8, Math.min(24, readStorage(EVENTS_KEY, []).length || 8)));
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
  link.href = "./produtos.html";
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

function compactSourceName(source = "") {
  const normalized = source.toLowerCase();
  if (normalized.includes("mercado")) return "Mercado Livre";
  if (normalized.includes("amazon")) return "Amazon";
  if (normalized.includes("shopee")) return "Shopee";
  if (normalized.includes("olx")) return "OLX";
  return source || "Fonte";
}

function renderProducts(products) {
  if (!elements.productGrid || !elements.productTemplate) return;
  elements.productGrid.textContent = "";

  if (!state.n8nFeedActive && !state.sourceErrors.length && !products.length) {
    const warning = document.createElement("div");
    warning.className = "warning-state";
    warning.textContent = "Aguardando o n8n enviar produtos para /api/n8n/products.";
    elements.productGrid.append(warning);
  }

  if (state.fallbackActive) {
    const warning = document.createElement("div");
    warning.className = "warning-state";
    warning.textContent = state.fallbackReason || "Modo demonstracao ativo enquanto as fontes reais sao configuradas.";
    elements.productGrid.append(warning);
  }

  if (state.sourceErrors.length) {
    const error = document.createElement("div");
    error.className = products.length || state.sourceErrors.every(isOperationalSourceMessage) ? "warning-state" : "error-state";
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
    const rating = card.querySelector(".product-rating");
    const historyStrip = card.querySelector(".history-strip");
    const productLink = card.querySelector(".product-link");
    const productAlertButton = card.querySelector(".product-alert-button");

    image.src = product.image || placeholderImage(product.source);
    image.alt = product.title;
    imageLink.href = product.url || "#";
    sourceBadge.textContent = compactSourceName(product.source);
    sourceBadge.title = product.source;
    changeBadge.textContent = formatChange(product);
    changeBadge.title = changeBadge.textContent;
    changeBadge.classList.add(product.changeType);
    changeBadge.classList.toggle("promotion", isPromotion(product));
    const sellerText = product.seller || product.availability || product.query || "Fonte sem vendedor informado";
    title.textContent = product.title;
    title.title = product.title;
    seller.textContent = sellerText;
    seller.title = sellerText;
    note.textContent = curationNote(product);
    price.textContent = formatMoney(product.price, product.currency);
    priceChange.textContent = changeText(product);
    priceChange.title = priceChange.textContent;
    priceChange.classList.add(product.changeType);
    rating.textContent = ratingText(product);
    productLink.href = product.url || "#";
    productLink.textContent = product.url ? "Ver oferta" : "Link indisponivel";
    productAlertButton.textContent = "Alerta";
    productAlertButton.addEventListener("click", () => prefillAlertFromProduct(product));

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
  if (!elements.timeline || !elements.timelineTemplate) return;
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
  if (message.toLowerCase().startsWith("n8n:")) {
    return message;
  }
  if (IS_LOCALHOST && message.includes("MERCADO_LIVRE_ACCESS_TOKEN")) {
    return "Mercado Livre: este servidor local esta sem token. Use https://monitorhub-radar.vercel.app ou autorize o Mercado Livre localmente.";
  }
  if (message.includes("sem itens publicados")) {
    return "Mercado Livre conectado. A conta autorizada nao retornou anuncios pela API. Autorize uma conta vendedora com anuncios publicados ou publique um item para o painel listar automaticamente.";
  }
  return message;
}

function isOperationalSourceMessage(message) {
  return message.includes("sem itens publicados") || message.includes("MERCADO_LIVRE_ACCESS_TOKEN");
}

function resetProductPageAndRender() {
  state.currentPage = 1;
  render();
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function normalizedPriceValues() {
  const maxLimit = Number(elements.maxPriceRange?.max || PRICE_RANGE_DEFAULT_MAX);
  const hasMinValue = elements.minPriceFilter && elements.minPriceFilter.value !== "";
  const hasMaxValue = elements.maxPriceFilter && elements.maxPriceFilter.value !== "";
  const minValue = hasMinValue ? clampNumber(elements.minPriceFilter.value, 0, maxLimit) : 0;
  const maxValue = hasMaxValue ? clampNumber(elements.maxPriceFilter.value, 0, maxLimit) : maxLimit;
  return {
    min: Math.min(minValue, maxValue),
    max: Math.max(minValue, maxValue),
    maxLimit,
    hasMinValue,
    hasMaxValue,
  };
}

function syncPriceRangesFromFields() {
  if (!elements.minPriceRange || !elements.maxPriceRange) return;
  const { min, max, maxLimit, hasMinValue, hasMaxValue } = normalizedPriceValues();
  elements.minPriceRange.value = String(min);
  elements.maxPriceRange.value = String(max);
  if (elements.minPriceFilter) elements.minPriceFilter.value = hasMinValue && min > 0 ? String(min) : "";
  if (elements.maxPriceFilter) elements.maxPriceFilter.value = hasMaxValue ? String(max) : "";
  updatePriceRangeVisual(min, max, maxLimit);
}

function syncPriceFieldsFromRanges(changedRange) {
  if (!elements.minPriceRange || !elements.maxPriceRange) return;
  const maxLimit = Number(elements.maxPriceRange.max || PRICE_RANGE_DEFAULT_MAX);
  let min = clampNumber(elements.minPriceRange.value, 0, maxLimit);
  let max = clampNumber(elements.maxPriceRange.value, 0, maxLimit);

  if (min > max) {
    if (changedRange === elements.minPriceRange) max = min;
    else min = max;
  }

  elements.minPriceRange.value = String(min);
  elements.maxPriceRange.value = String(max);
  if (elements.minPriceFilter) elements.minPriceFilter.value = min > 0 ? String(min) : "";
  if (elements.maxPriceFilter) elements.maxPriceFilter.value = max < maxLimit ? String(max) : "";
  updatePriceRangeVisual(min, max, maxLimit);
}

function updatePriceRangeVisual(min, max, maxLimit) {
  if (!elements.priceRangeControl) return;
  const minPercent = maxLimit ? (min / maxLimit) * 100 : 0;
  const maxPercent = maxLimit ? (max / maxLimit) * 100 : 100;
  elements.priceRangeControl.style.setProperty("--range-min", `${minPercent}%`);
  elements.priceRangeControl.style.setProperty("--range-max", `${maxPercent}%`);
}

function setMinimumDiscount(value) {
  state.minDiscount = Number(value || 0);
  elements.discountButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.discount || 0) === state.minDiscount);
    button.setAttribute("aria-pressed", String(Number(button.dataset.discount || 0) === state.minDiscount));
  });
  resetProductPageAndRender();
}

function setMinimumRating(value) {
  state.minRating = Number(value || 0);
  elements.ratingButtons.forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.rating || 0) === state.minRating);
    button.setAttribute("aria-pressed", String(Number(button.dataset.rating || 0) === state.minRating));
  });
  resetProductPageAndRender();
}

function clearProductFilters() {
  if (elements.globalSearch) elements.globalSearch.value = "";
  if (elements.sortMode) elements.sortMode.value = "change";
  if (elements.onlyChanges) elements.onlyChanges.checked = false;
  if (elements.sourceFilter) elements.sourceFilter.value = "all";
  if (elements.mercadoLivreEnabled) elements.mercadoLivreEnabled.checked = true;
  if (elements.amazonEnabled) elements.amazonEnabled.checked = true;
  if (elements.minPriceFilter) elements.minPriceFilter.value = "";
  if (elements.maxPriceFilter) elements.maxPriceFilter.value = "";
  syncPriceRangesFromFields();
  state.selectedCategory = "all";
  state.currentPage = 1;
  state.minDiscount = 0;
  state.minRating = 0;
  elements.categoryButtons.forEach((button) => button.classList.toggle("active", button.dataset.category === "all"));
  elements.discountButtons.forEach((button) => button.classList.remove("active"));
  elements.ratingButtons.forEach((button) => button.classList.remove("active"));
  elements.discountButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
  elements.ratingButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
  writeStorage(CONFIG_KEY, getConfig());
  render();
}

function formatMoney(value, currency = "BRL") {
  if (value === null || value === undefined) return "Sem preco";
  if (currency !== "BRL") return `${currency} ${Number(value).toFixed(2)}`;
  return moneyFormatter.format(value);
}

function formatChange(product) {
  if (isPromotion(product)) return promotionDiscountText(product) || "Promocao";
  if (product.changeType === "new") return "Novo";
  if (product.changeType === "drop") return "Queda";
  if (product.changeType === "up") return "Aumento";
  return "Estavel";
}

function changeText(product) {
  if (isPromotion(product) && product.originalPrice) {
    return `de ${formatMoney(product.originalPrice, product.currency)}`;
  }
  if (product.changeType === "new") return "primeira leitura";
  if (product.priceDiff === null || product.priceDiff === undefined) return "";
  const sign = product.priceDiff > 0 ? "+" : "";
  const percent = product.percentDiff === null ? "" : ` (${sign}${product.percentDiff}%)`;
  return `${sign}${formatMoney(product.priceDiff, product.currency)}${percent}`;
}

function isPromotion(product) {
  return Boolean(product.promotionId || product.promotionType || product.originalPrice || Number(product.discountPercent) > 0);
}

function promotionDiscountText(product) {
  const discount = Number(product.discountPercent);
  if (Number.isFinite(discount) && discount > 0) return `${Math.round(discount)}% OFF`;
  if (product.originalPrice && product.price && product.originalPrice > product.price) {
    return `${Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF`;
  }
  return "";
}

function ratingText(product) {
  const seed = productSeed(product);
  const rating = productRatingValue(product).toFixed(1).replace(".", ",");
  const reviews = dashboardFormatter.format(900 + (seed % 7800));
  return `★ ${rating} (${reviews})`;
}

function productRatingValue(product) {
  return 4.5 + (productSeed(product) % 5) / 10;
}

function productSeed(product) {
  return String(product.id || product.title || "").split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

function placeholderImage(label) {
  const text = encodeURIComponent(label || "Produto");
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420' viewBox='0 0 640 420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop stop-color='%23121816'/%3E%3Cstop offset='1' stop-color='%23293631'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='640' height='420' fill='url(%23g)'/%3E%3Ccircle cx='320' cy='175' r='72' fill='%233dd6b7' opacity='.16'/%3E%3Cpath d='M248 254h144l-26 54h-92z' fill='%23f3bd55' opacity='.16'/%3E%3Ctext x='320' y='354' text-anchor='middle' font-family='Arial' font-size='28' font-weight='700' fill='%23a8b8b1'%3E${text}%3C/text%3E%3C/svg%3E`;
}

function bindEvents() {
  elements.refreshNowButton?.addEventListener("click", () => {
    clearTimeout(state.timer);
    refreshProducts();
  });

  elements.toggleLiveButton?.addEventListener("click", () => {
    state.live = !state.live;
    if (state.live) refreshProducts();
    else {
      clearTimeout(state.timer);
      setConnectionText("Atualizacao pausada");
      updateRunningState();
    }
  });

  elements.saveConfigButton?.addEventListener("click", () => {
    saveConfig();
    clearTimeout(state.timer);
    refreshProducts();
  });

  elements.clearHistoryButton?.addEventListener("click", () => {
    state.events = [];
    writeStorage(EVENTS_KEY, []);
    writeStorage(SNAPSHOT_KEY, {});
    writeStorage(HISTORY_KEY, {});
    setConnectionText("Historico limpo");
    renderTimeline();
    renderMetrics(state.products);
  });

  [
    elements.globalSearch,
    elements.sortMode,
    elements.onlyChanges,
    elements.sourceFilter,
  ].filter(Boolean).forEach((element) => {
    element.addEventListener("input", resetProductPageAndRender);
    element.addEventListener("change", resetProductPageAndRender);
  });

  [elements.minPriceFilter, elements.maxPriceFilter].filter(Boolean).forEach((element) => {
    element.addEventListener("input", () => {
      syncPriceRangesFromFields();
      resetProductPageAndRender();
    });
    element.addEventListener("change", () => {
      syncPriceRangesFromFields();
      resetProductPageAndRender();
    });
  });

  [elements.minPriceRange, elements.maxPriceRange].filter(Boolean).forEach((element) => {
    element.addEventListener("input", () => {
      syncPriceFieldsFromRanges(element);
      resetProductPageAndRender();
    });
    element.addEventListener("change", () => {
      syncPriceFieldsFromRanges(element);
      resetProductPageAndRender();
    });
  });

  elements.pageSizeSelect?.addEventListener("change", () => {
    state.pageSize = Number(elements.pageSizeSelect.value || 20);
    resetProductPageAndRender();
  });

  elements.viewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setProductViewMode(button.dataset.viewMode);
    });
  });

  elements.discountButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const discount = Number(button.dataset.discount || 0);
      setMinimumDiscount(state.minDiscount === discount ? 0 : discount);
    });
  });

  elements.ratingButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const rating = Number(button.dataset.rating || 0);
      setMinimumRating(state.minRating === rating ? 0 : rating);
    });
  });

  elements.clearProductFiltersButton?.addEventListener("click", clearProductFilters);

  [
    elements.demoEnabled,
    elements.mercadoLivreEnabled,
    elements.mercadoLivreQuery,
    elements.amazonEnabled,
    elements.amazonQuery,
    elements.refreshInterval,
    elements.itemLimit,
  ].filter(Boolean).forEach((element) => {
    element.addEventListener("change", () => {
      normalizeRadarSourceSelection(element);
      saveConfig();
      resetProductPageAndRender();
      clearTimeout(state.timer);
      refreshProducts();
    });
  });

  elements.categoryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCategory = button.dataset.category || "all";
      elements.categoryButtons.forEach((item) => item.classList.toggle("active", item === button));
      resetProductPageAndRender();
    });
  });

  elements.signupForm?.addEventListener("submit", submitSignup);
  elements.loginForm?.addEventListener("submit", submitLogin);
  elements.googleLoginButtons.forEach((button) => {
    button.addEventListener("click", () => startGoogleLogin(`${window.location.pathname}${window.location.search}${window.location.hash}`));
  });
  elements.logoutButton?.addEventListener("click", clearAuthSession);
  elements.alertProductQuery?.addEventListener("input", () => {
    if (state.selectedAlertProduct && elements.alertProductQuery.value.trim() !== state.selectedAlertProduct.title) {
      state.selectedAlertProduct = null;
      renderSelectedProductPreview();
    }
  });
  elements.priceAlertForm?.addEventListener("submit", submitPriceAlert);
  elements.reloadAlertsButton?.addEventListener("click", loadPriceAlerts);
}

async function init() {
  state.events = readStorage(EVENTS_KEY, []);
  const hasSavedConfig = localStorage.getItem(CONFIG_KEY) !== null;
  const shouldLoadProducts = Boolean(elements.productGrid || elements.totalProducts || elements.recentAlertsBody || elements.activityChart);
  prepareDemoMode();
  applyConfig(readStorage(CONFIG_KEY, null));
  normalizeRadarSourceSelection();
  state.pageSize = Number(elements.pageSizeSelect?.value || (IS_HOME_PAGE ? 6 : 20));
  bindEvents();
  render();
  await loadServerConfig();
  await consumeOAuthRedirect();
  await verifyStoredSession();
  applyStoredAlertDraft();
  applyAutomaticDemoFallback(hasSavedConfig);
  if (shouldLoadProducts) refreshProducts();
}

init();
