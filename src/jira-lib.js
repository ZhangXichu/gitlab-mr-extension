// Pure Jira helpers with no Chrome or network calls, so they can be tested in Node.
// Jira Cloud REST v3 returns comment bodies in ADF (Atlassian Document Format): a JSON tree of nodes.

const PAGE_SIZE = 50;
// Nodes whose children sit on one line. Children of every other container go on separate lines.
const INLINE_CONTAINERS = new Set(["paragraph", "heading", "codeBlock"]);

export function buildJiraSearchUrl(siteUrl, days) {
  const query = new URLSearchParams({
    // Jira makes you a watcher when you comment, so "watcher" finds the issues where replies to you can be.
    jql: `(comment ~ currentUser() OR watcher = currentUser()) AND updated >= -${days}d ORDER BY updated DESC`,
    fields: "summary,comment",
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

// Comments written by someone else, after `sinceMs`, that @mention `accountId` or reply to them. Newest first.
export function toJiraItems(issues, siteUrl, accountId, sinceMs) {
  const items = [];
  for (const issue of issues) {
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
