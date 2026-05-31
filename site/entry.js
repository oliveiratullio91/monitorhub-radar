const ALERT_AUTH_KEY = "monitorhub-alert-auth-v1";

const form = document.querySelector("#entryLoginForm");
const emailInput = document.querySelector("#entryLoginEmail");
const passwordInput = document.querySelector("#entryLoginPassword");
const passwordToggle = document.querySelector("#passwordToggle");
const statusText = document.querySelector("#entryLoginStatus");

function setStatus(message, ready = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle("ready", ready);
}

function setLoading(loading) {
  form?.querySelectorAll("button, input").forEach((element) => {
    element.disabled = loading;
  });
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
