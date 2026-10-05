# GitLab MR Board

A Chrome extension that shows:

- **My MRs** – open merge requests you created or are assigned to.
- **To review** – open merge requests where you are a reviewer.
- **Mentions** – pending GitLab to-do items where someone wrote `@you`.

The icon badge shows how many mentions are waiting. It checks GitLab every 5 minutes.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. The options page: enter the GitLab URL and a personal access token, then click **Save and test**.
   Chrome asks to allow access to your GitLab site. Say yes.

Token scope: `read_api` is enough for the lists. Use `api` if you want the **Done** button
(marks a mention as done in GitLab).

The token is saved in `chrome.storage.local`, on this computer only, as plain text.

## Tests

```
npm test
```
