import type { Result } from "@/app/mail/actions";

export async function mailRequest<T>(work: Promise<Result<T>>): Promise<Result<T>> {
  try { return await work; }
  catch { return { ok: false, error: "The request could not reach the mail app. Check your connection and try again." }; }
}
