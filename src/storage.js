// Saved in chrome.storage.local (this computer only), not sync, because it holds the token.
const CONFIG_KEY = "config";
const DASHBOARD_KEY = "dashboard";

export const DEFAULT_BASE_URL = "https://gitlab.ba.innovatrics.net";

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

// state is { data, error }: data is the last good result, error is the last failure message or null.
export async function saveDashboard(state) {
  await chrome.storage.local.set({ [DASHBOARD_KEY]: state });
}
