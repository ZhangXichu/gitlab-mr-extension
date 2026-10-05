# Work Board

A Chrome extension that shows, in one popup:

- **My MRs** – open GitLab merge requests you created or are assigned to.
- **To review** – open merge requests where you are a reviewer.
- **Mentions** – pending GitLab to-do items where someone wrote `@you`, plus replies to you: comments by
  others in a GitLab thread you wrote in, posted after your latest comment there (last 14 days, open
  threads only). A reply drops off once you answer in the thread.
- **Jira** – from the last 14 days: Jira comments where someone else @mentioned you or replied after your
  latest comment on that issue (once you answer, the reply drops off the list), new Jira issues whose
  description mentions you, and Confluence pages and page comments that mention you.
- **Mail** – your unread Gmail inbox.
- **Chat** – unread emails from Google Chat about mentions and direct messages you have not read.
- **Summarize** – a button on MRs and mentions that asks Claude for a two or three sentence summary.

Each part can be turned on or off in Options. It checks every 5 minutes.
The icon badge shows how many GitLab mentions and replies are waiting, or a red `!` when something failed
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
- GitLab replies: found on the 20 merge requests and issues you commented on most recently. A plain
  top-level comment that answers you without replying in your thread is not a reply, unless it @mentions you.
- Jira descriptions: an issue counts only if it was created in the last 14 days. A mention added later
  by editing an older issue is not found.
- Confluence: the list shows the text around the mention and who last edited the page.
- Google Chat has no feed the extension can read with your login, so the Chat tab uses Chat's notification
  emails instead. Turn them on in Google Chat under Settings → Email notifications. Google sends them
  only after a delay and only for messages you have not seen, and they count only while unread in your inbox.
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
