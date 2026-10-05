import { test } from "node:test";
import assert from "node:assert/strict";
import { adfToText, toJiraItems, buildJiraSearchUrl } from "../src/jira-lib.js";

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

test("toJiraItems keeps mentions of me by others, newest first", () => {
  const since = Date.parse("2026-09-01T00:00:00Z");
  const issues = [
    issue("BSDK-1", "Fix parser", [
      comment("10", OTHER, "Vaclav", "2026-09-11T20:06:33.273+0200",
        doc(paragraph(mention(ME, "Xichu Zhang"), text(" all tests passed?")))),
      // I wrote this one myself and mentioned myself: not a mention for me.
      comment("11", ME, "Xichu Zhang", "2026-09-12T10:00:00.000+0200",
        doc(paragraph(mention(ME, "Xichu Zhang"), text(" note to self")))),
      // Mentions someone else only, and was written before my comment: not for me.
      comment("12", OTHER, "Vaclav", "2026-09-12T09:00:00.000+0200",
        doc(paragraph(mention("x:someone", "Pavel"), text(" look")))),
    ]),
    issue("BSDK-2", "Upgrade conan", [
      comment("20", OTHER, "Stefan", "2026-09-20T14:52:45.808+0200",
        doc(paragraph(text("Hi "), mention(ME, "Xichu Zhang")))),
    ]),
  ];

  const items = toJiraItems(issues, "https://acme.atlassian.net", ME, since);

  assert.deepEqual(items, [
    {
      id: "BSDK-2#20",
      issueKey: "BSDK-2",
      title: "Upgrade conan",
      url: "https://acme.atlassian.net/browse/BSDK-2?focusedCommentId=20",
      author: "Stefan",
      reason: "mention",
      body: "Hi @Xichu Zhang",
      createdAt: "2026-09-20T14:52:45.808+0200",
    },
    {
      id: "BSDK-1#10",
      issueKey: "BSDK-1",
      title: "Fix parser",
      url: "https://acme.atlassian.net/browse/BSDK-1?focusedCommentId=10",
      author: "Vaclav",
      reason: "mention",
      body: "@Xichu Zhang all tests passed?",
      createdAt: "2026-09-11T20:06:33.273+0200",
    },
  ]);
});

test("toJiraItems drops mentions older than the cut-off", () => {
  const since = Date.parse("2026-09-15T00:00:00Z");
  const issues = [
    issue("A-1", "Old", [
      comment("1", OTHER, "Ana", "2026-09-01T00:00:00.000+0000", doc(paragraph(mention(ME, "Me")))),
    ]),
  ];
  assert.deepEqual(toJiraItems(issues, "https://acme.atlassian.net", ME, since), []);
});

test("toJiraItems tolerates issues without comments", () => {
  const issues = [{ key: "A-1", fields: { summary: "No comments" } }, { key: "A-2", fields: {} }];
  assert.deepEqual(toJiraItems(issues, "https://acme.atlassian.net", ME, 0), []);
});

test("toJiraItems keeps replies by others written after my latest comment", () => {
  const issues = [
    issue("BSDK-802", "Age models", [
      comment("1", OTHER, "Michaela", "2026-09-30T10:35:14.970+0200", doc(paragraph(text("before me")))),
      comment("2", ME, "Xichu Zhang", "2026-10-05T15:02:05.886+0200", doc(paragraph(text("two questions")))),
      comment("3", OTHER, "Pavel", "2026-10-05T15:10:08.976+0200", doc(paragraph(text("1. a117 + p1 + p2")))),
    ]),
  ];
  const items = toJiraItems(issues, "https://acme.atlassian.net", ME, 0);
  assert.deepEqual(items.map((item) => [item.id, item.reason, item.author]), [["BSDK-802#3", "reply", "Pavel"]]);
});

test("toJiraItems shows nothing once I answer the last reply", () => {
  const issues = [
    issue("A-1", "Done talking", [
      comment("1", OTHER, "Pavel", "2026-10-05T10:00:00.000+0200", doc(paragraph(text("question")))),
      comment("2", ME, "Me", "2026-10-05T11:00:00.000+0200", doc(paragraph(text("answer")))),
    ]),
  ];
  assert.deepEqual(toJiraItems(issues, "https://acme.atlassian.net", ME, 0), []);
});

test("toJiraItems ignores comments on watched issues where I never commented", () => {
  const issues = [
    issue("A-1", "Only watching", [
      comment("1", OTHER, "Ana", "2026-10-05T10:00:00.000+0200", doc(paragraph(text("status update")))),
    ]),
  ];
  assert.deepEqual(toJiraItems(issues, "https://acme.atlassian.net", ME, 0), []);
});

test("toJiraItems lists a comment that is both a reply and a mention once, as a mention", () => {
  const issues = [
    issue("A-1", "Both", [
      comment("1", ME, "Me", "2026-10-05T10:00:00.000+0200", doc(paragraph(text("question")))),
      comment("2", OTHER, "Ana", "2026-10-05T11:00:00.000+0200", doc(paragraph(mention(ME, "Me"), text(" answer")))),
    ]),
  ];
  const items = toJiraItems(issues, "https://acme.atlassian.net", ME, 0);
  assert.deepEqual(items.map((item) => [item.id, item.reason]), [["A-1#2", "mention"]]);
});

test("toJiraItems keeps a recent issue whose description mentions me", () => {
  const since = Date.parse("2026-10-01T00:00:00Z");
  const issues = [
    { key: "BSDK-900", fields: {
      summary: "New models", created: "2026-10-03T09:00:00.000+0200",
      reporter: { accountId: OTHER, displayName: "Pavel" },
      description: doc(paragraph(text("Owner: "), mention(ME, "Xichu Zhang"))),
    } },
    // Description mentions me, but the issue is older than the cut-off.
    { key: "BSDK-18", fields: {
      summary: "Old", created: "2024-11-13T06:24:21.146+0100",
      reporter: { accountId: OTHER, displayName: "Tomas" },
      description: doc(paragraph(mention(ME, "Xichu Zhang"))),
    } },
    // I wrote this description myself.
    { key: "BSDK-901", fields: {
      summary: "Mine", created: "2026-10-03T09:00:00.000+0200",
      reporter: { accountId: ME, displayName: "Xichu Zhang" },
      description: doc(paragraph(mention(ME, "Xichu Zhang"))),
    } },
  ];
  assert.deepEqual(toJiraItems(issues, "https://acme.atlassian.net", ME, since), [
    {
      id: "BSDK-900#description",
      issueKey: "BSDK-900",
      title: "New models",
      url: "https://acme.atlassian.net/browse/BSDK-900",
      author: "Pavel",
      reason: "description",
      body: "Owner: @Xichu Zhang",
      createdAt: "2026-10-03T09:00:00.000+0200",
    },
  ]);
});

test("buildJiraSearchUrl asks for recent issues that mention me or that I watch", () => {
  const url = new URL(buildJiraSearchUrl("https://acme.atlassian.net", 14));
  assert.equal(url.origin + url.pathname, "https://acme.atlassian.net/rest/api/3/search/jql");
  assert.equal(
    url.searchParams.get("jql"),
    "(comment ~ currentUser() OR description ~ currentUser() OR watcher = currentUser()) " +
      "AND updated >= -14d ORDER BY updated DESC",
  );
  assert.equal(url.searchParams.get("fields"), "summary,comment,description,created,reporter");
  assert.equal(url.searchParams.get("maxResults"), "50");
});
