import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConfluenceSearchUrl, toConfluenceItems } from "../src/confluence-lib.js";

test("buildConfluenceSearchUrl asks for recent content that mentions me", () => {
  const url = new URL(buildConfluenceSearchUrl("https://acme.atlassian.net", 14));
  assert.equal(url.origin + url.pathname, "https://acme.atlassian.net/wiki/rest/api/search");
  assert.equal(url.searchParams.get("cql"), 'mention = currentUser() AND lastmodified >= now("-14d") ORDER BY lastmodified DESC');
  assert.equal(url.searchParams.get("expand"), "content.version");
  assert.equal(url.searchParams.get("limit"), "25");
});

// Shape of GET /wiki/rest/api/search (Confluence Cloud REST v1).
const RESULT = {
  results: [
    {
      content: {
        id: "32606060690",
        type: "page",
        title: "Biometric SDKs",
        version: { by: { displayName: "Igor Janos" } },
        _links: { webui: "/spaces/RD/pages/32606060690/Biometric+SDKs" },
      },
      title: "Biometric SDKs",
      excerpt: "Team members: @@@hl@@@Xichu Zhang@@@endhl@@@ and others &amp; more",
      url: "/spaces/RD/pages/32606060690/Biometric+SDKs",
      resultGlobalContainer: { title: "Technology Division" },
      lastModified: "2026-10-01T10:00:00.000Z",
    },
    {
      content: { id: "777", type: "comment", title: "Re: Release plan", _links: {} },
      title: "Re: Release plan",
      excerpt: "",
      url: "/spaces/RD/pages/5/Release+plan?focusedCommentId=777",
      lastModified: "2026-10-03T10:00:00.000Z",
    },
  ],
  _links: { base: "https://acme.atlassian.net/wiki" },
};

test("toConfluenceItems turns search results into popup items, newest first", () => {
  assert.deepEqual(toConfluenceItems(RESULT, "https://acme.atlassian.net"), [
    {
      id: "confluence#777",
      space: "",
      title: "Re: Release plan",
      url: "https://acme.atlassian.net/wiki/spaces/RD/pages/5/Release+plan?focusedCommentId=777",
      author: "",
      reason: "page",
      body: "",
      createdAt: "2026-10-03T10:00:00.000Z",
    },
    {
      id: "confluence#32606060690",
      space: "Technology Division",
      title: "Biometric SDKs",
      url: "https://acme.atlassian.net/wiki/spaces/RD/pages/32606060690/Biometric+SDKs",
      author: "Igor Janos",
      reason: "page",
      body: "Team members: Xichu Zhang and others & more",
      createdAt: "2026-10-01T10:00:00.000Z",
    },
  ]);
});

test("toConfluenceItems tolerates an empty answer", () => {
  assert.deepEqual(toConfluenceItems({}, "https://acme.atlassian.net"), []);
});
