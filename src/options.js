import { normalizeBaseUrl, buildApiUrl } from "./lib.js";
import { DEFAULT_BASE_URL, loadConfig, saveConfig } from "./storage.js";

const form = document.getElementById("form");
const baseUrlInput = document.getElementById("baseUrl");
const tokenInput = document.getElementById("token");
const statusText = document.getElementById("status");

function showStatus(text, isError) {
  statusText.textContent = text;
  statusText.className = isError ? "error" : "ok";
}

async function checkToken(config) {
  const response = await fetch(buildApiUrl(config.baseUrl, "/user"), {
    headers: { "PRIVATE-TOKEN": config.token },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitLab returned ${response.status}. Check the URL and token.`);
  const user = await response.json();
  return user.username;
}

async function onSubmit(event) {
  event.preventDefault();
  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(baseUrlInput.value);
  } catch (error) {
    showStatus(error.message, true);
    return;
  }

  // Must be the first await: Chrome only allows this right after a click.
  const origin = `${new URL(baseUrl).origin}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    showStatus(`The extension needs access to ${origin} to talk to GitLab.`, true);
    return;
  }

  const config = { baseUrl, token: tokenInput.value.trim() };
  showStatus("Checking…", false);
  try {
    const username = await checkToken(config);
    await saveConfig(config);
    await chrome.runtime.sendMessage({ type: "refresh" });
    showStatus(`Saved. Signed in as @${username}.`, false);
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function init() {
  const config = await loadConfig();
  baseUrlInput.value = config?.baseUrl ?? DEFAULT_BASE_URL;
  tokenInput.value = config?.token ?? "";
  form.addEventListener("submit", onSubmit);
}

init().catch((error) => showStatus(error.message, true));
