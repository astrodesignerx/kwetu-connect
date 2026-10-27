"use server";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/store";
import type { QuoteInput } from "@/lib/store/types";
import { StoreError } from "@/lib/store/validation";

export async function bookPlays(_state: { error: string }, form: FormData): Promise<{ error: string }> {
  let reference: string;
  try {
    let request;
    try { request = JSON.parse(String(form.get("request"))); } catch { throw new StoreError("Choose your plays first."); }
    const booking = await getStore().createQuote({ request, name: form.get("name"), phone: form.get("phone"), email: form.get("email"), business: form.get("business"), paysBy: form.get("paysBy"), website: form.get("website") } as QuoteInput);
    reference = booking.reference;
  } catch (error) {
    return { error: error instanceof StoreError ? error.message : "Unable to save your booking. Please try again." };
  }
  redirect(`/book/q/${reference}`);
}
