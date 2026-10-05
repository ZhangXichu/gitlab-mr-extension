import {
  buildApiUrl,
  toMrItem,
  toMentionItems,
  mergeUniqueById,
  commentedTargets,
  noteablePath,
  toReplyItems,
  dropRepliesWithTodo,
} from "./lib.js";

const REQUEST_TIMEOUT_MS = 15000;
// One page per list. GitLab allows at most 100 items per page.
const PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
export const REPLY_DAYS = 14;
// Bounds on the reply search, so one refresh makes a fixed, small number of requests.
const MAX_REPLY_TARGETS = 20;
const MAX_DISCUSSION_PAGES = 5;

class NotFoundError extends Error {}

async function request(config, method, path, params) {
  const response = await fetch(buildApiUrl(config.baseUrl, path, params), {
    method,
    headers: { "PRIVATE-TOKEN": config.token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401) {
    throw new Error("GitLab rejected the token (401). Check it in Options.");
  }
  if (response.status === 403) {
    throw new Error(`GitLab refused ${path} (403). The token may need a wider scope.`);
  }
  if (response.status === 404) {
    throw new NotFoundError(`GitLab has no ${path} (404)`);
  }
  if (!response.ok) {
    throw new Error(`GitLab returned ${response.status} for ${path}`);
  }
  return response.json();
}

async function fetchAllDiscussions(config, target) {
  const path = `/projects/${target.projectId}/${noteablePath(target.noteableType)}/${target.iid}/discussions`;
  const discussions = [];
  for (let page = 1; page <= MAX_DISCUSSION_PAGES; page += 1) {
    const batch = await request(config, "GET", path, { per_page: PAGE_SIZE, page });
    discussions.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return discussions;
}

// A merge request, issue or project deleted since I commented answers 404: it has no replies to show.
async function unlessGone(promise, fallback) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof NotFoundError) return fallback;
    throw error;
  }
}

// Replies to me in threads on merge requests and issues I commented on in the last REPLY_DAYS days.
async function fetchReplies(config, username) {
  const sinceMs = Date.now() - REPLY_DAYS * DAY_MS;
  // "after" is a date and excludes that day, so ask from one day earlier; sinceMs makes it exact.
  const after = new Date(sinceMs - DAY_MS).toISOString().slice(0, 10);
  const events = await request(config, "GET", "/events", { action: "commented", after, per_page: PAGE_SIZE });
  const targets = commentedTargets(events, MAX_REPLY_TARGETS);

  const projectIds = [...new Set(targets.map((target) => target.projectId))];
  const projects = new Map(await Promise.all(projectIds.map(async (id) => {
    const project = await unlessGone(request(config, "GET", `/projects/${id}`), null);
    return [id, project && { webUrl: project.web_url, name: project.name_with_namespace }];
  })));

  const perTarget = await Promise.all(targets.map(async (target) => {
    const project = projects.get(target.projectId);
    if (!project) return [];
    const discussions = await unlessGone(fetchAllDiscussions(config, target), []);
    return toReplyItems(discussions, target, project, username, sinceMs);
  }));
  return perTarget.flat();
}

export async function fetchDashboard(config) {
  const user = await request(config, "GET", "/user");
  const mrParams = { state: "opened", per_page: PAGE_SIZE, order_by: "updated_at" };
  const todoParams = { state: "pending", per_page: PAGE_SIZE };

  const [created, assigned, reviewing, mentioned, addressed, replies] = await Promise.all([
    request(config, "GET", "/merge_requests", { ...mrParams, scope: "created_by_me" }),
    request(config, "GET", "/merge_requests", { ...mrParams, scope: "assigned_to_me" }),
    request(config, "GET", "/merge_requests", { ...mrParams, scope: "all", reviewer_username: user.username }),
    request(config, "GET", "/todos", { ...todoParams, action: "mentioned" }),
    request(config, "GET", "/todos", { ...todoParams, action: "directly_addressed" }),
    fetchReplies(config, user.username),
  ]);
  const mentions = mergeUniqueById([toMentionItems(mentioned), toMentionItems(addressed)], "createdAt");

  return {
    username: user.username,
    fetchedAt: new Date().toISOString(),
    mine: mergeUniqueById([created.map(toMrItem), assigned.map(toMrItem)], "updatedAt"),
    reviewing: reviewing.map(toMrItem),
    mentions,
    replies: dropRepliesWithTodo(replies, mentions),
  };
}

// Needs a token with the "api" scope. A "read_api" token gets a 403 here.
export async function markTodoDone(config, todoId) {
  await request(config, "POST", `/todos/${encodeURIComponent(todoId)}/mark_as_done`);
}
