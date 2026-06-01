const ALERT_AUTH_KEY = "monitorhub-alert-auth-v1";

const form = document.querySelector("#entryLoginForm");
const emailInput = document.querySelector("#entryLoginEmail");
const passwordInput = document.querySelector("#entryLoginPassword");
const passwordToggle = document.querySelector("#passwordToggle");
const statusText = document.querySelector("#entryLoginStatus");
const googleLoginButton = document.querySelector("#entryGoogleLogin");

const AUTH_ERROR_MESSAGES = {
  "google-provider-disabled": "Login com Google ainda nao esta ativo no Supabase. Configure o provider Google ou entre com e-mail e senha por enquanto.",
  "google-provider-error": "Nao foi possivel iniciar o login com Google agora. Tente novamente ou use e-mail e senha.",
};

function setStatus(message, ready = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle("ready", ready);
}

function setLoading(loading) {
  form?.querySelectorAll("button, input").forEach((element) => {
    element.disabled = loading;
  });
  if (googleLoginButton) googleLoginButton.disabled = loading;
}

function consumeAuthQueryMessage() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("authError");
  if (!code) return;

  params.delete("authError");
  const query = params.toString();
  history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  setStatus(AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES["google-provider-error"]);
}

async function consumeOAuthRedirect() {
  const params = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "");
  const accessToken = params.get("access_token");
  const error = params.get("error_description") || params.get("error");

  if (error) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setStatus(`Login com Google interrompido: ${error}`);
    return;
  }

  if (!accessToken) return;

  setLoading(true);
  setStatus("Confirmando login com Google...");
  const refreshToken = params.get("refresh_token") || "";
  const expiresIn = Number(params.get("expires_in") || 0);
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : "";
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

  try {
    const response = await fetch("/api/auth/me", {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false || !payload.user) {
      throw new Error(payload.error || "Nao foi possivel validar sua conta Google.");
    }

    localStorage.setItem(ALERT_AUTH_KEY, JSON.stringify({
      user: payload.user,
      session: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    }));
    setStatus("Login com Google confirmado. Abrindo produtos...", true);
    window.location.href = "./produtos.html";
  } catch (error) {
    setStatus(error.message || "Falha ao concluir login com Google.");
    setLoading(false);
  }
}

function startGoogleLogin() {
  const redirectTo = new URL("/produtos.html", window.location.origin);
  const failureTo = new URL("/index.html", window.location.origin);
  window.location.href = `/api/auth/google?redirectTo=${encodeURIComponent(redirectTo.toString())}&failureTo=${encodeURIComponent(failureTo.toString())}`;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoading(true);
  setStatus("Validando acesso...");

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: emailInput.value,
        password: passwordInput.value,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false || !payload.session?.accessToken) {
      throw new Error(payload.error || "Nao foi possivel entrar.");
    }

    localStorage.setItem(ALERT_AUTH_KEY, JSON.stringify({
      user: payload.user,
      session: payload.session,
    }));
    setStatus("Login confirmado. Abrindo produtos...", true);
    window.location.href = "./produtos.html";
  } catch (error) {
    setStatus(error.message || "Falha ao entrar. Voce ainda pode acessar sem login.");
  } finally {
    setLoading(false);
    if (passwordInput) passwordInput.value = "";
  }
});

passwordToggle?.addEventListener("click", () => {
  if (!passwordInput) return;
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  passwordToggle.setAttribute("aria-label", shouldShow ? "Ocultar senha" : "Mostrar senha");
});

googleLoginButton?.addEventListener("click", startGoogleLogin);

consumeAuthQueryMessage();
consumeOAuthRedirect();
