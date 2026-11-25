export const AUTH_NEXT_COOKIE = "kca_auth_next";

export type SignInNext = "/manage" | "/mail";

/** Normalise the post-sign-in destination to an allowed staff root route. */
export function safeSignInNext(value: string | null | undefined): SignInNext {
  return value === "/mail" ? "/mail" : "/manage";
}

/** Return the password setup page path, preserving the mail return target when requested. */
export function passwordSetupPath(next: SignInNext): string {
  return next === "/mail" ? "/manage/password?next=/mail" : "/manage/password";
}

/** Restrict stored callback redirect destinations to known safe staff paths. */
export function safeCallbackNext(value: string | null | undefined): string {
  if (value === "/mail" || value === "/manage/password" || value === "/manage/password?next=/mail") return value;
  return "/manage";
}
