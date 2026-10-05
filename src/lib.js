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

const NOTEABLE_PATHS = { MergeRequest: "merge_requests", Issue: "issues" };

// From my own comment events (newest first): each merge request or issue I commented on, once.
export function commentedTargets(events, limit) {
  const byKey = new Map();
  for (const event of events) {
    const noteableType = event.note?.noteable_type;
    if (!NOTEABLE_PATHS[noteableType]) continue;
    const iid = event.note.noteable_iid;
    const key = `${event.project_id}/${noteableType}/${iid}`;
    if (byKey.has(key)) continue;
    byKey.set(key, { projectId: event.project_id, noteableType, iid, title: event.target_title ?? "" });
    if (byKey.size >= limit) break;
  }
  return [...byKey.values()];
}

export function noteablePath(noteableType) {
  return NOTEABLE_PATHS[noteableType];
}

function isResolved(discussion) {
  const resolvable = discussion.notes.filter((note) => note.resolvable);
  return resolvable.length > 0 && resolvable.every((note) => note.resolved);
}

// Notes by others, after `sinceMs`, in open threads where `username` wrote, posted after their latest note there.
export function toReplyItems(discussions, target, project, username, sinceMs) {
  const items = [];
  for (const discussion of discussions) {
    if (discussion.individual_note || isResolved(discussion)) continue;
    const notes = discussion.notes.filter((note) => !note.system);
    const mine = notes.filter((note) => note.author?.username === username);
    if (mine.length === 0) continue;
    const myLatestMs = Math.max(...mine.map((note) => Date.parse(note.created_at)));
    for (const note of notes) {
      const createdMs = Date.parse(note.created_at);
      if (note.author?.username === username || createdMs <= myLatestMs || !(createdMs >= sinceMs)) continue;
      items.push({
        id: `reply-${note.id}`,
        url: `${project.webUrl}/-/${NOTEABLE_PATHS[target.noteableType]}/${target.iid}#note_${note.id}`,
        title: target.title,
        targetType: target.noteableType,
        project: project.name,
        author: note.author?.name ?? "",
        body: note.body ?? "",
        createdAt: note.created_at,
        reason: "reply",
      });
    }
  }
  return items;
}

function noteAnchor(url) {
  return (url ?? "").match(/#note_\d+$/)?.[0] ?? null;
}

// A reply that also @mentions me already has a GitLab to-do. Show it once, as the to-do.
export function dropRepliesWithTodo(replies, mentions) {
  const todoAnchors = new Set(mentions.map((mention) => noteAnchor(mention.url)).filter(Boolean));
  return replies.filter((reply) => !todoAnchors.has(noteAnchor(reply.url)));
}
