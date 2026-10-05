import { fetchDashboard } from "./api.js";
import { fetchJiraMentions } from "./jira.js";
import { fetchGmail } from "./gmail.js";
import { loadConfig, loadDashboard, saveDashboard } from "./storage.js";

const ALARM_NAME = "refresh";
const REFRESH_MINUTES = 5;
const BADGE_ERROR_COLOR = "#d93025";
const BADGE_COUNT_COLOR = "#fc6d26";
const NOT_SET_UP = "Not set up yet. Open Options and turn on at least one source.";

// One refresh at a time. A second request while one runs gets the same promise.
let running = null;

function refresh() {
  running ??= runRefresh().finally(() => {
    running = null;
  });
  return running;
}

// `load` is null when the source is off. On failure, keep the last good data so the popup still shows something.
async function refreshSource(previous, load) {
  if (!load) return null;
  try {
    return { data: await load(), error: null, loginUrl: null };
  } catch (error) {
    return { data: previous?.data ?? null, error: error.message, loginUrl: error.loginUrl ?? null };
  }
}

async function runRefresh() {
  const config = await loadConfig();
  const previous = (await loadDashboard()) ?? {};
  const [gitlab, jira, gmail] = await Promise.all([
    refreshSource(previous.gitlab, config?.token ? () => fetchDashboard(config) : null),
    refreshSource(previous.jira, config?.jira ? () => fetchJiraMentions(config.jira) : null),
    refreshSource(previous.gmail, config?.gmail ? () => fetchGmail(config.gmail) : null),
  ]);
  const state = { gitlab, jira, gmail, error: gitlab || jira || gmail ? null : NOT_SET_UP };
  await saveDashboard(state);
  await updateBadge(state);
  return state;
}

// Red "!" when anything failed, so an expired login is noticed. Otherwise the number of GitLab mentions.
async function updateBadge(state) {
  const sources = [state.gitlab, state.jira, state.gmail];
  if (state.error || sources.some((source) => source?.error)) {
    await setBadge("!", BADGE_ERROR_COLOR);
    return;
  }
  const count = state.gitlab?.data?.mentions.length ?? 0;
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
  refresh().then(sendResponse, (error) => sendResponse({ gitlab: null, jira: null, gmail: null, error: error.message }));
  return true; // Tells Chrome the answer comes later.
});
