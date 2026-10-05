// Pure Jira helpers with no Chrome or network calls, so they can be tested in Node.
// Jira Cloud REST v3 returns comment bodies in ADF (Atlassian Document Format): a JSON tree of nodes.

const PAGE_SIZE = 50;
// Nodes whose children sit on one line. Children of every other container go on separate lines.
const INLINE_CONTAINERS = new Set(["paragraph", "heading", "codeBlock"]);

export function buildJiraSearchUrl(siteUrl, days) {
  const query = new URLSearchParams({
    // Jira makes you a watcher when you comment, so "watcher" finds the issues where replies to you can be.
    jql:
      "(comment ~ currentUser() OR description ~ currentUser() OR watcher = currentUser()) " +
      `AND updated >= -${days}d ORDER BY updated DESC`,
    fields: "summary,comment,description,created,reporter",
    maxResults: String(PAGE_SIZE),
  });
  return `${siteUrl}/rest/api/3/search/jql?${query}`;
}

function renderNode(node) {
  if (!node || typeof node !== "object") return "";
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "mention":
      return node.attrs?.text ?? "";
    case "emoji":
      return node.attrs?.text ?? node.attrs?.shortName ?? "";
    case "inlineCard":
      return node.attrs?.url ?? "";
    case "hardBreak":
      return "\n";
    default: {
      const parts = (node.content ?? []).map(renderNode);
      return parts.join(INLINE_CONTAINERS.has(node.type) ? "" : "\n");
    }
  }
}

export function adfToText(doc) {
  return renderNode(doc).trim();
}

function mentionsAccount(node, accountId) {
  if (!node || typeof node !== "object") return false;
  if (node.type === "mention" && node.attrs?.id === accountId) return true;
  return (node.content ?? []).some((child) => mentionsAccount(child, accountId));
}

function latestCommentTime(comments, accountId) {
  const mine = comments.filter((comment) => comment.author?.accountId === accountId);
  return Math.max(-Infinity, ...mine.map((comment) => Date.parse(comment.created)));
}

// Why a comment by someone else is shown: it @mentions me, or it came after my latest comment
// on the issue. null means it is not for me. With no comment of mine, myLatestMs is -Infinity: no replies.
function reasonFor(comment, accountId, myLatestMs) {
  if (mentionsAccount(comment.body, accountId)) return "mention";
  if (Number.isFinite(myLatestMs) && Date.parse(comment.created) > myLatestMs) return "reply";
  return null;
}

// An issue created after `sinceMs` by someone else, whose description @mentions `accountId`.
// The issue's created date stands in for the mention date: a mention added by a later edit
// to an older issue is not found.
function descriptionItem(issue, siteUrl, accountId, sinceMs) {
  const fields = issue.fields ?? {};
  if (fields.reporter?.accountId === accountId) return null;
  if (!(Date.parse(fields.created) >= sinceMs)) return null;
  if (!mentionsAccount(fields.description, accountId)) return null;
  return {
    id: `${issue.key}#description`,
    issueKey: issue.key,
    title: fields.summary ?? "",
    url: `${siteUrl}/browse/${encodeURIComponent(issue.key)}`,
    author: fields.reporter?.displayName ?? "",
    reason: "description",
    body: adfToText(fields.description),
    createdAt: fields.created,
  };
}

// Comments written by someone else, after `sinceMs`, that @mention `accountId` or reply to them,
// plus recent issues whose description mentions them. Newest first.
export function toJiraItems(issues, siteUrl, accountId, sinceMs) {
  const items = [];
  for (const issue of issues) {
    const fromDescription = descriptionItem(issue, siteUrl, accountId, sinceMs);
    if (fromDescription) items.push(fromDescription);
    const comments = issue.fields?.comment?.comments ?? [];
    const myLatestMs = latestCommentTime(comments, accountId);
    for (const comment of comments) {
      if (comment.author?.accountId === accountId) continue;
      if (!(Date.parse(comment.created) >= sinceMs)) continue;
      const reason = reasonFor(comment, accountId, myLatestMs);
      if (!reason) continue;
      items.push({
        id: `${issue.key}#${comment.id}`,
        issueKey: issue.key,
        title: issue.fields?.summary ?? "",
        url: `${siteUrl}/browse/${encodeURIComponent(issue.key)}?focusedCommentId=${encodeURIComponent(comment.id)}`,
        author: comment.author?.displayName ?? "",
        reason,
        body: adfToText(comment.body),
        createdAt: comment.created,
      });
    }
  }
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
