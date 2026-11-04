import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getStore } from "@/lib/store";
import { WHATSAPP_NUMBER } from "@/lib/contact";
import { BookingSummary, CapacityNotice } from "@/components/booking/BookingSummary";
import QuoteTotals from "@/components/booking/QuoteTotals";
import StatusTag from "@/components/manage/StatusTag";
import BookHeader from "@/components/workspace/BookHeader";

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
  const next = [...settings.discountSteps].reverse().find((s) => s.minPlays > booking.plays);
  const result = { ok: true as const, ...booking, hoursBooked: booking.plays / booking.request.howOften,
    perPlayKes: Math.round(booking.priceKes / booking.plays * 100) / 100, belowMinimum: false,
    nextStep: next ? { ...next, playsNeeded: next.minPlays - booking.plays } : null };
  return <><BookHeader settings={settings} step={3} /><section className="booking-canvas saved-quote">
    <div className="booking-workspace timetable-panel saved-layout">
      <div className="space-y-6 min-w-0"><p className="text-sm font-semibold text-brand-700">Your booking</p><h1 className="break-all text-2xl font-bold">{booking.reference}</h1>
        <BookingSummary booking={booking} settings={settings} />
        {booking.status === "Quote" && <CapacityNotice capacity={booking.capacity} />}
        <p><Link className="quiet-button underline" href="/book">Create another quote</Link></p>
      </div>
      <aside><QuoteTotals result={result} settings={settings} weeks={(Date.parse(booking.request.endDate) - Date.parse(booking.request.startDate) + 86400000) / 604800000}>
        <div className="space-y-4"><StatusTag status={booking.status} /><p>{NEXT_STEP[booking.status]}</p>
          <a className="timetable-button" href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Send this booking to KCA on WhatsApp</a>
        </div>
      </QuoteTotals></aside>
    </div>
  </section></>;
}
