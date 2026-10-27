import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/auth/server";
import { getStore, isMemoryMode } from "@/lib/store";
export async function GET(request: NextRequest) {
  if (isMemoryMode()) return NextResponse.redirect(new URL("/manage/sign-in", request.url));
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const client = await authClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    const { data: { user } } = await client.auth.getUser();
    if (!error && user?.email && await getStore().isStaff(user.email)) return NextResponse.redirect(new URL("/manage", request.url));
    await client.auth.signOut();
  }
  return NextResponse.redirect(new URL("/manage/sign-in?error=link", request.url));
}
