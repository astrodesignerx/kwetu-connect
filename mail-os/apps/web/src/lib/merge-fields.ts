/**
 * Personalised fields — the user-facing half of the `{{variable}}` language.
 *
 * The stored format is unchanged: templates are HTML containing `{{client_name}}`,
 * and `TemplateRenderer` on the server substitutes them at send time. What changes
 * here is that nobody has to type that. The editor shows a named chip ("Client's
 * name") and this module converts between the two representations:
 *
 *     stored     <p>Hi {{client_name}},</p>
 *     editing    <p>Hi <span class="mf-chip" …>Client's name</span>,</p>
 *
 * `toChips` runs when a body is loaded into the editor, `fromChips` when it comes
 * back out. Anything that is not a recognised placeholder survives both directions
 * untouched, so a hand-written `{{whatever}}` still works — it just shows as its
 * own name rather than a friendly label.
 *
 * The token names are not arbitrary: they are chosen so the server's preview values
 * (see TemplateSampleValues.cs) resolve to something plausible. `client_company`
 * has to contain "company" to preview as a company, `click_rate` has to contain
 * "_rate" to preview as a percentage. Renaming a token here without checking that
 * file gives a preview full of humanised identifiers.
 */

export type MergeField = {
  /** The placeholder name, without braces. */
  token: string;
  /** What the person writing the email sees. */
  label: string;
  /** What it will look like in a real send — shown in the picker as a hint. */
  example: string;
};

export type MergeFieldGroup = {
  title: string;
  fields: MergeField[];
};

export const MERGE_FIELD_GROUPS: MergeFieldGroup[] = [
  {
    title: "The client",
    fields: [
      { token: "client_name", label: "Client's name", example: "Jane Wanjiru" },
      { token: "client_company", label: "Client's company", example: "Riverdale Developments" },
      { token: "client_email", label: "Client's email", example: "jane.wanjiru@example.co.ke" },
      { token: "client_phone", label: "Client's phone", example: "+254 712 345 678" },
    ],
  },
  {
    title: "The work",
    fields: [
      { token: "project_name", label: "Project or campaign", example: "Riverdale Apartments launch" },
      { token: "campaign_period", label: "Campaign dates", example: "1–31 July 2026" },
      { token: "budget_amount", label: "Budget or price", example: "KES 48,500" },
      { token: "invoice_number", label: "Invoice number", example: "KCA-2043" },
    ],
  },
  {
    title: "Kwetu campaign details",
    fields: [
      { token: "company_name", label: "Client's company", example: "North Rift Foods" },
      { token: "campaign_name", label: "Campaign name", example: "Made for our city" },
      { token: "site_photo_url", label: "Public site photograph URL", example: "https://example.com/site.jpg" },
      { token: "booking_reference", label: "Booking reference", example: "DEMO-0124" },
      { token: "start_date", label: "Campaign start date", example: "2 November 2026" },
      { token: "end_date", label: "Campaign end date", example: "29 November 2026" },
      { token: "campaign_duration", label: "Creative duration", example: "20 seconds" },
      { token: "appearances", label: "Agreed appearances", example: "As agreed in your booking" },
      { token: "artwork_deadline", label: "Artwork deadline", example: "26 October 2026" },
      { token: "review_version", label: "Creative version", example: "Version 03" },
      { token: "review_deadline", label: "Approval deadline", example: "26 October 2026" },
      { token: "renewal_deadline", label: "Renewal discussion date", example: "23 November 2026" },
    ],
  },
  {
    title: "Recorded delivery and service",
    fields: [
      { token: "report_period", label: "Report period", example: "2 to 8 November 2026" },
      { token: "verified_plays", label: "Recorded verified showings", example: "1,248" },
      { token: "scheduled_plays", label: "Scheduled showings", example: "1,260" },
      { token: "unavailable_plays", label: "Unavailable showings", example: "12" },
      { token: "proof_reference", label: "Evidence reference", example: "DEMO-LOG-01" },
      { token: "evidence_date", label: "Evidence date", example: "8 November 2026" },
      { token: "service_status", label: "Service status", example: "Awaiting revised schedule" },
      { token: "effective_date", label: "Effective date", example: "9 November 2026" },
      { token: "service_reason", label: "Reason for update", example: "Schedule change under review" },
      { token: "next_update", label: "Next update due", example: "10 November 2026 at 10:00 EAT" },
    ],
  },
  {
    title: "Campaign links",
    fields: [
      { token: "brief_link", label: "Brief link", example: "https://example.com/brief" },
      { token: "booking_link", label: "Booking details link", example: "https://example.com/booking" },
      { token: "review_link", label: "Creative review link", example: "https://example.com/review" },
      { token: "specifications_link", label: "Artwork specifications link", example: "https://example.com/specifications" },
      { token: "launch_evidence_link", label: "Launch evidence link", example: "https://example.com/evidence" },
      { token: "report_link", label: "Report link", example: "https://example.com/report" },
      { token: "invoice_link", label: "Invoice link", example: "https://example.com/invoice" },
      { token: "renewal_link", label: "Renewal discussion link", example: "https://example.com/renewal" },
      { token: "options_link", label: "Available options link", example: "https://example.com/options" },
    ],
  },
  {
    title: "Results",
    fields: [
      { token: "impressions", label: "Impressions", example: "1,284,930" },
      { token: "clicks", label: "Clicks", example: "38,240" },
      { token: "click_rate", label: "Click rate", example: "2.98%" },
      { token: "leads", label: "Leads", example: "1,412" },
    ],
  },
  {
    title: "Dates and sign-off",
    fields: [
      { token: "today_date", label: "Today's date", example: "10 Aug 2026" },
      { token: "due_date", label: "Due date (in a week)", example: "17 Aug 2026" },
      { token: "sender_name", label: "Your name", example: "Amina Otieno" },
      { token: "website_url", label: "Our website", example: "https://kwetuconnectads.co.ke" },
    ],
  },
];

const BY_TOKEN = new Map(
  MERGE_FIELD_GROUPS.flatMap((g) => g.fields).map((f) => [f.token, f])
);

export function exampleFor(token: string): string {
  return BY_TOKEN.get(token)?.example ?? "";
}

/**
 * Same shape the server matches on, so what the editor treats as a field and what
 * gets substituted at send time cannot disagree.
 */
const TOKEN_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** A readable name for any token, including ones not in the catalogue. */
export function labelFor(token: string): string {
  const known = BY_TOKEN.get(token);
  if (known) return known.label;
  const words = token.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : token;
}

/**
 * The chip as it exists inside the editor.
 *
 * `contenteditable="false"` is what makes it behave like one object: the caret
 * steps over it and Backspace removes the whole field rather than eating
 * "Client's nam". The token lives in a data attribute because the visible text is
 * the label, and the label is not what gets saved.
 */
export function chipHtml(token: string): string {
  return (
    `<span class="mf-chip" contenteditable="false" data-mf="${escapeAttr(token)}">` +
    `${escapeText(labelFor(token))}</span>`
  );
}

/** Stored HTML → editor HTML. Placeholders become chips. */
export function toChips(html: string): string {
  // Attribute values remain template source. Chips are only valid in visible text.
  const parts = html.split(/(<!--[\s\S]*?-->|<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>|<(?:"[^"]*"|'[^']*'|[^'">])*>)/gi);
  return parts.map((part, index) => index % 2 ? part
    : part.replace(TOKEN_PATTERN, (_, token: string) => chipHtml(token))).join("");
}

/**
 * Editor HTML → stored HTML. Chips become placeholders again.
 *
 * Parsed rather than regexed: `execCommand` freely rewrites the markup around a
 * selection, so by the time a chip comes back the attribute order may have changed
 * and the browser may have wrapped it in styling of its own. Matching on the DOM
 * means only `data-mf` has to survive, which it does.
 */
export function fromChips(html: string): string {
  if (typeof document === "undefined" || !html.includes("data-mf")) return html;
  const holder = document.createElement("div");
  holder.innerHTML = html;
  for (const el of Array.from(holder.querySelectorAll<HTMLElement>("[data-mf]"))) {
    const token = el.dataset.mf ?? "";
    el.replaceWith(
      document.createTextNode(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token) ? `{{${token}}}` : el.textContent ?? "")
    );
  }
  return holder.innerHTML;
}

/**
 * Every placeholder used across the given strings, in first-seen order.
 *
 * This is why the template editor no longer asks anyone to keep a list of
 * variables in sync with the body — the body is the list. A name that was typed
 * and then deleted stops being declared automatically, which the hand-maintained
 * field never managed.
 */
export function variablesIn(...sources: (string | null | undefined)[]): string[] {
  const found: string[] = [];
  for (const source of sources) {
    if (!source) continue;
    for (const match of source.matchAll(TOKEN_PATTERN)) {
      const token = match[1];
      if (!found.includes(token)) found.push(token);
    }
  }
  return found;
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
}
