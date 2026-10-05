// Pure helpers with no Chrome or network calls, so they can be tested in Node.

const MENTION_ACTIONS = new Set(["mentioned", "directly_addressed"]);

export function normalizeBaseUrl(input, label = "GitLab URL") {
  const text = (input ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must start with http:// or https://`);
  }
  const path = url.pathname.replace(/\/+$/, "");
  return url.origin + path;
}

export function buildApiUrl(baseUrl, path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const queryText = query.toString();
  return `${baseUrl}/api/v4${path}${queryText ? `?${queryText}` : ""}`;
}

export function toMrItem(mr) {
  return {
    id: mr.id,
    title: mr.title,
    url: mr.web_url,
    reference: mr.references?.full ?? "",
    author: mr.author?.name ?? "",
    updatedAt: mr.updated_at,
    draft: Boolean(mr.draft),
    hasConflicts: Boolean(mr.has_conflicts),
    status: mr.detailed_merge_status ?? "",
    comments: mr.user_notes_count ?? 0,
    description: mr.description ?? "",
  };
}

export function toMentionItems(todos) {
  return todos
    .filter((todo) => MENTION_ACTIONS.has(todo.action_name))
    .map((todo) => ({
      id: todo.id,
      url: todo.target_url,
      title: todo.target?.title ?? "",
      targetType: todo.target_type ?? "",
      project: todo.project?.name_with_namespace ?? "",
      author: todo.author?.name ?? "",
      body: todo.body ?? "",
      createdAt: todo.created_at,
    }));
}

export function relativeTime(isoDate, now = Date.now()) {
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Joins several lists, keeps the first copy of each id, newest first by the given date field.
export function mergeUniqueById(lists, dateField) {
  const byId = new Map();
  for (const item of lists.flat()) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b[dateField]) - Date.parse(a[dateField]));
}

export function isSafeLink(link) {
  try {
    const { protocol } = new URL(link);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
