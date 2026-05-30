const form = document.querySelector("#mercadoLivreSetupForm");
const redirectUriInput = document.querySelector("#redirectUri");
const statusBox = document.querySelector("#setupStatus");

redirectUriInput.value = `${window.location.origin}/api/mercadolivre/oauth/callback`;
let serverConfig = null;

const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

loadConfig();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusBox.textContent = "Preparando autorizacao...";
  statusBox.classList.remove("ready", "missing");

  if (isLocalhost && (!form.clientId.value.trim() || !form.clientSecret.value.trim())) {
    statusBox.textContent = "No modo local, informe APP ID e Secret Key.";
    statusBox.classList.add("missing");
    return;
  }

  if (!isLocalhost && !serverConfig?.mercadoLivreOAuthReady && (!form.clientId.value.trim() || !form.clientSecret.value.trim())) {
    statusBox.textContent = "Na Vercel, cadastre MERCADO_LIVRE_CLIENT_ID e MERCADO_LIVRE_CLIENT_SECRET ou preencha os campos manualmente.";
    statusBox.classList.add("missing");
    return;
  }

  const payload = {
    clientId: form.clientId.value.trim(),
    clientSecret: form.clientSecret.value.trim(),
    redirectUri: redirectUriInput.value.trim(),
  };

  try {
    const response = await fetch("/api/mercadolivre/oauth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.authUrl) {
      throw new Error(data.error || "Nao foi possivel iniciar a autorizacao.");
    }

    statusBox.textContent = "Redirecionando para o Mercado Livre...";
    statusBox.classList.add("ready");
    window.location.href = data.authUrl;
  } catch (error) {
    statusBox.textContent = error.message || "Falha ao conectar Mercado Livre.";
    statusBox.classList.add("missing");
  }
});

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    serverConfig = await response.json();
    if (!isLocalhost && serverConfig.mercadoLivreOAuthReady) {
      statusBox.textContent = "Credenciais OAuth encontradas na Vercel. Clique em Autorizar Mercado Livre.";
      statusBox.classList.add("ready");
    }
  } catch {
    serverConfig = null;
  }
}
