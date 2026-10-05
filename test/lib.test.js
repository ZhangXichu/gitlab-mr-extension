import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBaseUrl,
  buildApiUrl,
  toMrItem,
  toMentionItems,
  relativeTime,
} from "../src/lib.js";

test("normalizeBaseUrl removes trailing slashes and keeps the path", () => {
  assert.equal(normalizeBaseUrl("https://gitlab.example.com/"), "https://gitlab.example.com");
  assert.equal(normalizeBaseUrl("  https://example.com/gitlab//  "), "https://example.com/gitlab");
});

test("normalizeBaseUrl rejects empty, non-http and invalid input", () => {
  assert.throws(() => normalizeBaseUrl(""), /required/);
  assert.throws(() => normalizeBaseUrl("ftp://example.com"), /http/);
  assert.throws(() => normalizeBaseUrl("not a url"), /valid/);
});

test("buildApiUrl adds the api prefix and query parameters", () => {
  const url = buildApiUrl("https://g.example.com", "/merge_requests", { state: "opened", per_page: 50 });
  assert.equal(url, "https://g.example.com/api/v4/merge_requests?state=opened&per_page=50");
});

test("buildApiUrl skips undefined parameters", () => {
  const url = buildApiUrl("https://g.example.com", "/user", { a: undefined });
  assert.equal(url, "https://g.example.com/api/v4/user");
});

test("toMrItem picks the fields the popup shows", () => {
  const item = toMrItem({
    id: 7,
    iid: 12,
    title: "Draft: Fix crash",
    web_url: "https://g/x/-/merge_requests/12",
    references: { full: "group/proj!12" },
    author: { name: "Ana", username: "ana" },
    updated_at: "2026-10-01T10:00:00Z",
    draft: true,
    has_conflicts: true,
    detailed_merge_status: "mergeable",
    user_notes_count: 3,
    description: "Fixes the crash.",
  });
  assert.deepEqual(item, {
    id: 7,
    title: "Draft: Fix crash",
    url: "https://g/x/-/merge_requests/12",
    reference: "group/proj!12",
    author: "Ana",
    updatedAt: "2026-10-01T10:00:00Z",
    draft: true,
    hasConflicts: true,
    status: "mergeable",
    comments: 3,
    description: "Fixes the crash.",
  });
});

test("toMrItem tolerates missing optional fields", () => {
  const item = toMrItem({ id: 1, title: "t", web_url: "u", updated_at: "d" });
  assert.equal(item.reference, "");
  assert.equal(item.author, "");
  assert.equal(item.draft, false);
  assert.equal(item.hasConflicts, false);
  assert.equal(item.comments, 0);
  assert.equal(item.description, "");
});

test("toMentionItems keeps only mentions and direct addresses", () => {
  const todos = [
    { id: 1, action_name: "mentioned", target_url: "u1", body: "hey @me",
      target: { title: "MR one" }, target_type: "MergeRequest",
      project: { name_with_namespace: "G / P" }, author: { name: "Bob" },
      created_at: "2026-10-02T00:00:00Z" },
    { id: 2, action_name: "assigned", target_url: "u2", target: { title: "x" } },
    { id: 3, action_name: "directly_addressed", target_url: "u3", body: "@me look",
      target: { title: "Issue two" }, target_type: "Issue",
      project: null, author: { name: "Cy" }, created_at: "2026-10-03T00:00:00Z" },
  ];
  assert.deepEqual(toMentionItems(todos), [
    { id: 1, url: "u1", title: "MR one", targetType: "MergeRequest", project: "G / P",
      author: "Bob", body: "hey @me", createdAt: "2026-10-02T00:00:00Z" },
    { id: 3, url: "u3", title: "Issue two", targetType: "Issue", project: "",
      author: "Cy", body: "@me look", createdAt: "2026-10-03T00:00:00Z" },
  ]);
});

test("relativeTime gives short readable ages", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  assert.equal(relativeTime("2026-10-05T11:59:30Z", now), "just now");
  assert.equal(relativeTime("2026-10-05T11:15:00Z", now), "45m ago");
  assert.equal(relativeTime("2026-10-05T07:00:00Z", now), "5h ago");
  assert.equal(relativeTime("2026-10-02T12:00:00Z", now), "3d ago");
  assert.equal(relativeTime("garbage", now), "");
});

import { mergeUniqueById, isSafeLink } from "../src/lib.js";

test("mergeUniqueById drops repeats and sorts newest first", () => {
  const a = [{ id: 1, updatedAt: "2026-10-01T00:00:00Z" }, { id: 2, updatedAt: "2026-10-03T00:00:00Z" }];
  const b = [{ id: 2, updatedAt: "2026-10-03T00:00:00Z" }, { id: 3, updatedAt: "2026-10-02T00:00:00Z" }];
  assert.deepEqual(mergeUniqueById([a, b], "updatedAt").map((x) => x.id), [2, 3, 1]);
});

test("isSafeLink allows only http and https links", () => {
  assert.equal(isSafeLink("https://gitlab.example.com/a"), true);
  assert.equal(isSafeLink("http://gitlab.local/a"), true);
  assert.equal(isSafeLink("javascript:alert(1)"), false);
  assert.equal(isSafeLink(""), false);
  assert.equal(isSafeLink(undefined), false);
});
