import { buildApiUrl, toMrItem, toMentionItems, mergeUniqueById } from "./lib.js";

const REQUEST_TIMEOUT_MS = 15000;
// One page per list. GitLab allows at most 100 items per page.
const PAGE_SIZE = 100;

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
  if (!response.ok) {
    throw new Error(`GitLab returned ${response.status} for ${path}`);
  }
  return response.json();
}

export async function fetchDashboard(config) {
  const user = await request(config, "GET", "/user");
  const mrParams = { state: "opened", per_page: PAGE_SIZE, order_by: "updated_at" };
  const todoParams = { state: "pending", per_page: PAGE_SIZE };

  const [created, assigned, reviewing, mentioned, addressed] = await Promise.all([
    request(config, "GET", "/merge_requests", { ...mrParams, scope: "created_by_me" }),
    request(config, "GET", "/merge_requests", { ...mrParams, scope: "assigned_to_me" }),
    request(config, "GET", "/merge_requests", { ...mrParams, scope: "all", reviewer_username: user.username }),
    request(config, "GET", "/todos", { ...todoParams, action: "mentioned" }),
    request(config, "GET", "/todos", { ...todoParams, action: "directly_addressed" }),
  ]);

  return {
    username: user.username,
    fetchedAt: new Date().toISOString(),
    mine: mergeUniqueById([created.map(toMrItem), assigned.map(toMrItem)], "updatedAt"),
    reviewing: reviewing.map(toMrItem),
    mentions: mergeUniqueById([toMentionItems(mentioned), toMentionItems(addressed)], "createdAt"),
  };
}

// Needs a token with the "api" scope. A "read_api" token gets a 403 here.
export async function markTodoDone(config, todoId) {
  await request(config, "POST", `/todos/${encodeURIComponent(todoId)}/mark_as_done`);
}
