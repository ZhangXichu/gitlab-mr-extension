// Saved in chrome.storage.local (this computer only), not sync, because it holds tokens.
const CONFIG_KEY = "config";
const DASHBOARD_KEY = "dashboard";

export const DEFAULT_BASE_URL = "https://gitlab.ba.innovatrics.net";
export const DEFAULT_JIRA_URL = "https://innovatrics.atlassian.net";

// config is { baseUrl, token, jira: { siteUrl } | null, gmail: { accountIndex } | null, anthropicKey }.
// An empty token, a null jira or gmail, or an empty anthropicKey means that part is off.
export async function loadConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  return stored[CONFIG_KEY] ?? null;
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function loadDashboard() {
  const stored = await chrome.storage.local.get(DASHBOARD_KEY);
  return stored[DASHBOARD_KEY] ?? null;
}

// state is { gitlab, jira, gmail }. Each is null when that source is off, or { data, error, loginUrl }:
// data is the last good result, error is the last failure message or null,
// loginUrl is set when the failure was "not logged in".
export async function saveDashboard(state) {
  await chrome.storage.local.set({ [DASHBOARD_KEY]: state });
}
