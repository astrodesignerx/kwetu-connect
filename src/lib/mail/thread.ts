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

const CSS = `body{margin:0;padding:18px 20px;font:15px/1.6 "DM Sans",-apple-system,"Segoe UI",Roboto,sans-serif;color:#2b2119;background:#fffdf9;word-wrap:break-word}
img{max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}table{max-width:100%}
blockquote{margin:8px 0;padding-left:12px;border-left:3px solid #e9c9a8;color:#7a695d}
details.ss-quoted{margin-top:12px}
details.ss-quoted>summary{display:inline-flex;align-items:center;cursor:pointer;list-style:none;padding:3px 11px;border-radius:999px;background:#f2e9de;color:#7a695d;font-size:12px;user-select:none}
details.ss-quoted>summary::-webkit-details-marker{display:none}
details.ss-quoted>summary:hover{background:#eadccb}
details.ss-quoted[open]>summary{margin-bottom:8px}
${FRAME_CSS}`;

/** The full document a message is shown in, with quoted history folded. */
export function messageDoc(opts: { html: string | null; text: string }): { doc: string; trimmed: boolean } {
  const raw = opts.html ?? `<pre style="font:inherit">${esc(opts.text)}</pre>`;
  const { html, trimmed } = trimQuoted(raw);
  return { doc: `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${CSS}</style></head><body>${html}</body></html>`, trimmed };
}
