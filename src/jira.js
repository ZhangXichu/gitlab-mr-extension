import { buildJiraSearchUrl, toJiraMentionItems } from "./jira-lib.js";
import { LoginNeededError } from "./errors.js";

const REQUEST_TIMEOUT_MS = 15000;
// Newest comments read per issue when the search did not return them all.
const COMMENT_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
export const JIRA_MENTION_DAYS = 14;

// No token: the request carries the browser's Jira login cookie, so the user must be logged in to Jira in Chrome.
async function getJson(siteUrl, url) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401) {
    throw new LoginNeededError("Not logged in to Jira. Log in, then refresh.", siteUrl);
  }
  if (!response.ok) {
    throw new Error(`Jira returned ${response.status} for ${new URL(url).pathname}`);
  }
  return response.json();
}

// The search may return only part of an issue's comments. Then read the newest page of comments directly.
async function withRecentComments(siteUrl, issue) {
  const comment = issue.fields?.comment;
  if (!comment || (comment.comments?.length ?? 0) >= (comment.total ?? 0)) return issue;
  const query = new URLSearchParams({ orderBy: "-created", maxResults: String(COMMENT_PAGE_SIZE) });
  const page = await getJson(siteUrl, `${siteUrl}/rest/api/3/issue/${encodeURIComponent(issue.key)}/comment?${query}`);
  return { ...issue, fields: { ...issue.fields, comment: { ...comment, comments: page.comments ?? [] } } };
}

export async function fetchJiraMentions(jiraConfig) {
  const { siteUrl } = jiraConfig;
  const me = await getJson(siteUrl, `${siteUrl}/rest/api/3/myself`);
  const result = await getJson(siteUrl, buildJiraSearchUrl(siteUrl, JIRA_MENTION_DAYS));
  const issues = await Promise.all((result.issues ?? []).map((issue) => withRecentComments(siteUrl, issue)));
  const sinceMs = Date.now() - JIRA_MENTION_DAYS * DAY_MS;
  return {
    displayName: me.displayName ?? "",
    fetchedAt: new Date().toISOString(),
    mentions: toJiraMentionItems(issues, siteUrl, me.accountId, sinceMs),
  };
}
