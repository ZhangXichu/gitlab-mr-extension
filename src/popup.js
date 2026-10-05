import { relativeTime, isSafeLink } from "./lib.js";
import { markTodoDone } from "./api.js";
import { loadConfig, loadDashboard } from "./storage.js";

const list = document.getElementById("list");
const message = document.getElementById("message");
const footer = document.getElementById("footer");
const refreshButton = document.getElementById("refresh");
const tabs = [...document.querySelectorAll("[role=tab]")];

// Each tab reads one source from the dashboard state.
const TABS = {
  mine: { source: "gitlab", items: (data) => data.mine, empty: "You have no open merge requests." },
  reviewing: { source: "gitlab", items: (data) => data.reviewing, empty: "Nobody is waiting for your review." },
  mentions: { source: "gitlab", items: (data) => data.mentions, empty: "No pending GitLab mentions." },
  // `?? []`: data saved by version 1.1.0 has no `items` until the first refresh.
  jira: { source: "jira", items: (data) => data.items ?? [], empty: "No Jira mentions or replies in the last 14 days." },
  mail: { source: "gmail", items: (data) => data.items, empty: "No unread mail." },
};

const SOURCE_LABELS = [["gitlab", "GitLab"], ["jira", "Jira"], ["gmail", "Gmail"]];

let currentTab = "mine";
let currentState = null;
let anthropicKey = "";
// Summaries made while the popup is open, by item key, so a refresh does not drop them.
const summaries = new Map();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function link(url, text) {
  const anchor = element("a", "title", text);
  if (isSafeLink(url)) {
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
  }
  return anchor;
}

function summaryArea(row, meta, input) {
  if (!anthropicKey) return;
  const key = `${input.kind}:${input.id}`;
  const output = element("p", "summary");
  output.hidden = !summaries.has(key);
  output.textContent = summaries.get(key) ?? "";

  const button = element("button", "small push", "Summarize");
  button.title = "Ask Claude for a short summary";
  button.addEventListener("click", () => onSummarize(key, input, button, output));
  meta.append(button);
  row.append(output);
}

async function onSummarize(key, input, button, output) {
  button.disabled = true;
  button.textContent = "…";
  try {
    // Loaded only on click, so opening the popup stays fast.
    const { summarize } = await import("./claude.js");
    const text = await summarize(anthropicKey, input);
    summaries.set(key, text);
    output.textContent = text;
    output.classList.remove("error");
  } catch (error) {
    output.textContent = error.message;
    output.classList.add("error");
  } finally {
    output.hidden = false;
    button.disabled = false;
    button.textContent = "Summarize";
  }
}

function mrRow(mr) {
  const row = element("li", "item");
  row.append(link(mr.url, mr.title));

  const meta = element("div", "meta");
  meta.append(element("span", "ref", mr.reference));
  if (mr.draft) meta.append(element("span", "tag draft", "Draft"));
  if (mr.hasConflicts) meta.append(element("span", "tag conflict", "Conflicts"));
  if (mr.comments > 0) meta.append(element("span", "", `💬 ${mr.comments}`));
  meta.append(element("span", "", `${mr.author} · ${relativeTime(mr.updatedAt)}`));
  row.append(meta);
  summaryArea(row, meta, { kind: "mr", ...mr });
  return row;
}

function mentionRow(mention) {
  const row = element("li", "item");
  row.append(link(mention.url, mention.title || mention.targetType));
  if (mention.body) row.append(element("p", "body", mention.body));

  const meta = element("div", "meta");
  meta.append(element("span", "ref", mention.project));
  meta.append(element("span", "", `${mention.author} · ${relativeTime(mention.createdAt)}`));
  const doneButton = element("button", "small push", "Done");
  doneButton.title = "Mark this to-do as done in GitLab";
  doneButton.addEventListener("click", () => onDone(mention.id, doneButton));
  meta.append(doneButton);
  row.append(meta);
  summaryArea(row, meta, { kind: "gitlab-mention", ...mention });
  return row;
}

function jiraRow(mention) {
  const row = element("li", "item");
  row.append(link(mention.url, mention.title));
  if (mention.body) row.append(element("p", "body", mention.body));

  const meta = element("div", "meta");
  meta.append(element("span", "ref", mention.issueKey));
  meta.append(element("span", "tag", mention.reason === "reply" ? "Reply" : "Mention"));
  meta.append(element("span", "", `${mention.author} · ${relativeTime(mention.createdAt)}`));
  row.append(meta);
  summaryArea(row, meta, { kind: "jira", ...mention });
  return row;
}

function mailRow(mail) {
  const row = element("li", "item");
  row.append(link(mail.url, mail.title));
  if (mail.summary) row.append(element("p", "body", mail.summary));

  const meta = element("div", "meta");
  meta.append(element("span", "", `${mail.author} · ${relativeTime(mail.receivedAt)}`));
  row.append(meta);
  return row;
}

const ROW_MAKERS = { mine: mrRow, reviewing: mrRow, mentions: mentionRow, jira: jiraRow, mail: mailRow };

async function onDone(todoId, button) {
  button.disabled = true;
  try {
    const config = await loadConfig();
    await markTodoDone(config, todoId);
    await refresh();
  } catch (error) {
    button.disabled = false;
    showMessages([{ text: `Could not mark as done: ${error.message}`, loginUrl: null }]);
  }
}

// problems is a list of { text, loginUrl }. A loginUrl adds a "Log in" button to that line.
function showMessages(problems) {
  message.hidden = problems.length === 0;
  message.replaceChildren(...problems.map(({ text, loginUrl }) => {
    const line = element("div", "message-line");
    line.append(element("span", "", text));
    if (loginUrl && isSafeLink(loginUrl)) {
      const loginButton = element("button", "small push", "Log in");
      loginButton.addEventListener("click", () => void chrome.tabs.create({ url: loginUrl }));
      line.append(loginButton);
    }
    return line;
  }));
}

// Errors from every source, not only the open tab, so a failing source is never hidden.
function currentProblems(state) {
  const problems = state.error ? [{ text: state.error, loginUrl: null }] : [];
  for (const [name, label] of SOURCE_LABELS) {
    const source = state[name];
    if (source?.error) problems.push({ text: `${label}: ${source.error}`, loginUrl: source.loginUrl });
  }
  return problems;
}

function tabCount(tab, data) {
  if (!data) return "";
  if (tab === "mail") return String(data.unreadCount);
  return String(TABS[tab].items(data).length);
}

function footerText(sourceName, data) {
  if (!data) return "";
  const updated = `updated ${relativeTime(data.fetchedAt)}`;
  if (sourceName === "gitlab") return `@${data.username} · ${updated}`;
  if (sourceName === "jira") return `${data.displayName} · ${updated}`;
  return `${data.unreadCount} unread · ${updated}`;
}

function render() {
  const state = currentState ?? {};
  for (const tab of tabs) tab.hidden = !state[TABS[tab.dataset.tab].source];
  if (tabs.find((tab) => tab.dataset.tab === currentTab)?.hidden) {
    currentTab = tabs.find((tab) => !tab.hidden)?.dataset.tab ?? currentTab;
  }

  for (const tab of tabs) {
    tab.setAttribute("aria-selected", String(tab.dataset.tab === currentTab));
    const source = state[TABS[tab.dataset.tab].source];
    const count = tab.querySelector(".count");
    // "!" instead of a number when the last refresh failed: the number would be old.
    count.textContent = source?.error ? "!" : tabCount(tab.dataset.tab, source?.data);
    count.classList.toggle("error", Boolean(source?.error));
  }

  const { source: sourceName, items, empty } = TABS[currentTab];
  const source = state[sourceName];
  showMessages(currentProblems(state));
  footer.textContent = footerText(sourceName, source?.data);
  list.replaceChildren();
  if (!source?.data) return;

  const rows = items(source.data);
  if (rows.length === 0) {
    list.append(element("li", "empty", empty));
    return;
  }
  list.append(...rows.map(ROW_MAKERS[currentTab]));
}

async function refresh() {
  refreshButton.disabled = true;
  try {
    currentState = await chrome.runtime.sendMessage({ type: "refresh" });
  } catch (error) {
    currentState = { ...currentState, error: error.message };
  } finally {
    refreshButton.disabled = false;
  }
  render();
}

async function init() {
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      currentTab = tab.dataset.tab;
      render();
    });
  }
  refreshButton.addEventListener("click", () => void refresh());
  document.getElementById("options").addEventListener("click", () => chrome.runtime.openOptionsPage());

  anthropicKey = (await loadConfig())?.anthropicKey ?? "";
  // Show the saved result at once, then fetch fresh data.
  currentState = await loadDashboard();
  render();
  await refresh();
}

init().catch((error) => showMessages([{ text: error.message, loginUrl: null }]));
