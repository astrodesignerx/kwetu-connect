"use server";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/store";
import type { QuoteInput } from "@/lib/store/types";
import { StoreError } from "@/lib/store/validation";

/** A storage-safe file name: letters, numbers, spaces, dots, brackets and hyphens, starting with a letter or number. */
function safeName(name: string, type: string) {
  const ext = type === "video/mp4" ? ".mp4" : type === "image/png" ? ".png" : ".jpg";
  const base = name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9_. ()-]/g, "-").replace(/^[^a-zA-Z0-9]+/, "").slice(0, 100);
  return (base || "advert") + ext;
}

export async function bookPlays(_state: { error: string }, form: FormData): Promise<{ error: string }> {
  let reference: string;
  let advertNote = "";
  try {
    let request;
    try { request = JSON.parse(String(form.get("request"))); } catch { throw new StoreError("Choose your plays first."); }
    const store = getStore();
    const booking = await store.createQuote({ request, name: form.get("name"), phone: form.get("phone"), email: form.get("email"), business: form.get("business"), paysBy: form.get("paysBy"), website: form.get("website") } as QuoteInput);
    reference = booking.reference;
    const advert = form.get("advert");
    if (advert instanceof File && advert.size > 0) {
      // The booking is already saved, so an advert that fails here is reported, not fatal.
      try {
        await store.addAdvert(reference, new File([advert], safeName(advert.name, advert.type), { type: advert.type }), Math.round(Number(form.get("advertSeconds"))));
        advertNote = "?advert=sent";
      } catch { advertNote = "?advert=failed"; }
    }
  } catch (error) {
    return { error: error instanceof StoreError ? error.message : "Unable to save your booking. Please try again." };
  }
  redirect(`/book/q/${reference}${advertNote}`);
}
