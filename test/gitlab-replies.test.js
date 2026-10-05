import { test } from "node:test";
import assert from "node:assert/strict";
import { commentedTargets, toReplyItems, dropRepliesWithTodo } from "../src/lib.js";

// Shape of GET /events?action=commented (the current user's own comments), newest first.
function commentEvent(projectId, noteableType, iid, title) {
  return {
    project_id: projectId,
    action_name: "commented on",
    target_type: "DiffNote",
    target_title: title,
    note: { noteable_type: noteableType, noteable_iid: iid },
  };
}

test("commentedTargets lists each merge request or issue I commented on once, newest first", () => {
  const events = [
    commentEvent(5, "MergeRequest", 12, "Fix crash"),
    commentEvent(5, "Issue", 3, "Crash on start"),
    commentEvent(5, "MergeRequest", 12, "Fix crash"),
    commentEvent(7, "MergeRequest", 12, "Other project, same number"),
    commentEvent(5, "Commit", null, "abc123"),
  ];
  assert.deepEqual(commentedTargets(events, 10), [
    { projectId: 5, noteableType: "MergeRequest", iid: 12, title: "Fix crash" },
    { projectId: 5, noteableType: "Issue", iid: 3, title: "Crash on start" },
    { projectId: 7, noteableType: "MergeRequest", iid: 12, title: "Other project, same number" },
  ]);
});

test("commentedTargets stops at the limit", () => {
  const events = [1, 2, 3].map((iid) => commentEvent(5, "MergeRequest", iid, `MR ${iid}`));
  assert.deepEqual(commentedTargets(events, 2).map((target) => target.iid), [1, 2]);
});

function note(id, username, name, createdAt, body, extra = {}) {
  return { id, body, author: { username, name }, created_at: createdAt, system: false, ...extra };
}
const TARGET = { projectId: 5, noteableType: "MergeRequest", iid: 12, title: "Fix crash" };
const PROJECT = { webUrl: "https://g.example.com/sdk/iface", name: "SDK / iface" };

test("toReplyItems keeps notes by others after my latest note in the same thread", () => {
  const discussions = [
    { id: "d1", individual_note: false, notes: [
      note(1, "bob", "Bob", "2026-10-05T08:00:00Z", "Why this threshold?"),
      note(2, "me", "Me", "2026-10-05T09:00:00Z", "Because of the new model."),
      note(3, "bob", "Bob", "2026-10-05T10:00:00Z", "OK, but please add a test."),
    ] },
    // A thread I never wrote in.
    { id: "d2", individual_note: false, notes: [
      note(4, "ana", "Ana", "2026-10-05T08:00:00Z", "Typo here"),
      note(5, "bob", "Bob", "2026-10-05T11:00:00Z", "Fixed"),
    ] },
    // A thread where I answered last.
    { id: "d3", individual_note: false, notes: [
      note(6, "ana", "Ana", "2026-10-05T08:00:00Z", "Question"),
      note(7, "me", "Me", "2026-10-05T09:00:00Z", "Answer"),
    ] },
  ];
  assert.deepEqual(toReplyItems(discussions, TARGET, PROJECT, "me", 0), [
    {
      id: "reply-3",
      url: "https://g.example.com/sdk/iface/-/merge_requests/12#note_3",
      title: "Fix crash",
      targetType: "MergeRequest",
      project: "SDK / iface",
      author: "Bob",
      body: "OK, but please add a test.",
      createdAt: "2026-10-05T10:00:00Z",
      reason: "reply",
    },
  ]);
});

test("toReplyItems skips resolved threads, system notes, single comments and old notes", () => {
  const discussions = [
    { id: "resolved", individual_note: false, notes: [
      note(1, "me", "Me", "2026-10-05T09:00:00Z", "Q", { resolvable: true, resolved: true }),
      note(2, "bob", "Bob", "2026-10-05T10:00:00Z", "A", { resolvable: true, resolved: true }),
    ] },
    { id: "system", individual_note: false, notes: [
      note(3, "me", "Me", "2026-10-05T09:00:00Z", "Q"),
      note(4, "bob", "Bob", "2026-10-05T10:00:00Z", "added 1 commit", { system: true }),
    ] },
    { id: "single", individual_note: true, notes: [note(5, "bob", "Bob", "2026-10-05T10:00:00Z", "LGTM")] },
    { id: "old", individual_note: false, notes: [
      note(6, "me", "Me", "2026-09-01T09:00:00Z", "Q"),
      note(7, "bob", "Bob", "2026-09-01T10:00:00Z", "A"),
    ] },
  ];
  const since = Date.parse("2026-09-20T00:00:00Z");
  assert.deepEqual(toReplyItems(discussions, TARGET, PROJECT, "me", since), []);
});

test("toReplyItems builds issue links for issues", () => {
  const discussions = [{ id: "d", individual_note: false, notes: [
    note(1, "me", "Me", "2026-10-05T09:00:00Z", "Q"),
    note(2, "bob", "Bob", "2026-10-05T10:00:00Z", "A"),
  ] }];
  const issue = { projectId: 5, noteableType: "Issue", iid: 3, title: "Crash" };
  assert.equal(toReplyItems(discussions, issue, PROJECT, "me", 0)[0].url, "https://g.example.com/sdk/iface/-/issues/3#note_2");
});

test("dropRepliesWithTodo removes replies that already have a mention to-do for the same note", () => {
  const replies = [{ id: "reply-3", url: "https://g/x/-/merge_requests/12#note_3" }, { id: "reply-4", url: "https://g/x/-/merge_requests/12#note_4" }];
  const mentions = [{ id: 99, url: "https://g/x/-/merge_requests/12#note_3" }];
  assert.deepEqual(dropRepliesWithTodo(replies, mentions).map((reply) => reply.id), ["reply-4"]);
});
