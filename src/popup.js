import { relativeTime, isSafeLink } from "./lib.js";
import { markTodoDone } from "./api.js";
import { loadConfig, loadDashboard } from "./storage.js";

const list = document.getElementById("list");
const message = document.getElementById("message");
const footer = document.getElementById("footer");
const refreshButton = document.getElementById("refresh");
const tabs = [...document.querySelectorAll("[role=tab]")];

const EMPTY_TEXT = {
  mine: "You have no open merge requests.",
  reviewing: "Nobody is waiting for your review.",
  mentions: "No pending mentions.",
};

let currentTab = "mine";
let currentState = null;

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
  return row;
}

function mentionRow(mention) {
  const row = element("li", "item");
  row.append(link(mention.url, mention.title || mention.targetType));
  if (mention.body) row.append(element("p", "body", mention.body));

  const meta = element("div", "meta");
  meta.append(element("span", "ref", mention.project));
  meta.append(element("span", "", `${mention.author} · ${relativeTime(mention.createdAt)}`));
  const doneButton = element("button", "done", "Done");
  doneButton.title = "Mark this to-do as done in GitLab";
  doneButton.addEventListener("click", () => onDone(mention.id, doneButton));
  meta.append(doneButton);
  row.append(meta);
  return row;
}

async function onDone(todoId, button) {
  button.disabled = true;
  try {
    const config = await loadConfig();
    await markTodoDone(config, todoId);
    await refresh();
  } catch (error) {
    button.disabled = false;
    showMessage(`Could not mark as done: ${error.message}`, true);
  }
}

function showMessage(text, isError) {
  message.hidden = !text;
  message.textContent = text ?? "";
  message.classList.toggle("error", Boolean(isError));
}

function render() {
  const data = currentState?.data;
  showMessage(currentState?.error, true);

  for (const tab of tabs) {
    tab.setAttribute("aria-selected", String(tab.dataset.tab === currentTab));
  }
  for (const badge of document.querySelectorAll("[data-count]")) {
    badge.textContent = data ? String(data[badge.dataset.count].length) : "";
  }

  list.replaceChildren();
  footer.textContent = data ? `@${data.username} · updated ${relativeTime(data.fetchedAt)}` : "";
  if (!data) return;

  const items = data[currentTab];
  if (items.length === 0) {
    list.append(element("li", "empty", EMPTY_TEXT[currentTab]));
    return;
  }
  const makeRow = currentTab === "mentions" ? mentionRow : mrRow;
  list.append(...items.map(makeRow));
}

async function refresh() {
  refreshButton.disabled = true;
  try {
    currentState = await chrome.runtime.sendMessage({ type: "refresh" });
  } catch (error) {
    currentState = { data: currentState?.data ?? null, error: error.message };
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

  // Show the saved result at once, then fetch fresh data.
  currentState = await loadDashboard();
  render();
  await refresh();
}

init().catch((error) => showMessage(error.message, true));
