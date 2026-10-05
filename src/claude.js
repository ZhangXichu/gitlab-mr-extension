import Anthropic from "./vendor/anthropic-sdk.js";
import { SUMMARY_SYSTEM_PROMPT, buildSummaryPrompt, extractSummaryText } from "./summary-lib.js";

const MODEL = "claude-opus-5-5";
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;

function describeApiError(error) {
  if (error instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key. Check it in Options.";
  if (error instanceof Anthropic.PermissionDeniedError) return "This API key is not allowed to use Claude.";
  if (error instanceof Anthropic.RateLimitError) return "Too many requests to Claude. Try again in a minute.";
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the Claude API.";
  if (error instanceof Anthropic.APIError) return `Claude API error ${error.status}: ${error.message}`;
  return error.message;
}

function makeClient(apiKey) {
  // The key lives in this browser only. The SDK calls this "dangerous" because page code can read the key.
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });
}

// Looks up the model with the key. This uses no tokens, so it costs nothing.
export async function checkApiKey(apiKey) {
  try {
    await makeClient(apiKey).models.retrieve(MODEL);
  } catch (error) {
    throw new Error(describeApiError(error));
  }
}

// `item` is one popup item plus a `kind` ("mr", "gitlab-mention" or "jira").
export async function summarize(apiKey, item) {
  const client = makeClient(apiKey);
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      // If Claude declines on safety grounds, the API retries on a fallback model it picks.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildSummaryPrompt(item) }],
    });
  } catch (error) {
    throw new Error(describeApiError(error));
  }
  return extractSummaryText(response);
}
