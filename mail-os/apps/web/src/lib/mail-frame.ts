/**
 * Rendering HTML mail safely.
 *
 * Two callers need this: the reader, which frames every received message, and the
 * composer, which frames the live preview and the quoted history. They used to be one
 * copy in the reader — the composer then grew its own iframe with none of the
 * protections, so a tracking pixel blocked while reading fired the moment you hit
 * reply. Shared here so there is one answer to "how do we render someone else's HTML".
 */

/**
 * Styling injected into every HTML message frame.
 *
 * Email HTML is authored on the assumption of a light background — senders set dark
 * text and frequently no background at all. Rendering that on a transparent frame
 * over the dark theme made a plain fragment invisible: dark text on a dark card, a
 * message that looked empty. Meanwhile a brand-wrapped mail carrying its own
 * background rendered cream, so two messages in one thread looked like different
 * products.
 *
 * So HTML mail gets a fixed white sheet in both themes, the way every desktop mail
 * client does. The sender's own background still wins where they set one, which is
 * correct — that is their design — but the default is now legible rather than
 * invisible.
 */
export const BODY_STYLE =
  "<style>html{background:#ffffff}" +
  "body{font:14px/1.6 -apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,sans-serif;" +
  "margin:0;padding:16px;color:#171717;background:#ffffff}" +
  "a{color:#B8791F}blockquote{border-left:3px solid #FBB040;padding-left:12px;color:#171717cc;margin-left:0}" +
  "img{max-width:100%;height:auto}" +
  // The frame is its own document, so the app's rules don't reach it — including
  // the one that hides scrollbars. A message taller than the frame is reached with
  // the wheel, or by the reader's own "Expand message" control.
  "*{scrollbar-width:none;-ms-overflow-style:none}" +
  "::-webkit-scrollbar{display:none}</style>";

// Blocks every remote subresource. Marketing mail embeds 1x1 tracking pixels that
// report back the moment a message is opened; without this the act of reading an
// email silently tells the sender who read it and when. The reader opts in per
// message. `sandbox=""` already denies scripts — this is about network calls.
export const BLOCK_REMOTE =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
  `img-src data:; style-src 'unsafe-inline'; font-src data:">`;

/**
 * Builds the frame document.
 *
 * Our meta and style cannot simply be prepended: roughly half of these bodies are
 * complete documents beginning with a doctype, and a doctype that appears after
 * other content is a parse error the browser discards, dropping the document into
 * quirks mode. When there is a head, we inject into it; otherwise the body is a
 * fragment and prepending is right.
 */
export function frameDocument(html: string, blockRemote: boolean): string {
  const injected = (blockRemote ? BLOCK_REMOTE : "") + BODY_STYLE;
  const headOpen = html.match(/<head[^>]*>/i);

  if (headOpen) {
    const at = headOpen.index! + headOpen[0].length;
    return html.slice(0, at) + injected + html.slice(at);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${injected}</head>`);
  }
  return injected + html;
}

/* -- Quoting ------------------------------------------------------------------
   Turning a received message into the quoted history of a reply.

   The naive version — prefix every line of the stored body with "> " — is what a
   plain-text client does, and it is what this app used to do. On HTML mail it
   produced the wall of `<!doctype html><head><style>…` the compose window opened
   with: the reader's own body tag, its `<style>` block and its brand footer, all
   escaped into the field the user was supposed to type in.

   So: reduce each message to the *fragment* inside its body, drop the document
   furniture, and nest it in a blockquote the way every graphical mail client does.
   ----------------------------------------------------------------------------- */

/** Elements whose content is markup, chrome, or executable — never quotable prose. */
const DROP_ELEMENTS = /<(script|style|head|title|meta|link|iframe|object|embed|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DROP_VOID = /<(meta|link|base)\b[^>]*>/gi;
const EVENT_ATTRS = /\s on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /\s(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi;

/**
 * Reduces an HTML mail body to a quotable fragment: the contents of `<body>` with
 * the document furniture, scripts and inline event handlers removed.
 *
 * Best-effort by design. It is not a security boundary — the preview frame is
 * `sandbox=""` and the server re-renders on send — but a reply should not carry a
 * stranger's `onerror=` back out over our own domain either, so the obvious vectors
 * go here rather than nowhere.
 */
export function bodyFragment(html: string): string {
  let out = html;
  const body = out.match(/<body[^>]*>([\s\S]*?)<\/body\s*>/i);
  if (body) out = body[1];
  out = out.replace(DROP_ELEMENTS, "").replace(DROP_VOID, "");
  out = out.replace(EVENT_ATTRS, "").replace(JS_URLS, "");
  // A body that was nothing but a style block and a wrapper leaves whitespace behind.
  return out.trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text to paragraphs: blank lines split, single newlines become breaks. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Rough plain-text rendering of an HTML body — used for the draft snippet in the
 * drafts list and as the text/plain fallback. The server does the authoritative
 * version on send; this one only has to read well in a 120-character preview.
 */
export function htmlToText(html: string): string {
  return html
    .replace(DROP_ELEMENTS, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when a body has no prose in it — only tags, entities or whitespace. */
export function isBlankHtml(html: string): boolean {
  return htmlToText(html).length === 0 && !/<(img|hr|table)\b/i.test(html);
}
