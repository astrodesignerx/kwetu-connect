import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { authClient } from "@/lib/auth/server";
import { AUTH_NEXT_COOKIE, safeCallbackNext, safeSignInNext } from "@/lib/auth/next";
import { getStore, isMemoryMode } from "@/lib/store";

// token_hash links (from the Magic Link email template) work in any browser or device.
// code links (PKCE) only work in the browser that asked for them; kept for older emails.
const EMAIL_TYPES: EmailOtpType[] = ["email", "magiclink", "recovery"];

function clearAuthNextCookie(jar: Awaited<ReturnType<typeof cookies>>) {
  jar.set(AUTH_NEXT_COOKIE, "", {
    path: "/manage",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function GET(request: NextRequest) {
  if (isMemoryMode()) return NextResponse.redirect(new URL("/manage/sign-in", request.url));
  const jar = await cookies();
  const cookieNext = jar.get(AUTH_NEXT_COOKIE)?.value;
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  if ((tokenHash && type && EMAIL_TYPES.includes(type)) || code) {
    const client = await authClient();
    const { error } =
      tokenHash && type
        ? await client.auth.verifyOtp({ token_hash: tokenHash, type })
        : await client.auth.exchangeCodeForSession(code!);
    const { data: { user } } = await client.auth.getUser();
    if (!error && user?.email && (await getStore().isStaff(user.email))) {
      clearAuthNextCookie(jar);
      const destination =
        type === "recovery"
          ? cookieNext?.startsWith("/manage/password")
            ? safeCallbackNext(cookieNext)
            : "/manage/password"
          : cookieNext
            ? safeCallbackNext(cookieNext)
            : safeSignInNext(params.get("next"));
      return NextResponse.redirect(new URL(destination, request.url));
    }
    await client.auth.signOut();
  }
  clearAuthNextCookie(jar);
  const wantsMail = cookieNext === "/mail" || cookieNext === "/manage/password?next=/mail" || params.get("next") === "/mail";
  return NextResponse.redirect(new URL(wantsMail ? "/manage/sign-in?error=link&next=/mail" : "/manage/sign-in?error=link", request.url));
}
