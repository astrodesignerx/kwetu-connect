import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/auth/server";
import { getStore, isMemoryMode } from "@/lib/store";
// token_hash links (from the Magic Link email template) work in any browser or device.
// code links (PKCE) only work in the browser that asked for them; kept for older emails.
const EMAIL_TYPES: EmailOtpType[] = ["email", "magiclink"];
export async function GET(request: NextRequest) {
  if (isMemoryMode()) return NextResponse.redirect(new URL("/manage/sign-in", request.url));
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  if ((tokenHash && type && EMAIL_TYPES.includes(type)) || code) {
    const client = await authClient();
    const { error } = tokenHash && type ? await client.auth.verifyOtp({ token_hash: tokenHash, type }) : await client.auth.exchangeCodeForSession(code!);
    const { data: { user } } = await client.auth.getUser();
    if (!error && user?.email && await getStore().isStaff(user.email)) return NextResponse.redirect(new URL("/manage", request.url));
    await client.auth.signOut();
  }
  return NextResponse.redirect(new URL("/manage/sign-in?error=link", request.url));
}
