import { requireStaff } from "@/lib/auth/server";
import { MailError, MAX_ATTACHMENT_BYTES } from "@/lib/mail/client";
import { saveUpload } from "@/lib/mail/drafts";

export async function POST(request: Request) {
  const staff = await requireStaff("/mail");
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_ATTACHMENT_BYTES + 32_768) return new Response("Each attachment can be up to 4 MB.", { status: 413 });
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) return new Response("Choose a file.", { status: 400 });
    const saved = await saveUpload(staff.email, String(data.get("draftId") ?? ""), file);
    return Response.json(saved, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return new Response(e instanceof MailError ? e.message : "The attachment could not be uploaded. Try again.", { status: 400 });
  }
}
