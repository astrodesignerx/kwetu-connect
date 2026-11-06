import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowsClockwise, PencilSimple, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { getStore } from "@/lib/store";
import { WHATSAPP_NUMBER } from "@/lib/contact";
import { bookingUrl, siteOrigin } from "@/lib/booking-mail";
import { CapacityNotice } from "@/components/booking/BookingSummary";
import PayPanel from "@/components/booking/PayPanel";
import BookingProgress from "@/components/booking/BookingProgress";
import { KeepLink, RememberBooking } from "@/components/booking/SavedBookings";
import { WeekStrip } from "@/components/booking/QuoteDetails";
import { buildQuery } from "@/lib/booking/answers";
import StatusTag from "@/components/manage/StatusTag";
import BookHeader from "@/components/workspace/BookHeader";
import { scheduleLines } from "@/lib/booking/selection";

export const dynamic = "force-dynamic";
const NEXT_STEP: Record<string, string> = {
  Quote: "Pay by M-Pesa or card, then send us your advert. KCA confirms within 1 working day.",
  Paid: "Payment received. Send us your advert if you have not yet; KCA checks it within 1 working day.",
  Approved: "Your advert is approved and will go live on your start date.",
  Live: "Your advert is on screen now. KCA sends your play report at the end.",
  Finished: "This booking has finished. Ask KCA for your play report or book again.",
  Cancelled: "This booking was cancelled. Contact KCA if you have questions.",
};
const whatsapp = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false }, alternates: { canonical: null } };
export default async function QuotePage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ advert?: string; changed?: string; updated?: string }> }) {
  const { reference } = await params;
  const { advert, changed, updated } = await searchParams;
  const store = getStore();
  const booking = await store.publicBooking(reference);
  if (!booking) notFound();
  // An old link to a changed plan opens the plan that replaced it.
  if (booking.replacedBy) redirect(`/book/q/${booking.replacedBy}?changed=${booking.reference}`);
  const settings = await store.getSettings();
  const link = bookingUrl(await siteOrigin(), booking.reference);
  const r = booking.request;
  const hasAdvert = booking.adverts > 0 || advert === "sent";
  const message = [`Hello KCA, here is my booking ${booking.reference}.`, `Length: ${r.lengthSeconds} seconds`, `How often: ${r.howOften} plays an hour`, "When:", ...scheduleLines(r, settings.timeBlocks), `Dates: ${r.startDate} to ${r.endDate}`, `Plays: ${booking.plays}`, `Price: KES ${booking.priceKes.toLocaleString("en-GB")}`, ...(hasAdvert ? ["My advert is uploaded with this booking."] : []), `Booking page: ${link}`].join("\n");
  const next = [...settings.discountSteps].reverse().find((s) => s.minPlays > booking.plays);
  const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const weeks = Math.round((Date.parse(r.endDate) - Date.parse(r.startDate) + 86400000) / 604800000 * 10) / 10;
  const facts = [
    ["Advert", `${r.lengthSeconds} s, ${hasAdvert ? "saved" : "not sent yet"}`],
    ["Plays", `${booking.plays.toLocaleString("en-GB")}, ${r.howOften} an hour`],
    ["Dates", `${day(r.startDate)} to ${day(r.endDate)}`, `${weeks} ${weeks === 1 ? "week" : "weeks"}`],
    ["Discount", `${booking.discountPercent}%`, next ? `${(next.minPlays - booking.plays).toLocaleString("en-GB")} more plays for ${next.percent}%` : "highest step"],
  ];
  const canEdit = booking.status === "Quote";
  return <><BookHeader settings={settings} step={3} /><section className="booking-canvas saved-quote">
    <RememberBooking booking={{ reference: booking.reference, priceKes: booking.priceKes, plays: booking.plays, startDate: r.startDate, endDate: r.endDate, status: booking.status }} replaces={changed} />
    <div className="booking-workspace saved-pay">
      <div className="saved-pay-top">
        <BookingProgress booking={booking} />
        {changed && <p className="changed-note" role="status"><ArrowsClockwise size={16} aria-hidden="true" />Plan updated. This is your new reference; the old link {changed.slice(0, 12)} now opens this page.</p>}
        {updated === "1" && <p className="changed-note" role="status"><ArrowsClockwise size={16} aria-hidden="true" />Plan updated. Your booking reference stays the same.</p>}
      </div>
      <div className="pay-card">
        {canEdit ? <PayPanel reference={booking.reference} priceKes={booking.priceKes} link={link} />
          : <div className="pay-panel"><div className="pay-due">
              <div><p className="quote-eyebrow">BOOKING STATUS</p><p className="pay-amount"><span>KES</span>{booking.priceKes.toLocaleString("en-GB")}</p></div>
              <StatusTag status={booking.status} />
            </div><p className="pay-status">{NEXT_STEP[booking.status]}</p></div>}
        {advert === "failed" && <p role="status" className="pay-alert">Your booking is saved, but the advert did not upload. Send it to KCA on WhatsApp.</p>}
      </div>
      <aside className="pay-recap">
        <div className="pay-recap-card">
          <p className="quote-eyebrow">YOUR BOOKING</p>
          <h1 className="pay-ref">{booking.reference}</h1>
          <WeekStrip selection={r} labels={settings.timeBlocks} />
          <dl className="pay-facts">{facts.map(([label, value, note]) => <div key={label}><dt>{label}</dt><dd>{value}</dd>{note && <dd className="pay-fact-note">{note}</dd>}</div>)}</dl>
          <p className="pay-lines">{scheduleLines(r, settings.timeBlocks).join(". ")}.</p>
          {canEdit && <CapacityNotice capacity={booking.capacity} />}
        </div>
        <KeepLink url={link} />
        <div className="pay-actions">
          {canEdit ? <Link className="pay-ghost" href={`/book?${buildQuery(r)}&edit=${booking.reference}`}><PencilSimple size={15} aria-hidden="true" />Change the plan</Link>
            : <a className="pay-ghost" href={whatsapp(`Hello KCA, I would like to change booking ${booking.reference}. ${link}`)} target="_blank" rel="noopener noreferrer"><PencilSimple size={15} aria-hidden="true" />Ask KCA to change it</a>}
          <a className="pay-ghost" href={whatsapp(message)} target="_blank" rel="noopener noreferrer"><WhatsappLogo size={15} aria-hidden="true" />Send on WhatsApp</a>
        </div>
      </aside>
    </div>
  </section></>;
}
