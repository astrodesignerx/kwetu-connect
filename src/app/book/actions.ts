"use server";
import { redirect } from "next/navigation";
import { getStore } from "@/lib/store";
import type { QuoteInput } from "@/lib/store/types";
import { StoreError } from "@/lib/store/validation";
import { sendBookingMail, siteOrigin } from "@/lib/booking-mail";

type FormState = { error: string };
const ERROR = "Unable to save your booking. Please try again.";

/** A storage-safe file name: letters, numbers, spaces, dots, brackets and hyphens, starting with a letter or number. */
function safeName(name: string, type: string) {
  const ext = type === "video/mp4" ? ".mp4" : type === "image/png" ? ".png" : ".jpg";
  const base = name.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9_. ()-]/g, "-").replace(/^[^a-zA-Z0-9]+/, "").slice(0, 100);
  return (base || "advert") + ext;
}

/** The booking is already saved, so an advert that fails here is reported, not fatal. */
async function attachAdvert(reference: string, form: FormData) {
  const advert = form.get("advert");
  if (!(advert instanceof File) || advert.size === 0) return "";
  try {
    await getStore().addAdvert(reference, new File([advert], safeName(advert.name, advert.type), { type: advert.type }), Math.round(Number(form.get("advertSeconds"))));
    return "?advert=sent";
  } catch { return "?advert=failed"; }
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
    advertNote = await attachAdvert(reference, form);
    await sendBookingMail("saved", String(form.get("email") ?? "").trim(), String(form.get("name") ?? ""), [booking], await siteOrigin());
  } catch (error) {
    return { error: error instanceof StoreError ? error.message : ERROR };
  }
  redirect(`/book/q/${reference}${advertNote}`);
}

/** Change an unpaid booking without changing its reference. */
export async function changeBooking(_state: FormState, form: FormData): Promise<FormState> {
  let reference: string;
  let note = "";
  const old = String(form.get("reference") ?? "");
  try {
    let request;
    try { request = JSON.parse(String(form.get("request"))); } catch { throw new StoreError("Choose your plays first."); }
    reference = (await getStore().replaceQuote(old, request)).reference;
    note = await attachAdvert(reference, form);
  } catch (error) {
    return { error: error instanceof StoreError ? error.message : ERROR };
  }
  redirect(`/book/q/${reference}${note ? note + "&" : "?"}updated=1`);
}

/** Open a booking from its reference and the phone it was made with. Same message for every miss. */
export async function openBooking(_state: FormState, form: FormData): Promise<FormState> {
  const found = await getStore().findBooking(String(form.get("reference") ?? ""), String(form.get("phone") ?? ""));
  if (!found) return { error: "We could not find a booking with that reference and phone number. Check both, or ask KCA on WhatsApp." };
  redirect(`/book/q/${found.replacedBy ?? found.reference}`);
}

// One links email per address every 10 minutes, per server.
const lastSent = new Map<string, number>();
/** Email the links to every open booking for this address. The reply never says whether the address is known. */
export async function emailLinks(_state: { error: string; sent?: boolean }, form: FormData): Promise<{ error: string; sent?: boolean }> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "Enter the email you booked with." };
  const now = Date.now();
  if ((lastSent.get(email) ?? 0) > now - 10 * 60 * 1000) return { error: "", sent: true };
  lastSent.set(email, now);
  const { name, bookings } = await getStore().bookingsByEmail(email);
  await sendBookingMail("links", email, name, bookings, await siteOrigin());
  return { error: "", sent: true };
}
