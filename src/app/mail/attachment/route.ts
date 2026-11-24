import type { NextRequest } from "next/server";
import { simpleParser } from "mailparser";
import { requireStaff } from "@/lib/auth/server";
import { loadAccount } from "@/lib/mail/accounts";
import { demoAttachment, isDemoAccount } from "@/lib/mail/demo";
import { fetchSource } from "@/lib/mail/client";

export const maxDuration = 60;

/** Downloads one attachment of one message from a mailbox the signed-in staff member connected. */
export async function GET(request: NextRequest) {
  const staff = await requireStaff("/mail");
  const params = request.nextUrl.searchParams;
  const account = params.get("account") ?? "";
  const mailbox = params.get("mailbox") ?? "";
  const uid = Number(params.get("uid"));
  const index = Number(params.get("i"));
  if (!account || !mailbox || mailbox.length > 200 || !Number.isInteger(uid) || uid < 1 || !Number.isInteger(index) || index < 0) return new Response("Bad request", { status: 400 });
  try {
    const loaded = await loadAccount(staff.email, account);
    const file = isDemoAccount(loaded) ? demoAttachment(loaded, mailbox, uid, index) : (await simpleParser(await fetchSource(loaded, mailbox, uid))).attachments?.[index];
    if (!file) return new Response("Not found", { status: 404 });
    const name = encodeURIComponent(file.filename ?? `attachment-${index + 1}`);
    // Pictures and PDFs open in place when asked; anything else, and anything risky, downloads.
    const type = (file.contentType || "application/octet-stream").toLowerCase().split(";")[0].trim();
    const inline = params.get("inline") === "1" && /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/plain)$/.test(type);
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": inline ? type : "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("The attachment could not be fetched. Try again.", { status: 502 });
  }
}
