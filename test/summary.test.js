import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSummaryPrompt, extractSummaryText } from "../src/summary-lib.js";

test("buildSummaryPrompt for a merge request includes title, reference and description", () => {
  const prompt = buildSummaryPrompt({
    kind: "mr",
    title: "Fix crash on empty image",
    reference: "sdk/iface!42",
    author: "Ana",
    description: "The detector crashed when the image had zero width.",
  });
  assert.match(prompt, /merge request/i);
  assert.match(prompt, /Fix crash on empty image/);
  assert.match(prompt, /sdk\/iface!42/);
  assert.match(prompt, /Ana/);
  assert.match(prompt, /zero width/);
});

test("buildSummaryPrompt for a Jira mention includes issue key, title and the comment", () => {
  const prompt = buildSummaryPrompt({
    kind: "jira",
    reason: "mention",
    issueKey: "BSDK-785",
    title: "Parser matches no metrics",
    author: "Vaclav",
    body: "@Xichu Zhang And all tests passed correctly?",
  });
  assert.match(prompt, /Jira/);
  assert.match(prompt, /BSDK-785/);
  assert.match(prompt, /Parser matches no metrics/);
  assert.match(prompt, /all tests passed correctly/);
});

test("buildSummaryPrompt for a Jira reply says it answers the reader's comment", () => {
  const prompt = buildSummaryPrompt({
    kind: "jira",
    reason: "reply",
    issueKey: "BSDK-802",
    title: "Age models",
    author: "Pavel",
    body: "1. a117 + p1 + p2",
  });
  assert.match(prompt, /reply to the reader's earlier comment/);
  assert.match(prompt, /a117 \+ p1 \+ p2/);
});

test("buildSummaryPrompt for a Confluence page names the space", () => {
  const prompt = buildSummaryPrompt({
    kind: "jira",
    reason: "page",
    space: "Technology Division",
    title: "Biometric SDKs",
    author: "Igor",
    body: "Team members: @Xichu Zhang",
  });
  assert.match(prompt, /Confluence/);
  assert.match(prompt, /Technology Division/);
  assert.match(prompt, /Biometric SDKs/);
});

test("buildSummaryPrompt for a GitLab mention includes the note text", () => {
  const prompt = buildSummaryPrompt({
    kind: "gitlab-mention",
    title: "Add age model",
    project: "SDK / iface",
    author: "Bob",
    body: "@me please review the thresholds",
  });
  assert.match(prompt, /GitLab/);
  assert.match(prompt, /Add age model/);
  assert.match(prompt, /please review the thresholds/);
});

test("buildSummaryPrompt for a GitLab reply says it answers the reader's comment", () => {
  const prompt = buildSummaryPrompt({
    kind: "gitlab-mention",
    reason: "reply",
    title: "Fix crash",
    project: "SDK / iface",
    author: "Bob",
    body: "OK, but please add a test.",
  });
  assert.match(prompt, /reply to the reader's comment in a GitLab thread/);
  assert.match(prompt, /please add a test/);
});

test("buildSummaryPrompt rejects an unknown kind", () => {
  assert.throws(() => buildSummaryPrompt({ kind: "fax" }), /Unknown item kind/);
});

test("extractSummaryText joins the text blocks and skips other blocks", () => {
  const response = {
    stop_reason: "end_turn",
    content: [
      { type: "thinking", thinking: "" },
      { type: "text", text: "First part." },
      { type: "text", text: " Second part." },
    ],
  };
  assert.equal(extractSummaryText(response), "First part. Second part.");
});

test("extractSummaryText reports a refusal instead of returning empty text", () => {
  const response = { stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] };
  assert.throws(() => extractSummaryText(response), /declined/);
});

test("extractSummaryText reports a cut-off answer", () => {
  const response = { stop_reason: "max_tokens", content: [{ type: "text", text: "Half a sen" }] };
  assert.throws(() => extractSummaryText(response), /cut off/);
});
