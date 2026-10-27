import { NextResponse } from "next/server";
import { Resend } from "resend";

// This handler runs on the Node.js runtime and is always dynamic — it sends an
// email per request and must never be cached or statically evaluated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Where inquiries are delivered, and the address they're sent "from".
// Both are configurable via env so switching (e.g. creatives@ -> info@) or
// moving to a verified sending domain needs no code change.
const TO_EMAIL = process.env.CONTACT_TO_EMAIL || "creatives@kwetuconnectads.co.ke";
const FROM_EMAIL =
  process.env.CONTACT_FROM_EMAIL || "Kwetu Connect <no-reply@kwetuconnectads.co.ke>";

type ContactPayload = {
  fullName?: string;
  company?: string;
  phone?: string;
  email?: string;
  campaignBrief?: string;
  need?: string;
  botcheck?: string;
};

// Minimal email sanity check — the browser also validates, this guards the API.
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Escape user text before dropping it into the HTML email body.
const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function POST(request: Request) {
  let body: ContactPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request." },
      { status: 400 }
    );
  }

  // Honeypot: real users never see this field. If it's filled, silently accept
  // so the bot thinks it succeeded — but send nothing.
  if (body.botcheck) {
    return NextResponse.json({ success: true });
  }

  const fullName = (body.fullName || "").trim();
  const company = (body.company || "").trim();
  const phone = (body.phone || "").trim();
  const email = (body.email || "").trim();
  const campaignBrief = (body.campaignBrief || "").trim();
  const need = (body.need || "").trim() || "Not specified";

  if (!fullName || !company || !phone || !email || !campaignBrief) {
    return NextResponse.json(
      { success: false, message: "Please fill in all required fields." },
      { status: 400 }
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json(
      { success: false, message: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Misconfiguration, not a user error — log it and return a graceful message.
    console.error("RESEND_API_KEY is not set; cannot send contact email.");
    return NextResponse.json(
      {
        success: false,
        message:
          "The inquiry form isn't available right now. Please email info@kwetuconnectads.co.ke or call +254 729 911 021.",
      },
      { status: 503 }
    );
  }

  const resend = new Resend(apiKey);

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">New website inquiry</h2>
      <table cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr><td style="padding: 4px 16px 4px 0; color: #666;">Name</td><td style="padding: 4px 0;"><strong>${esc(fullName)}</strong></td></tr>
        <tr><td style="padding: 4px 16px 4px 0; color: #666;">Company</td><td style="padding: 4px 0;">${esc(company)}</td></tr>
        <tr><td style="padding: 4px 16px 4px 0; color: #666;">Phone</td><td style="padding: 4px 0;">${esc(phone)}</td></tr>
        <tr><td style="padding: 4px 16px 4px 0; color: #666;">Email</td><td style="padding: 4px 0;">${esc(email)}</td></tr>
        <tr><td style="padding: 4px 16px 4px 0; color: #666;">Needs</td><td style="padding: 4px 0;">${esc(need)}</td></tr>
      </table>
      <h3 style="margin: 20px 0 8px;">Campaign brief</h3>
      <p style="white-space: pre-wrap; margin: 0;">${esc(campaignBrief)}</p>
    </div>
  `;

  const text = [
    "New website inquiry",
    "",
    `Name: ${fullName}`,
    `Company: ${company}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `Needs: ${need}`,
    "",
    "Campaign brief:",
    campaignBrief,
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      replyTo: email,
      subject: `Website inquiry from ${fullName} (${company})`,
      html,
      text,
    });

    if (error) {
      console.error("Resend send error:", error);
      return NextResponse.json(
        {
          success: false,
          message:
            "Something went wrong sending your inquiry. Please try again, or email info@kwetuconnectads.co.ke.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error sending contact email:", err);
    return NextResponse.json(
      {
        success: false,
        message:
          "Something went wrong sending your inquiry. Please try again, or email info@kwetuconnectads.co.ke.",
      },
      { status: 500 }
    );
  }
}
