import { normalizeBaseUrl, buildApiUrl, isSafeLink } from "./lib.js";
import { DEFAULT_BASE_URL, DEFAULT_JIRA_URL, loadConfig, saveConfig } from "./storage.js";

const GMAIL_ORIGIN = "https://mail.google.com/*";
const ANTHROPIC_ORIGIN = "https://api.anthropic.com/*";
const MAX_GMAIL_ACCOUNT = 9;

const form = document.getElementById("form");
const inputs = {
  baseUrl: document.getElementById("baseUrl"),
  token: document.getElementById("token"),
  jiraEnabled: document.getElementById("jiraEnabled"),
  jiraUrl: document.getElementById("jiraUrl"),
  gmailEnabled: document.getElementById("gmailEnabled"),
  gmailAccount: document.getElementById("gmailAccount"),
  anthropicKey: document.getElementById("anthropicKey"),
};
const statusList = document.getElementById("status");

function statusLine(text, isError, loginUrl) {
  const line = document.createElement("li");
  line.className = isError ? "error" : "ok";
  line.textContent = text;
  if (loginUrl && isSafeLink(loginUrl)) {
    const anchor = document.createElement("a");
    anchor.href = loginUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.textContent = "Log in";
    line.append(" ", anchor);
  }
  return line;
}

function showStatus(lines) {
  statusList.replaceChildren(...lines);
}

function parseGmailAccount(text) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > MAX_GMAIL_ACCOUNT) {
    throw new Error(`Google account number must be a whole number from 0 to ${MAX_GMAIL_ACCOUNT}.`);
  }
  return value;
}

// Reads the form into a config. Throws with a readable message on bad input.
function readForm() {
  const token = inputs.token.value.trim();
  return {
    baseUrl: token ? normalizeBaseUrl(inputs.baseUrl.value) : inputs.baseUrl.value.trim(),
    token,
    jira: inputs.jiraEnabled.checked ? { siteUrl: normalizeBaseUrl(inputs.jiraUrl.value, "Jira URL") } : null,
    gmail: inputs.gmailEnabled.checked ? { accountIndex: parseGmailAccount(inputs.gmailAccount.value) } : null,
    anthropicKey: inputs.anthropicKey.value.trim(),
  };
}

function neededOrigins(config) {
  const origins = [];
  if (config.token) origins.push(`${new URL(config.baseUrl).origin}/*`);
  if (config.jira) origins.push(`${new URL(config.jira.siteUrl).origin}/*`);
  if (config.gmail) origins.push(GMAIL_ORIGIN);
  if (config.anthropicKey) origins.push(ANTHROPIC_ORIGIN);
  return origins;
}

async function checkGitLabToken(config) {
  const response = await fetch(buildApiUrl(config.baseUrl, "/user"), {
    headers: { "PRIVATE-TOKEN": config.token },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GitLab returned ${response.status}. Check the URL and token.`);
  const user = await response.json();
  return user.username;
}

function sourceLine(name, source, describe) {
  if (!source) return null;
  if (source.error) return statusLine(`${name}: ${source.error}`, true, source.loginUrl);
  return statusLine(`${name}: ${describe(source.data)}`, false, null);
}

async function onSubmit(event) {
  event.preventDefault();
  let config;
  try {
    config = readForm();
  } catch (error) {
    showStatus([statusLine(error.message, true, null)]);
    return;
  }

  // Must be the first await: Chrome only allows this right after a click.
  const origins = neededOrigins(config);
  const granted = origins.length === 0 || (await chrome.permissions.request({ origins }));
  if (!granted) {
    showStatus([statusLine(`The extension needs access to ${origins.join(", ")}.`, true, null)]);
    return;
  }

  showStatus([statusLine("Checking…", false, null)]);
  try {
    if (config.token) await checkGitLabToken(config);
    if (config.anthropicKey) {
      const { checkApiKey } = await import("./claude.js");
      await checkApiKey(config.anthropicKey);
    }
  } catch (error) {
    showStatus([statusLine(error.message, true, null)]);
    return;
  }

  await saveConfig(config);
  const state = await chrome.runtime.sendMessage({ type: "refresh" });
  const lines = [
    sourceLine("GitLab", state.gitlab, (data) => `signed in as @${data.username}`),
    sourceLine("Jira", state.jira, (data) => `logged in as ${data.displayName}, ${data.items.length} items (Jira and Confluence)`),
    sourceLine("Gmail", state.gmail, (data) => `${data.unreadCount} unread`),
    config.anthropicKey ? statusLine("Claude: API key works", false, null) : null,
  ].filter(Boolean);
  showStatus(lines.length > 0 ? [statusLine("Saved.", false, null), ...lines] : [statusLine("Saved. Everything is off.", false, null)]);
}

async function init() {
  const config = await loadConfig();
  inputs.baseUrl.value = config?.baseUrl || DEFAULT_BASE_URL;
  inputs.token.value = config?.token ?? "";
  inputs.jiraEnabled.checked = Boolean(config?.jira);
  inputs.jiraUrl.value = config?.jira?.siteUrl ?? DEFAULT_JIRA_URL;
  inputs.gmailEnabled.checked = Boolean(config?.gmail);
  inputs.gmailAccount.value = String(config?.gmail?.accountIndex ?? 0);
  inputs.anthropicKey.value = config?.anthropicKey ?? "";
  form.addEventListener("submit", onSubmit);
}

init().catch((error) => showStatus([statusLine(error.message, true, null)]));
