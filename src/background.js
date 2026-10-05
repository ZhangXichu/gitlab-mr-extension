import { fetchDashboard } from "./api.js";
import { loadConfig, loadDashboard, saveDashboard } from "./storage.js";

const ALARM_NAME = "refresh";
const REFRESH_MINUTES = 5;
const BADGE_ERROR_COLOR = "#d93025";
const BADGE_COUNT_COLOR = "#fc6d26";

// One refresh at a time. A second request while one runs gets the same promise.
let running = null;

function refresh() {
  running ??= runRefresh().finally(() => {
    running = null;
  });
  return running;
}

async function runRefresh() {
  const config = await loadConfig();
  if (!config?.token) {
    await setBadge("!", BADGE_ERROR_COLOR);
    return { data: null, error: "Not set up yet. Open Options and add your GitLab token." };
  }

  const previous = await loadDashboard();
  let state;
  try {
    state = { data: await fetchDashboard(config), error: null };
  } catch (error) {
    // Keep the last good data so the popup still shows something.
    state = { data: previous?.data ?? null, error: error.message };
  }
  await saveDashboard(state);
  await updateBadge(state);
  return state;
}

async function updateBadge(state) {
  if (state.error) {
    await setBadge("!", BADGE_ERROR_COLOR);
    return;
  }
  const count = state.data.mentions.length;
  await setBadge(count > 0 ? String(count) : "", BADGE_COUNT_COLOR);
}

async function setBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
}

function ensureAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES, delayInMinutes: 0 });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void refresh();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "refresh") return false;
  refresh().then(sendResponse, (error) => sendResponse({ data: null, error: error.message }));
  return true; // Tells Chrome the answer comes later.
});
