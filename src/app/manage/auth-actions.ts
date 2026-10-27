"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/auth/server";
import { getStore, isMemoryMode } from "@/lib/store";
import { StoreError, text } from "@/lib/store/validation";

export async function signIn(_state: { message: string }, form: FormData) {
  if (isMemoryMode()) {
    (await cookies()).set("kca_demo", "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/manage", maxAge: 43200 });
    redirect("/manage");
  }
  const message = "If this email belongs to KCA staff, a sign-in link is on its way.";
  try {
    const email = text(form.get("email"), "your staff email", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { message: "Enter a valid staff email." };
    if (!(await getStore().isStaff(email))) return { message };
    const origin = (await headers()).get("origin");
    if (!origin) throw new StoreError("Open the sign-in page and try again.");
    const auth = await authClient();
    const { error } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: new URL("/manage/auth/callback", origin).toString() } });
    if (error) return { message: "Unable to send a sign-in link. Please contact KCA or try again." };
    return { message };
  } catch (error) { return { message: error instanceof StoreError ? error.message : "Unable to sign in. Please try again." }; }
}
export async function signOut() {
  if (!isMemoryMode()) await (await authClient()).auth.signOut();
  (await cookies()).set("kca_demo", "", { path: "/manage", maxAge: 0 });
  redirect("/manage/sign-in");
}
