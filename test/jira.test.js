import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToText, toJiraMentionItems, buildJiraSearchUrl } from "../src/jira-lib.js";

const ME = "712020:me";
const OTHER = "5f45:other";

function paragraph(...content) {
  return { type: "paragraph", content };
}
function text(value) {
  return { type: "text", text: value };
}
function mention(id, name) {
  return { type: "mention", attrs: { id, text: `@${name}` } };
}
function doc(...content) {
  return { type: "doc", version: 1, content };
}

test("adfToText joins text, mentions and line breaks into plain text", () => {
  const body = doc(
    paragraph(mention(ME, "Xichu Zhang"), text(" can you check this?")),
    paragraph(text("line one"), { type: "hardBreak" }, text("line two")),
  );
  assert.equal(adfToText(body), "@Xichu Zhang can you check this?\nline one\nline two");
});

test("adfToText returns an empty string for missing or odd input", () => {
  assert.equal(adfToText(undefined), "");
  assert.equal(adfToText(null), "");
  assert.equal(adfToText({ type: "doc" }), "");
});

function issue(key, summary, comments) {
  return { key, fields: { summary, comment: { comments } } };
}
function comment(id, authorId, authorName, created, body) {
  return { id, author: { accountId: authorId, displayName: authorName }, created, body };
}

test("toJiraMentionItems keeps comments by others that mention me, newest first", () => {
  const since = Date.parse("2026-09-01T00:00:00Z");
  const issues = [
    issue("BSDK-1", "Fix parser", [
      comment("10", OTHER, "Vaclav", "2026-09-11T20:06:33.273+0200",
        doc(paragraph(mention(ME, "Xichu Zhang"), text(" all tests passed?")))),
      // I wrote this one myself and mentioned myself: not a mention for me.
      comment("11", ME, "Xichu Zhang", "2026-09-12T10:00:00.000+0200",
        doc(paragraph(mention(ME, "Xichu Zhang"), text(" note to self")))),
      // Mentions someone else only.
      comment("12", OTHER, "Vaclav", "2026-09-13T10:00:00.000+0200",
        doc(paragraph(mention("x:someone", "Pavel"), text(" look")))),
    ]),
    issue("BSDK-2", "Upgrade conan", [
      comment("20", OTHER, "Stefan", "2026-09-20T14:52:45.808+0200",
        doc(paragraph(text("Hi "), mention(ME, "Xichu Zhang")))),
    ]),
  ];

  const items = toJiraMentionItems(issues, "https://acme.atlassian.net", ME, since);

  assert.deepEqual(items, [
    {
      id: "BSDK-2#20",
      issueKey: "BSDK-2",
      title: "Upgrade conan",
      url: "https://acme.atlassian.net/browse/BSDK-2?focusedCommentId=20",
      author: "Stefan",
      body: "Hi @Xichu Zhang",
      createdAt: "2026-09-20T14:52:45.808+0200",
    },
    {
      id: "BSDK-1#10",
      issueKey: "BSDK-1",
      title: "Fix parser",
      url: "https://acme.atlassian.net/browse/BSDK-1?focusedCommentId=10",
      author: "Vaclav",
      body: "@Xichu Zhang all tests passed?",
      createdAt: "2026-09-11T20:06:33.273+0200",
    },
  ]);
});

test("toJiraMentionItems drops mentions older than the cut-off", () => {
  const since = Date.parse("2026-09-15T00:00:00Z");
  const issues = [
    issue("A-1", "Old", [
      comment("1", OTHER, "Ana", "2026-09-01T00:00:00.000+0000", doc(paragraph(mention(ME, "Me")))),
    ]),
  ];
  assert.deepEqual(toJiraMentionItems(issues, "https://acme.atlassian.net", ME, since), []);
});

test("toJiraMentionItems tolerates issues without comments", () => {
  const issues = [{ key: "A-1", fields: { summary: "No comments" } }, { key: "A-2", fields: {} }];
  assert.deepEqual(toJiraMentionItems(issues, "https://acme.atlassian.net", ME, 0), []);
});

test("buildJiraSearchUrl asks for recent issues with comments that mention me", () => {
  const url = new URL(buildJiraSearchUrl("https://acme.atlassian.net", 14));
  assert.equal(url.origin + url.pathname, "https://acme.atlassian.net/rest/api/3/search/jql");
  assert.equal(url.searchParams.get("jql"), "comment ~ currentUser() AND updated >= -14d ORDER BY updated DESC");
  assert.equal(url.searchParams.get("fields"), "summary,comment");
  assert.equal(url.searchParams.get("maxResults"), "50");
});
