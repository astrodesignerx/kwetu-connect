import { timingSafeEqual } from "node:crypto";
import { watchMail } from "@/lib/mail/watch";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response("Unauthorised", { status: 401 });
  try {
    return Response.json(await watchMail(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Mail checks could not finish. Check the app configuration and try again." }, { status: 503 });
  }
}
