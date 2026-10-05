// Pure Confluence helpers with no Chrome or network calls, so they can be tested in Node.
// Confluence lives on the same Atlassian site as Jira, under /wiki.

const PAGE_SIZE = 25;

export function buildConfluenceSearchUrl(siteUrl, days) {
  const query = new URLSearchParams({
    cql: `mention = currentUser() AND lastmodified >= now("-${days}d") ORDER BY lastmodified DESC`,
    expand: "content.version",
    limit: String(PAGE_SIZE),
  });
  return `${siteUrl}/wiki/rest/api/search?${query}`;
}

// Search excerpts mark the matched words with @@@hl@@@ ... @@@endhl@@@ and use HTML entities.
function cleanExcerpt(text) {
  return (text ?? "")
    .replace(/@@@(end)?hl@@@/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Pages and page comments that @mention the user. Newest first.
export function toConfluenceItems(result, siteUrl) {
  const base = result._links?.base ?? `${siteUrl}/wiki`;
  const items = (result.results ?? []).map((entry) => ({
    id: `confluence#${entry.content?.id}`,
    space: entry.resultGlobalContainer?.title ?? "",
    title: entry.title ?? entry.content?.title ?? "",
    url: `${base}${entry.url ?? entry.content?._links?.webui ?? ""}`,
    author: entry.content?.version?.by?.displayName ?? "",
    reason: "page",
    body: cleanExcerpt(entry.excerpt),
    createdAt: entry.lastModified,
  }));
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
