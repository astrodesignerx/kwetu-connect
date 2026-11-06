import { headers } from "next/headers";
import { Resend } from "resend";
import type { PublicBooking } from "@/lib/store/types";

const FROM = process.env.CONTACT_FROM_EMAIL || "Kwetu Connect <no-reply@kwetuconnectads.co.ke>";
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Use deployment configuration, never a request header, for links containing booking credentials. */
export async function siteOrigin() {
  if (process.env.VERCEL_ENV === "production") return "https://kwetuconnectads.co.ke";
  const host = process.env.VERCEL_URL;
  if (host && /^[a-z0-9-]+\.vercel\.app$/i.test(host)) return `https://${host}`;
  if (process.env.NODE_ENV !== "production") {
    const local = (await headers()).get("host") ?? "";
    if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(local)) return `http://${local}`;
  }
  const port = /^\d{1,5}$/.test(process.env.PORT ?? "") ? process.env.PORT : "3002";
  return process.env.NODE_ENV === "production" ? "https://kwetuconnectads.co.ke" : `http://localhost:${port}`;
}
export const bookingUrl = (origin: string, reference: string) => `${origin}/book/q/${reference}`;

function card(origin: string, b: PublicBooking) {
  return `<a href="${esc(bookingUrl(origin, b.reference))}" style="display:block;text-decoration:none;color:#141414;border:1px solid #e7e5e0;border-radius:14px;padding:16px 18px;margin:0 0 10px">
    <div style="font:700 10px Arial,sans-serif;letter-spacing:.14em;color:#9a650c">${esc(b.status.toUpperCase())}</div>
    <div style="font:900 26px Arial,sans-serif;margin:6px 0 2px">KES ${b.priceKes.toLocaleString("en-GB")}</div>
    <div style="font:13px Arial,sans-serif;color:#6b6b74">${b.plays.toLocaleString("en-GB")} plays, ${day(b.request.startDate)} to ${day(b.request.endDate)}</div>
    <div style="font:600 12px monospace;color:#6b6b74;margin-top:8px">${esc(b.reference)}</div>
    <div style="display:inline-block;margin-top:12px;padding:9px 14px;border-radius:10px;background:#edb347;font:800 13px Arial,sans-serif;color:#141414">Open your booking</div>
  </a>`;
}

/** Booking emails are a courtesy: a missing key or a send failure never blocks the booking. */
export async function sendBookingMail(kind: "saved" | "links", to: string, name: string, bookings: PublicBooking[], origin: string) {
  if (!to || bookings.length === 0) return;
  const subject = kind === "saved" ? `Your KCA booking ${bookings[0].reference}` : "Your KCA booking links";
  const intro = kind === "saved"
    ? "Your booking is saved. Keep this email: the button opens your booking any time, to pay, check progress or change the plan before you pay."
    : "Here are your recent open bookings. Each button opens the booking to pay, check progress or change the plan.";
  const html = `<div style="max-width:520px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;background:#f6f5f2">
    <p style="font:700 16px Arial,sans-serif;margin:0 0 6px">Hello ${esc(name || "there")},</p>
    <p style="font:14px/1.5 Arial,sans-serif;color:#3f3f46;margin:0 0 18px">${intro}</p>
    ${bookings.map((b) => card(origin, b)).join("")}
    <p style="font:12px/1.5 Arial,sans-serif;color:#6b6b74;margin:18px 0 0">Kwetu Connect Advertising. Reply on WhatsApp if anything looks wrong.</p>
  </div>`;
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.info(`Booking email skipped (no RESEND_API_KEY): ${kind} to ${to.replace(/^(.).*@/, "$1***@")}`); return; }
  try { const result = await new Resend(key).emails.send({ from: FROM, to, subject, html }); if (result.error) console.error("Booking email failed to send.", result.error.name); }
  catch { console.error("Booking email failed to send."); }
}
