import { FRAME_CSS } from '@/lib/mail/frame';
// Adapted from the Mjengo suite (Sauti Salama).
/**
 * Reading a conversation. Two ideas from the mail clients that get this right (Gmail, Superhuman, Hey):
 * show each message once, and fold away the text that only repeats an earlier message. This turns the
 * quoted history inside a message into a single "Show quoted text" fold, so a long thread reads as a
 * sequence of new things people said, not the same paragraphs over and over.
 */

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

const QUOTE_SELECTORS = [
  '.gmail_quote',
  '.gmail_extra',
  '.yahoo_quoted',
  '.moz-cite-prefix',
  'blockquote[type="cite"]',
  '#divRplyFwdMsg',
  '#appendonsend',
  '.OutlookMessageHeader',
];

const WROTE = /^\s*(on|el|le|am)\s.{5,160}(wrote|escribió|a écrit|schrieb)\s*:?\s*$/i;

/** Returns the message with its quoted history folded, and whether anything was folded. */
export function trimQuoted(html: string): { html: string; trimmed: boolean } {
  if (typeof window === 'undefined' || !html) return { html, trimmed: false };
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;

  let start: Element | null = null;
  for (const sel of QUOTE_SELECTORS) {
    const el = body.querySelector(sel);
    if (el) { start = el; break; }
  }
  if (!start) {
    // A plain blockquote that comes after some new text is almost always the quote.
    const bq = body.querySelector('blockquote');
    if (bq && (body.textContent ?? '').replace(/\s+/g, '').length > (bq.textContent ?? '').replace(/\s+/g, '').length) start = bq;
  }
  if (!start) {
    // Outlook style: a horizontal rule followed by "From: ... Sent: ...".
    const hr = Array.from(body.querySelectorAll('hr')).find((h) => /^from:/i.test((h.nextElementSibling?.textContent ?? '').trim()));
    if (hr) start = hr;
  }
  if (!start) return { html, trimmed: false };

  // Take the "On Tuesday, Amina wrote:" line with it.
  let first: Element = start;
  const prev = start.previousElementSibling;
  if (prev && WROTE.test((prev.textContent ?? '').trim())) first = prev;

  // Everything from `first` to the end of its parent goes inside the fold.
  const holder = first.parentElement ?? body;
  const details = doc.createElement('details');
  details.className = 'ss-quoted';
  const summary = doc.createElement('summary');
  summary.textContent = 'Show earlier messages';
  details.appendChild(summary);
  const move: ChildNode[] = [];
  for (let n: ChildNode | null = first; n; n = n.nextSibling) move.push(n);
  holder.insertBefore(details, first);
  move.forEach((n) => details.appendChild(n));

  // Nothing new above the fold (a pure forward): leave the message as it was.
  const above = Array.from(body.childNodes).filter((n) => n !== details).map((n) => n.textContent ?? '').join('').replace(/\s+/g, '');
  if (!above && holder === body) return { html, trimmed: false };
  return { html: body.innerHTML, trimmed: true };
}

const REMOTE_SRC = /^\s*(?:https?:|\/\/)/i;

/**
 * While pictures are hidden, a remote picture would show as a broken-image icon. A described picture becomes a
 * quiet label with its description, and an undescribed one (usually a spacer or tracking pixel) is left out.
 * The content policy still blocks every remote request; this only changes what the reader sees.
 */
export function placeholdRemotePictures(html: string): string {
  if (typeof window === 'undefined' || !html || !/<img\b/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let changed = false;
  for (const img of Array.from(doc.body.querySelectorAll('img'))) {
    if (!REMOTE_SRC.test(img.getAttribute('src') ?? '')) continue;
    changed = true;
    const alt = (img.getAttribute('alt') ?? '').trim();
    if (!alt) { img.remove(); continue; }
    const label = doc.createElement('span');
    label.className = 'ss-pic';
    label.textContent = alt;
    img.replaceWith(label);
  }
  return changed ? doc.body.innerHTML : html;
}

/** The full document a message is shown in, with quoted history folded. */
export function hasRemoteContent(html: string) {
  return /(?:\b(?:src|background)\s*=\s*["']?\s*(?:https?:|\/\/)|\bsrcset\s*=\s*["'][^"']*(?:https?:|\/\/)|url\(\s*["']?\s*(?:https?:|\/\/)|<link\b[^>]*\brel\s*=\s*["']?stylesheet|@import\s)/i.test(html);
}
export function messageDoc(opts: { html: string | null; text: string; showPictures?: boolean; origin?: string }): { doc: string; trimmed: boolean } {
  const raw = opts.html ?? `<pre style="font:inherit">${esc(opts.text)}</pre>`;
  const { html: folded, trimmed } = trimQuoted(raw);
  const html = opts.showPictures ? folded : placeholdRemotePictures(folded);
  const origin = (opts.origin || (typeof location !== "undefined" ? location.origin : "https://kwetuconnectads.co.ke")).replace(/[^a-zA-Z0-9:./-]/g, "");
  const local = `data: blob: cid: ${origin}/mail/attachment`;
  const policy = opts.showPictures ? "" : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${local}; media-src ${local}; font-src ${local}; style-src 'unsafe-inline'; script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">`;
  return { doc: `<!doctype html><html><head><meta charset="utf-8">${policy}<meta name="referrer" content="no-referrer"><base target="_blank"><style>${FRAME_CSS}</style></head><body>${html}</body></html>`, trimmed };
}
