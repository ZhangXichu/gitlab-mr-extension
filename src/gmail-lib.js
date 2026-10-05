// Pure Gmail helpers with no Chrome or network calls, so they can be tested in Node.
// The Gmail Atom feed lists unread inbox mail. The service worker has no DOMParser,
// so the feed is read with regular expressions. Its format is small and fixed.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const isHex = name[1] === "x" || name[1] === "X";
    const code = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10);
    return Number.isInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

// `name` is always a fixed tag name from this file, never outside input.
function readTag(xml, name) {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeEntities(match[1].trim()) : "";
}

function readHref(xml) {
  const match = xml.match(/<link\b[^>]*\bhref="([^"]*)"/);
  return match ? decodeEntities(match[1]) : "";
}

function toMailItem(entryXml) {
  const authorXml = readTag(entryXml, "author");
  return {
    id: readTag(entryXml, "id"),
    title: readTag(entryXml, "title") || "(no subject)",
    summary: readTag(entryXml, "summary"),
    url: readHref(entryXml),
    author: readTag(authorXml, "name") || readTag(authorXml, "email"),
    receivedAt: readTag(entryXml, "issued") || readTag(entryXml, "modified"),
  };
}

export function parseGmailFeed(xml) {
  if (!/<feed[\s>]/.test(xml ?? "")) {
    throw new Error("The answer is not a Gmail feed. You may need to log in to Gmail.");
  }
  const items = (xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []).map(toMailItem);
  const count = Number.parseInt(readTag(xml, "fullcount"), 10);
  return { unreadCount: Number.isInteger(count) ? count : items.length, items };
}

export function gmailFeedUrl(accountIndex) {
  return `https://mail.google.com/mail/u/${accountIndex}/feed/atom`;
}

export function gmailInboxUrl(accountIndex) {
  return `https://mail.google.com/mail/u/${accountIndex}/#inbox`;
}
