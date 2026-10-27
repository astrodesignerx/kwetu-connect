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
export async function requireStaff(): Promise<{ email: string }> {
  if (isMemoryMode()) {
    if ((await cookies()).get("kca_demo")?.value !== "1") redirect("/manage/sign-in");
    return { email: "demo@kca.local" };
  }
  const auth = await authClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user?.email || !(await getStore().isStaff(user.email))) redirect("/manage/sign-in");
  return { email: user.email };
}
