"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { bookPlays } from "@/app/book/actions";
import type { BookingRequest } from "@/lib/booking/hours";

export default function BookingForm({ request, priceKes, advert = null, advertSeconds }: { request: BookingRequest; priceKes: number; advert?: File | null; advertSeconds: number }) {
  const [state, action, pending] = useActionState(bookPlays, { error: "" });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // The checked advert lives outside this form, in the photo box.
    if (advert) { form.set("advert", advert); form.set("advertSeconds", String(advertSeconds)); }
    startTransition(() => action(form));
  }
  return <form onSubmit={submit} className="staff-form book-form animate-quote-in space-y-4 text-sm text-gray-900 motion-reduce:animate-none">
    <p>Save your booking to get a reference, then send it to KCA on WhatsApp.</p>
    <input type="hidden" name="request" value={JSON.stringify(request)} />
    <div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label>Your name<input name="name" autoComplete="name" required maxLength={100} /></label>
    <label>Phone<input name="phone" type="tel" autoComplete="tel" required maxLength={30} /></label>
    <label>Email (optional)<input name="email" type="email" autoComplete="email" maxLength={254} /></label>
    <label>Business<input name="business" autoComplete="organization" required maxLength={150} /></label>
    <label>Payment<select name="paysBy" defaultValue="now"><option value="now">Pay now</option>{priceKes >= 50000 && <option value="invoice">Pay by invoice</option>}</select></label>
    <p aria-live="polite" className="text-red-700">{state.error}</p>
    <button className="staff-button w-full" disabled={pending}>{pending ? (advert ? "Saving booking and advert..." : "Saving booking...") : advert ? "Save booking and advert" : "Save booking"}</button>
  </form>;
}
