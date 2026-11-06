"use client";
import { startTransition, useActionState, type FormEvent } from "react";
import { bookPlays, changeBooking } from "@/app/book/actions";
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

/** Changing an unpaid booking: the contact details are already on file, so it is one button. */
export function ChangeForm({ reference, wasKes, request, priceKes, advert = null, advertSeconds }: { reference: string; wasKes: number; request: BookingRequest; priceKes: number; advert?: File | null; advertSeconds: number }) {
  const [state, action, pending] = useActionState(changeBooking, { error: "" });
  const diff = priceKes - wasKes;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (advert) { form.set("advert", advert); form.set("advertSeconds", String(advertSeconds)); }
    startTransition(() => action(form));
  }
  return <form onSubmit={submit} className="change-form animate-quote-in motion-reduce:animate-none">
    <input type="hidden" name="request" value={JSON.stringify(request)} />
    <input type="hidden" name="reference" value={reference} />
    <div className="change-compare" aria-label="Price change">
      <div><small>Before</small><s>KES {wasKes.toLocaleString("en-GB")}</s></div>
      <span aria-hidden="true">→</span>
      <div><small>Now</small><b>KES {priceKes.toLocaleString("en-GB")}</b></div>
      <em data-up={diff > 0}>{diff === 0 ? "Same price" : (diff > 0 ? "+" : "-") + "KES " + Math.abs(diff).toLocaleString("en-GB")}</em>
    </div>
    <p className="change-note">Your reference and contact details stay the same. Any advert you sent stays with your booking and KCA checks it again.</p>
    <p className="change-note">Already paid? Ask KCA to change your plan, even if payment is still awaiting confirmation.</p>
    <p aria-live="polite" className="text-red-700">{state.error}</p>
    <button className="staff-button w-full" disabled={pending}>{pending ? "Saving changes..." : "Save changes"}</button>
  </form>;
}
