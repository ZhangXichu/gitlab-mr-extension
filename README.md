# Work Board

A Chrome extension that shows, in one popup:

- **My MRs** – open GitLab merge requests you created or are assigned to.
- **To review** – open merge requests where you are a reviewer.
- **Mentions** – pending GitLab to-do items where someone wrote `@you`.
- **Jira** – Jira comments from the last 14 days where someone else @mentioned you, or replied after your
  latest comment on that issue. Once you answer, the reply drops off the list.
- **Mail** – your unread Gmail inbox.
- **Summarize** – a button on MRs and mentions that asks Claude for a two or three sentence summary.

Each part can be turned on or off in Options. It checks every 5 minutes.
The icon badge shows how many GitLab mentions are waiting, or a red `!` when something failed
(for example, your Jira or Google login ran out).

## How each part logs in

| Part | Login | What you do |
|---|---|---|
| GitLab | Personal access token | Paste a token in Options. |
| Jira | Your Jira login in this browser (a cookie) | Nothing, if you are logged in to Jira in Chrome. If not, the popup shows **Log in**; it opens Jira, where you sign in with Google as usual. |
| Gmail | Your Google login in this browser (a cookie) | Same as Jira. Pick the account number from the Gmail address bar (`/mail/u/0/`). |
| Claude | Anthropic API key | Paste a key from console.anthropic.com. A Google login cannot be used: the Claude API only accepts keys. |

Limits to know:

- Jira: only comments are searched, not issue descriptions. Replies are found on issues you watch;
  Jira makes you a watcher when you comment, unless you turned that off in your Jira settings. On an issue with more than 100 comments,
  only the newest 100 are checked.
- Gmail uses Gmail's unread-mail feed. It shows at most about 20 unread messages and only a short preview of each.
  Google does not document this feed and could remove it.
- Summarize sends that one item's text to the Claude API (`claude-opus-5-5`, low effort). It runs only when you click,
  and the cost goes to your API key.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Open Options, fill in the parts you want, and click **Save and test**.
   Chrome asks to allow access to each site. Say yes.

GitLab token scope: `read_api` is enough for the lists. Use `api` if you want the **Done** button
(marks a mention as done in GitLab).

The GitLab token and the Anthropic API key are saved in `chrome.storage.local`, on this computer only, as plain text.

## Development

```
npm install
npm test          # unit tests
npm run vendor    # rebuild src/vendor/anthropic-sdk.js after changing the SDK version
```

`src/vendor/anthropic-sdk.js` is the Anthropic SDK bundled into one file and checked in,
so the extension loads without a build step.
