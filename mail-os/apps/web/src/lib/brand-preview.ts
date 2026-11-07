/**
 * A local copy of the email wrapper, for previewing brand kit edits before saving.
 *
 * The server has the real one in `TemplateRenderer.WrapInKit`, and the template
 * preview endpoint uses it — but only ever with the *saved* kit. Previewing brand
 * kit changes through the server would mean saving first to see what saving does,
 * which is the wrong way round for a screen whose whole job is choosing colours.
 *
 * So this mirrors WrapInKit exactly. If that method changes, this has to change
 * with it; the preview quietly drifting is the failure mode to watch for. It is a
 * dozen lines of string building, which is a cheaper thing to keep in step than a
 * round trip is to work around.
 */

import type { BrandKitUpsertRequest } from "@kompanion/types";

/** Same fallbacks as the server, so an untouched kit previews as it will send. */
const DEFAULT_BACKGROUND = "#FEFBD2";
const DEFAULT_TEXT = "#171717";
const DEFAULT_ACCENT = "#FBB040";

/**
 * A short, realistic email to show the wrapper around. Deliberately ordinary
 * agency copy — the point is judging the frame, so the contents should not be
 * competing for attention.
 */
const SAMPLE_BODY = `<p>Hi Jane,</p>
<p>Here's where the <strong>Riverdale Apartments launch</strong> stands this week. The
creative is approved and the first flight goes live on Monday.</p>
<p>Anything you'd like changed before then, just say — otherwise we'll proceed as
planned. Full numbers are on the <a href="https://example.com">shared dashboard</a>.</p>
<p>Thanks,<br>Amina</p>`;

export function renderBrandPreview(kit: BrandKitUpsertRequest): string {
  const bg = kit.backgroundColor || DEFAULT_BACKGROUND;
  const text = kit.textColor || DEFAULT_TEXT;
  const accent = kit.accentColor || DEFAULT_ACCENT;

  const parts = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>body{margin:0;padding:24px;background:${bg};color:${text};` +
      "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,Segoe UI,sans-serif;" +
      `line-height:1.5;}a{color:${accent};text-decoration:none;font-weight:600;}</style>`,
    "</head><body>",
    kit.headerHtml?.trim() ? kit.headerHtml : "",
    '<div style="max-width:640px;margin:0 auto;">',
    SAMPLE_BODY,
    kit.signatureHtml?.trim()
      ? `<hr style="border:0;border-top:1px solid ${text}22;margin:24px 0;">${kit.signatureHtml}`
      : "",
    kit.footerHtml?.trim() ? kit.footerHtml : "",
    "</div></body></html>",
  ];
  return parts.join("");
}

/**
 * The header bar the "Add a header bar" button drops in.
 *
 * Written as inline styles because it ends up inside an email, where a stylesheet
 * is not reliably honoured. Kept here rather than in the page so the preview and
 * the inserted markup cannot disagree about what a header looks like.
 */
export function headerBarHtml({
  background,
  logoUrl,
  name,
}: {
  background: string;
  logoUrl?: string | null;
  name?: string | null;
}): string {
  const inner = logoUrl
    ? `<img src="${escapeAttr(logoUrl)}" alt="${escapeAttr(name || "Logo")}" ` +
      'style="height:36px;width:auto;display:inline-block;border:0;">'
    : `<span style="font-size:18px;font-weight:700;">${escapeText(name || "Your business")}</span>`;
  // No negative margins to bleed to the edge: this markup is also what the editor
  // surface renders while it is being written, and a block that hangs outside its
  // container looks broken there even though it would be correct in the send.
  return (
    `<div style="background:${escapeAttr(background)};padding:20px 24px;text-align:center;` +
    `border-radius:10px;margin:0 0 24px;">${inner}</div>`
  );
}

function escapeAttr(value: string): string {
  return value.replace(/["'<>&]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function escapeText(value: string): string {
  return value.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`);
}
