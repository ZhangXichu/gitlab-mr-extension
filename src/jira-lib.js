// Pure Jira helpers with no Chrome or network calls, so they can be tested in Node.
// Jira Cloud REST v3 returns comment bodies in ADF (Atlassian Document Format): a JSON tree of nodes.

const PAGE_SIZE = 50;
// Nodes whose children sit on one line. Children of every other container go on separate lines.
const INLINE_CONTAINERS = new Set(["paragraph", "heading", "codeBlock"]);

export function buildJiraSearchUrl(siteUrl, days) {
  const query = new URLSearchParams({
    jql: `comment ~ currentUser() AND updated >= -${days}d ORDER BY updated DESC`,
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

// Comments written by someone else, after `sinceMs`, that @mention `accountId`. Newest first.
export function toJiraMentionItems(issues, siteUrl, accountId, sinceMs) {
  const items = [];
  for (const issue of issues) {
    const comments = issue.fields?.comment?.comments ?? [];
    for (const comment of comments) {
      if (comment.author?.accountId === accountId) continue;
      if (!(Date.parse(comment.created) >= sinceMs)) continue;
      if (!mentionsAccount(comment.body, accountId)) continue;
      items.push({
        id: `${issue.key}#${comment.id}`,
        issueKey: issue.key,
        title: issue.fields?.summary ?? "",
        url: `${siteUrl}/browse/${encodeURIComponent(issue.key)}?focusedCommentId=${encodeURIComponent(comment.id)}`,
        author: comment.author?.displayName ?? "",
        body: adfToText(comment.body),
        createdAt: comment.created,
      });
    }
  }
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
