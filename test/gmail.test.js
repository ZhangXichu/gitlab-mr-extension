import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGmailFeed, gmailFeedUrl, gmailInboxUrl } from "../src/gmail-lib.js";

const FEED = `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#">
<title>Gmail - Inbox for me@acme.com</title>
<tagline>New messages in your Gmail Inbox</tagline>
<fullcount>27</fullcount>
<link rel="alternate" href="https://mail.google.com/mail" type="text/html" />
<modified>2026-10-05T10:00:00Z</modified>
<entry>
<title>Build &amp; release &lt;6.37&gt;</title>
<summary>Hi, the build &quot;nightly&quot; failed &#8211; see log</summary>
<link rel="alternate" href="https://mail.google.com/mail?account_id=me@acme.com&amp;message_id=18a&amp;view=conv&amp;extsrc=atom" type="text/html" />
<modified>2026-10-05T09:00:00Z</modified>
<issued>2026-10-05T09:00:00Z</issued>
<id>tag:gmail.google.com,2004:1779</id>
<author><name>Ana Novak</name><email>ana@acme.com</email></author>
</entry>
<entry>
<title></title>
<summary></summary>
<link rel="alternate" href="https://mail.google.com/mail?message_id=18b" type="text/html" />
<modified>2026-10-04T09:00:00Z</modified>
<id>tag:gmail.google.com,2004:1780</id>
<author><email>bot@acme.com</email></author>
</entry>
</feed>`;

test("parseGmailFeed reads the unread count and each unread message", () => {
  assert.deepEqual(parseGmailFeed(FEED), {
    unreadCount: 27,
    items: [
      {
        id: "tag:gmail.google.com,2004:1779",
        title: "Build & release <6.37>",
        summary: 'Hi, the build "nightly" failed – see log',
        url: "https://mail.google.com/mail?account_id=me@acme.com&message_id=18a&view=conv&extsrc=atom",
        author: "Ana Novak",
        receivedAt: "2026-10-05T09:00:00Z",
      },
      {
        id: "tag:gmail.google.com,2004:1780",
        title: "(no subject)",
        summary: "",
        url: "https://mail.google.com/mail?message_id=18b",
        author: "bot@acme.com",
        receivedAt: "2026-10-04T09:00:00Z",
      },
    ],
  });
});

test("parseGmailFeed handles an empty inbox", () => {
  const feed = '<?xml version="1.0"?><feed version="0.3"><fullcount>0</fullcount></feed>';
  assert.deepEqual(parseGmailFeed(feed), { unreadCount: 0, items: [] });
});

test("parseGmailFeed rejects text that is not a Gmail feed, such as a login page", () => {
  assert.throws(() => parseGmailFeed("<!doctype html><html><body>Sign in</body></html>"), /not a Gmail feed/);
  assert.throws(() => parseGmailFeed(""), /not a Gmail feed/);
});

test("gmailFeedUrl and gmailInboxUrl use the chosen Google account number", () => {
  assert.equal(gmailFeedUrl(0), "https://mail.google.com/mail/u/0/feed/atom");
  assert.equal(gmailFeedUrl(2), "https://mail.google.com/mail/u/2/feed/atom");
  assert.equal(gmailInboxUrl(1), "https://mail.google.com/mail/u/1/#inbox");
});
