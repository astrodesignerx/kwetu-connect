/**
 * Allowlist sanitizer for HTML that is about to become *live DOM in the app origin*.
 *
 * The reader and the preview panes render other people's HTML inside `sandbox=""`
 * iframes, where it cannot touch our origin. The rich-text editor is different: it
 * writes stored HTML (template bodies, brand-kit fragments) straight into a
 * `contenteditable` in the app's own document, and templates/brand kit are writable
 * by every member of the org. Stored HTML is therefore not automatically trusted —
 * an `<img src=x onerror=…>` in a template body would run with the JWT that sits in
 * this origin's storage.
 *
 * So: parse with `DOMParser` (inert — nothing loads or executes while parsing), keep
 * only an allowlist of formatting tags, drop every `on*` handler and any URL that is
 * not http(s)/mailto/tel/cid (plus inline image data), and unwrap unknown tags so
 * their text survives.
 *
 * This is not the send-path boundary — the server re-renders every body through the
 * template renderer — it is the boundary between "stored data" and "the app origin".
 */

/** Formatting vocabulary the editor and the email templates actually use. */
const ALLOWED_TAGS = new Set([
  "a", "b", "blockquote", "br", "center", "code", "div", "em", "font",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre",
  "s", "span", "strike", "strong", "sub", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);

/**
 * Elements removed with their contents: script-ish, document furniture, and foreign
 * content (`svg`/`math`) whose children are not HTML and cannot be validated by an
 * HTML allowlist.
 */
const DROP_ENTIRELY = new Set([
  "applet", "base", "button", "embed", "form", "frame", "frameset", "head", "html",
  "iframe", "input", "link", "math", "meta", "noscript", "object", "option", "script",
  "select", "style", "svg", "template", "textarea", "title",
]);

/** Attributes allowed on any surviving element. */
const GLOBAL_ATTRS = new Set([
  "align", "class", "dir", "height", "lang", "style", "title", "valign", "width",
]);

/** Extra attributes, per tag. Anything not listed here (including every `on*`) is dropped. */
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "rel", "target"]),
  img: new Set(["alt", "height", "src", "width"]),
  span: new Set(["contenteditable", "data-mf"]),
  font: new Set(["color", "face", "size"]),
  table: new Set(["bgcolor", "border", "cellpadding", "cellspacing"]),
  td: new Set(["bgcolor", "colspan", "rowspan"]),
  th: new Set(["bgcolor", "colspan", "rowspan"]),
  tr: new Set(["bgcolor"]),
};

const URL_ATTRS = new Set(["href", "src"]);

const SAFE_SCHEMES = /^(?:https?|mailto|tel|cid):/;
const INLINE_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);base64,/;

/**
 * True when a URL may be kept.
 *
 * Browsers ignore control characters and whitespace inside a scheme, so the check
 * runs on a copy with them stripped: `java\tscript:alert(1)` has to be judged the
 * same as `javascript:alert(1)`. Relative URLs and fragments are fine.
 */
function isSafeUrl(raw: string, isImage: boolean): boolean {
  const probe = raw.replace(/[\u0000-\u0020\u00a0\u2028\u2029]+/g, "").toLowerCase();
  if (!probe) return false;
  if (probe.startsWith("javascript:") || probe.startsWith("vbscript:") || probe.startsWith("file:")) {
    return false;
  }
  if (probe.startsWith("data:")) return isImage && INLINE_IMAGE.test(probe);
  if (/^[a-z][a-z0-9+.-]*:/.test(probe)) return SAFE_SCHEMES.test(probe);
  return true;
}

/** Inline styles are kept (the editor emits them) minus the executable corners. */
function isSafeStyle(value: string): boolean {
  const probe = value.toLowerCase();
  return !(
    probe.includes("expression(") ||
    probe.includes("@import") ||
    probe.includes("javascript:") ||
    probe.includes("vbscript:")
  );
}

function allowedAttributes(tag: string, name: string): boolean {
  return GLOBAL_ATTRS.has(name) || (TAG_ATTRS[tag]?.has(name) ?? false);
}

/** Depth-first: sanitize children, then keep, unwrap or drop the element itself. */
function sanitizeChildren(parent: Element): void {
  for (const node of Array.from(parent.childNodes)) {
    // Comments survive parsing and can hide markup from a reviewer; drop them.
    if (node.nodeType === 8) {
      node.remove();
      continue;
    }
    if (node.nodeType !== 1) continue;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (DROP_ENTIRELY.has(tag)) {
      el.remove();
      continue;
    }

    sanitizeChildren(el);

    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown-but-harmless wrapper (a `<section>`, a stray `<o:p>`): keep the text,
      // throw away the element and its attributes.
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      el.remove();
      continue;
    }

    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!allowedAttributes(tag, name)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.has(name) && !isSafeUrl(attr.value, tag === "img" && name === "src")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === "style" && !isSafeStyle(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }

    // A surviving link must not be able to reach back into our window.
    if (tag === "a") {
      if (el.getAttribute("target") !== "_blank") el.removeAttribute("target");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  }
}

/**
 * Sanitizes an HTML fragment. Runs in the browser only; during SSR (where there is
 * no DOM to become live) the input is returned untouched.
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof document === "undefined" || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeChildren(doc.body);
  return doc.body.innerHTML;
}
