import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getStore } from "@/lib/store";
import { WHATSAPP_NUMBER } from "@/lib/contact";
import { BookingSummary, CapacityNotice } from "@/components/booking/BookingSummary";

export const dynamic = "force-dynamic";
const NEXT_STEP: Record<string, string> = {
  Quote: "Pay by M-Pesa or card, then send us your advert. KCA confirms within 1 working day.",
  Paid: "Payment received. Send us your advert if you have not yet; KCA checks it within 1 working day.",
  Approved: "Your advert is approved and will go live on your start date.",
  Live: "Your advert is on screen now. KCA sends your play report at the end.",
  Finished: "This booking has finished. Ask KCA for your play report or book again.",
  Cancelled: "This booking was cancelled. Contact KCA if you have questions.",
};
export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false }, alternates: { canonical: null } };
export default async function QuotePage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const store = getStore();
  const booking = await store.publicBooking(reference);
  if (!booking) notFound();
  const settings = await store.getSettings();
  const message = [`Hello KCA, here is my booking ${booking.reference}.`, `Length: ${booking.request.lengthSeconds} seconds`, `How often: ${booking.request.howOften} plays an hour`, `Days: ${booking.request.days.map((d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]).join(", ")}`, `Time blocks: ${booking.request.blocks.map((b) => settings.timeBlocks[b].label).join(", ")}`, `Dates: ${booking.request.startDate} to ${booking.request.endDate}`, `Plays: ${booking.plays}`, `Price: KES ${booking.priceKes.toLocaleString("en-GB")}`, `Reference: ${booking.reference}`].join("\n");
  return <section className="bg-ink px-4 pb-16 pt-40 text-white">
    <div className="mx-auto max-w-2xl space-y-6 rounded-2xl bg-white p-5 text-gray-900 sm:p-8">
      <p className="text-sm font-semibold text-brand-700">Your booking</p><h1 className="break-all text-2xl font-bold">{booking.reference}</h1>
      <p>Status: <strong>{booking.status}</strong></p>
      <BookingSummary booking={booking} settings={settings} />
      {booking.status === "Quote" && <CapacityNotice capacity={booking.capacity} />}
      <p>{NEXT_STEP[booking.status]}</p>
      <a className="staff-button" href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Send this booking to KCA on WhatsApp</a>
      <p><Link className="underline" href="/book">Create another quote</Link></p>
    </div>
  </section>;
}
