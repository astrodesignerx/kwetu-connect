"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient, requireStaff } from "@/lib/auth/server";
import { AUTH_NEXT_COOKIE, passwordSetupPath, safeSignInNext } from "@/lib/auth/next";
import { getStore, isMemoryMode } from "@/lib/store";
import { StoreError, text } from "@/lib/store/validation";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_CREDENTIALS = "Incorrect email or password. If you have not set a password yet, use Set or reset password below.";

async function setDemoCookie() {
  (await cookies()).set("kca_demo", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 43200,
  });
}

function isRateLimitError(error: { status?: number; message?: string }) {
  return error.status === 429 || /rate limit|for security purposes|once every|too many|seconds/i.test(error.message ?? "");
}

function mapPasswordUpdateError(error: { message?: string }) {
  const detail = error.message ?? "";
  if (/same|different/i.test(detail)) return "Choose a new password that differs from your current one.";
  if (/weak|pwned|short/i.test(detail)) return "Choose a stronger password with at least 12 characters.";
  if (/reauth/i.test(detail)) return "Sign in again with a fresh email link, then set your password.";
  return "Unable to save your password. Try again.";
}

/** Sign in a KCA staff member using email and password. */
export async function signInWithPassword(_state: { message: string }, form: FormData): Promise<{ message: string }> {
  const next = safeSignInNext(String(form.get("next") ?? ""));
  if (isMemoryMode()) {
    await setDemoCookie();
    redirect(next);
  }
  let signedIn = false;
  try {
    const email = text(form.get("email"), "your staff email", 254).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return { message: "Enter a valid staff email." };
    const password = String(form.get("password") ?? "");
    if (!password) return { message: "Enter your password." };
    if (password.length > 500) return { message: "Password is too long." };
    if (!(await getStore().isStaff(email))) return { message: INVALID_CREDENTIALS };
    const auth = await authClient();
    const { data, error } = await auth.auth.signInWithPassword({ email, password });
    if (error) {
      return {
        message: isRateLimitError(error)
          ? "Too many attempts. Wait a minute and try again."
          : INVALID_CREDENTIALS,
      };
    }
    if (!data.user?.email || !(await getStore().isStaff(data.user.email))) {
      await auth.auth.signOut();
      return { message: INVALID_CREDENTIALS };
    }
    signedIn = true;
  } catch (error) {
    return { message: error instanceof StoreError ? error.message : "Unable to sign in. Please try again." };
  }
  if (signedIn) redirect(next);
  return { message: "" };
}

/** Send a one-time sign-in or password setup link (or enter demo mode locally). */
export async function signIn(_state: { message: string }, form: FormData): Promise<{ message: string }> {
  const next = safeSignInNext(String(form.get("next") ?? ""));
  const mode = form.get("mode") === "reset" ? "reset" : "link";
  if (isMemoryMode()) {
    await setDemoCookie();
    redirect(next);
  }
  const message =
    mode === "reset"
      ? "If this email belongs to KCA staff, a password setup link is on its way."
      : "If this email belongs to KCA staff, a sign-in link is on its way.";
  try {
    const email = text(form.get("email"), "your staff email", 254).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) return { message: "Enter a valid staff email." };
    if (!(await getStore().isStaff(email))) return { message };
    const origin = (await headers()).get("origin");
    if (!origin) throw new StoreError("Open the sign-in page and try again.");
    const auth = await authClient();
    const callback = new URL("/manage/auth/callback", origin);
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: callback.toString() },
    });
    if (error) {
      return {
        message: isRateLimitError(error)
          ? "Wait a minute before requesting another link."
          : "Unable to send a sign-in link. Please try again in a minute.",
      };
    }
    const destination = mode === "reset" ? passwordSetupPath(next) : next;
    (await cookies()).set(AUTH_NEXT_COOKIE, destination, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/manage",
      maxAge: 3600,
    });
    return { message };
  } catch (error) {
    return { message: error instanceof StoreError ? error.message : "Unable to sign in. Please try again." };
  }
}

/** Save or update the currently signed-in staff member's password. */
export async function updateStaffPassword(_state: { message: string }, form: FormData): Promise<{ message: string }> {
  await requireStaff();
  const next = safeSignInNext(String(form.get("next") ?? ""));
  if (isMemoryMode()) return { message: "Passwords are not saved in demo mode." };
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 12) return { message: "Use at least 12 characters for your password." };
  if (password.length > 500) return { message: "Use 500 characters or fewer for your password." };
  if (password !== confirm) return { message: "The two passwords do not match." };
  let saved = false;
  try {
    const auth = await authClient();
    const { error } = await auth.auth.updateUser({ password });
    if (error) return { message: mapPasswordUpdateError(error) };
    saved = true;
  } catch {
    return { message: "Unable to save your password. Try again." };
  }
  if (saved) redirect(next);
  return { message: "" };
}

async function endSession() {
  if (!isMemoryMode()) await (await authClient()).auth.signOut();
  const jar = await cookies();
  jar.set("kca_demo", "", { path: "/manage", maxAge: 0 });
  jar.set("kca_demo", "", { path: "/", maxAge: 0 });
  jar.set(AUTH_NEXT_COOKIE, "", { path: "/manage", maxAge: 0 });
}

/** Sign out the current staff session and clear auth cookies. */
export async function signOut() {
  await endSession();
  redirect("/manage/sign-in");
}

/** Sign out from staff mail, back to the mail sign-in page. */
export async function signOutOfMail() {
  await endSession();
  redirect("/mail/sign-in");
}
