import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore, isMemoryMode } from "@/lib/store";

export async function authClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => { try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Proxy refreshes cookies before Server Components render. */ } },
    },
  });
}
/** The signed-in staff email, or null. Never redirects, so a sign-in page can send a signed-in person on. */
export async function signedInStaff(): Promise<string | null> {
  if (isMemoryMode()) return null;
  try {
    const { data: { user } } = await (await authClient()).auth.getUser();
    return user?.email && (await getStore().isStaff(user.email)) ? user.email : null;
  } catch {
    return null;
  }
}
export async function requireStaff(returnTo: "/manage" | "/mail" = "/manage"): Promise<{ email: string }> {
  const signIn = returnTo === "/mail" ? "/mail/sign-in" : "/manage/sign-in";
  if (isMemoryMode()) {
    if (returnTo === "/mail" && process.env.NODE_ENV === "development") return { email: "demo@kca.local" };
    if ((await cookies()).get("kca_demo")?.value !== "1") redirect(signIn);
    return { email: "demo@kca.local" };
  }
  const auth = await authClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user?.email || !(await getStore().isStaff(user.email))) redirect(signIn);
  return { email: user.email };
}
