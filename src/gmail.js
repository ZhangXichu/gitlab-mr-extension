import { parseGmailFeed, gmailFeedUrl, gmailInboxUrl } from "./gmail-lib.js";
import { LoginNeededError } from "./errors.js";

const REQUEST_TIMEOUT_MS = 15000;
const LOGIN_HOST = "accounts.google.com";

// No token: the request carries the browser's Google login cookie.
export async function fetchGmail(gmailConfig) {
  const { accountIndex } = gmailConfig;
  const loginUrl = gmailInboxUrl(accountIndex);
  const response = await fetch(gmailFeedUrl(accountIndex), {
    credentials: "include",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || new URL(response.url).host === LOGIN_HOST) {
    throw new LoginNeededError("Not logged in to Gmail. Log in, then refresh.", loginUrl);
  }
  if (!response.ok) {
    throw new Error(`Gmail returned ${response.status}`);
  }

  let feed;
  try {
    feed = parseGmailFeed(await response.text());
  } catch (error) {
    // Google sometimes answers with a login page instead of a 401.
    throw new LoginNeededError(error.message, loginUrl);
  }
  return { ...feed, inboxUrl: loginUrl, fetchedAt: new Date().toISOString() };
}
