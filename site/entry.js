const ALERT_AUTH_KEY = "monitorhub-alert-auth-v1";

const form = document.querySelector("#entryLoginForm");
const emailInput = document.querySelector("#entryLoginEmail");
const passwordInput = document.querySelector("#entryLoginPassword");
const passwordToggle = document.querySelector("#passwordToggle");
const statusText = document.querySelector("#entryLoginStatus");
const googleLoginButton = document.querySelector("#entryGoogleLogin");

const AUTH_ERROR_MESSAGES = {
  "google-provider-disabled": "RAD-AUTH-003 - Login social temporariamente indisponivel. Use e-mail e senha por enquanto.",
  "google-provider-error": "RAD-AUTH-004 - Nao foi possivel iniciar o login social agora. Tente novamente ou use e-mail e senha.",
};

function setStatus(message, ready = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle("ready", ready);
}

function codeFromErrorMessage(message, fallbackCode = "RAD-GEN-001") {
  const value = String(message || "");
  const existingCode = value.match(/RAD-[A-Z]+-\d{3}/i)?.[0];
  if (existingCode) return existingCode.toUpperCase();
  if (/google-provider-disabled|unsupported provider|provider is not enabled/i.test(value)) return "RAD-AUTH-003";
  if (/sessao|session|jwt|bearer|token expirad|invalid token|refresh token/i.test(value)) return "RAD-AUTH-002";
  if (/schema cache|monitorhub_|Could not find the table|Could not find the column/i.test(value)) return "RAD-DATA-001";
  if (/google|oauth|provider|callback|autoriz/i.test(value)) return "RAD-AUTH-004";
  return fallbackCode;
}

function publicErrorMessage(message, fallbackText = "Falha operacional. Consulte o codigo informado.") {
  const code = codeFromErrorMessage(message);
  return `${code} - ${fallbackText}`;
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
    setStatus("RAD-AUTH-004 - Login social interrompido antes da conclusao.");
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
      throw new Error(payload.error || "RAD-AUTH-004 - Nao foi possivel validar sua conta.");
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
    setStatus(publicErrorMessage(error.message, "Falha ao concluir login social."));
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
      throw new Error(payload.error || "RAD-AUTH-002 - Nao foi possivel validar o acesso.");
    }

    localStorage.setItem(ALERT_AUTH_KEY, JSON.stringify({
      user: payload.user,
      session: payload.session,
    }));
    setStatus("Login confirmado. Abrindo produtos...", true);
    window.location.href = "./produtos.html";
  } catch (error) {
    setStatus(publicErrorMessage(error.message, "Falha ao entrar. Voce ainda pode acessar sem login."));
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
