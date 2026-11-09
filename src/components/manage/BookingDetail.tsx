import { Fragment } from "react";
import Image from "next/image";
import type { ReactNode } from "react";
import { CapacityNotice } from "@/components/booking/BookingSummary";
import Timetable from "@/components/booking/Timetable";
import { occupancyByDayBlock } from "@/lib/booking/occupancy";
import { nextAction, weeksOf } from "@/lib/booking/pipeline";
import { dateRange } from "@/lib/format/dates";
import BookingHeader from "./BookingHeader";
import { ActionForm } from "@/components/manage/ActionForm";
import StatusControls from "@/components/manage/StatusControls";
import { paymentNote, uploadAdvert, decideAdvert } from "@/app/manage/actions";
import type { BookingDetail as Detail } from "@/lib/store/types";
import type { BookingSettings } from "@/lib/booking/settings";
import AdvertPreview from "./AdvertPreview";
import BookingDetailTabs from "./BookingDetailTabs";
import { number } from "@/components/booking/QuoteTotals";

export default function BookingDetail({ detail, settings, demo, today, moveBase, confirm, compact = false }: { detail: Detail; settings: BookingSettings; demo: boolean; today: string; moveBase: string; confirm?: ReactNode; compact?: boolean }) {
  const { booking: b, advertiser: a, adverts, history } = detail;
  const reference = b.reference;
  const closed = b.status === "Finished" || b.status === "Cancelled";
  const payment = <section className="staff-card detail-payment"><h2>Payment note</h2>{closed ? <p>{b.paymentNote || "No payment note."}</p> : <ActionForm action={paymentNote}><input type="hidden" name="reference" value={reference} /><label>M-Pesa code or invoice number<input name="paymentNote" defaultValue={b.paymentNote} required maxLength={200} /></label></ActionForm>}</section>;
  const advertPanel = <div className="v2-booking-detail"><AdvertPreview detail={detail} demo={demo} /><section className="staff-card detail-adverts space-y-5"><h2>Adverts ({adverts.length} of 3)</h2>
    {demo && <p className="muted">Demo mode keeps file names only. File contents cannot be viewed.</p>}
    <div className="grid items-start gap-4">{adverts.map((ad) => <div key={ad.id} className="min-w-0 space-y-3 rounded-lg border border-gray-200 p-4"><p className="break-all font-semibold">{ad.fileName}</p><p>{ad.seconds} seconds / {ad.decision}</p>{ad.reason && <p>{ad.reason}</p>}{ad.filePath && <a className="staff-link underline" href={`/manage/bookings/${reference}/advert/${ad.id}`} target="_blank" rel="noopener noreferrer">Open advert</a>}{!closed && <ActionForm action={decideAdvert} submit="Save decision"><input type="hidden" name="reference" value={reference} /><input type="hidden" name="id" value={ad.id} /><label>Decision<select name="decision" defaultValue={ad.decision === "refused" ? "refused" : "approved"}><option value="approved">Approved</option><option value="refused">Refused</option></select></label><label>Reason (needed to refuse)<input name="reason" maxLength={500} defaultValue={ad.reason} /></label></ActionForm>}</div>)}</div>
    {!closed && adverts.length < 3 && <details open={adverts.length === 0}><summary>{adverts.length ? "Upload another advert" : "Upload advert"}</summary><ActionForm action={uploadAdvert} submit="Upload advert"><input type="hidden" name="reference" value={reference} /><label>Advert file (MP4, PNG or JPEG, up to 50 MB)<input name="file" type="file" accept="video/mp4,image/png,image/jpeg" required /></label><label>Length in seconds<input type="number" name="seconds" min={1} max={3600} step={1} defaultValue={b.request.lengthSeconds} required /></label></ActionForm></details>}
  </section></div>;
  const contact = <section className="staff-card detail-advertiser space-y-2"><h2>Advertiser</h2><p>{a.name}</p><p>{a.business}</p><p className="break-all"><a className="underline" href={`tel:+${a.phone}`}>+{a.phone}</a></p>{a.email && <p className="break-all"><a className="underline" href={`mailto:${a.email}`}>{a.email}</a></p>}<p>{a.paysBy === "invoice" ? "Pay by invoice" : "Pay now"}</p></section>;
  const historyPanel = <section className="staff-card detail-history"><h2>Status history</h2>{!history.length && <p>No status changes yet.</p>}<ol className="space-y-4">{history.map((entry) => <li key={entry.id} className="break-words border-b border-gray-200 pb-3"><p>{entry.fromStatus} to {entry.toStatus}</p><p className="mt-1 text-sm text-gray-600">{new Date(entry.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} / {entry.staffEmail}</p>{entry.note && <p className="mt-1">{entry.note}</p>}</li>)}</ol></section>;
  const r = b.request;
  const advert = adverts.find((ad) => ad.decision === "waiting") ?? adverts[adverts.length - 1];
  const advertUrl = advert?.filePath ? `/manage/bookings/${reference}/advert/${advert.id}` : null;
  const extension = advert?.fileName.split(".").pop()?.toUpperCase() ?? "";
  const isImage = ["PNG", "JPG", "JPEG"].includes(extension);
  const advertStatus = !advert ? "No advert uploaded yet" : advert.decision === "waiting" ? "Waiting for review" : advert.decision === "approved" ? "Approved" : "Refused";
  const rate = b.plays && r.lengthSeconds ? +(b.fullPriceKes / (b.plays * r.lengthSeconds)).toFixed(2) : 0;
  const saved = b.fullPriceKes - b.priceKes;
  const summary = <><div className="v2-detail-plan-tiles">{[["Length", r.lengthSeconds + "s"], ["Plays an hour", String(r.howOften)], ["Plays", number(b.plays)], ["Weeks", String(weeksOf(r))]].map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
    <div className="v2-booking-detail v2-summary-grid">
      <section className="staff-card v2-hours-card"><div className="v2-card-head"><h2>Booked hours</h2><span>{dateRange(r.startDate, r.endDate)}</span></div><div className="booking-summary"><Timetable settings={settings} occupancy={occupancyByDayBlock([], r.startDate, r.endDate, settings)} selection={r} /></div></section>
      <div className="v2-summary-advert">
        {b.paymentNote && <section className="staff-card v2-note-card"><h2>Payment note</h2><p>{b.paymentNote}</p></section>}
        <section className="staff-card v2-advert-card"><h2>Advert</h2><div className="v2-advert-row">
          <span className="v2-advert-thumb" data-empty={!advert}>{advertUrl && isImage ? <Image src={advertUrl} alt="" fill unoptimized sizes="96px" /> : <b>{advert ? advert.seconds + "s" : "None"}</b>}</span>
          <div><strong>{advertStatus}</strong>{advert && <p>{advert.seconds} s {extension || "file"}. {advert.decision === "waiting" ? <>Open it in <a className="staff-link underline" href={"/manage/adverts?q=" + encodeURIComponent(reference)}>Adverts</a>.</> : advert.fileName}</p>}<span className="pipeline-pill" data-stage={b.status}>{b.status}</span></div>
        </div></section>
        <section className="staff-card v2-price-card"><h2>Price</h2><dl>
          <div><dt>{number(b.plays)} plays x {r.lengthSeconds}s x KES {rate}</dt><dd>KES {number(b.fullPriceKes)}</dd></div>
          <div><dt>{b.discountPercent ? `Discount, ${b.discountPercent}%` : "Discount, none"}</dt><dd>{saved > 0 ? "KES -" + number(saved) : "KES 0"}</dd></div>
          <div className="is-total"><dt>Total, VAT included</dt><dd>KES {number(b.priceKes)}</dd></div>
        </dl></section>
        {!detail.capacity.ok && <CapacityNotice capacity={detail.capacity} />}
      </div></div></>;
  const header = <BookingHeader business={a.business} reference={reference} status={b.status} action={nextAction({ reference, status: b.status, paymentNote: b.paymentNote, request: r }, adverts, today)} moveBase={moveBase} compact={compact}>
    <StatusControls key={b.updatedAt} detail={detail} settings={settings} today={today} moveBase={moveBase} />
  </BookingHeader>;
  return <article className={"booking-detail v2-tabbed-booking" + (compact ? " is-compact" : "")}><BookingDetailTabs key={reference} header={header} confirm={confirm} panels={[summary, advertPanel, payment, contact, historyPanel].map((panel, index) => <Fragment key={index}>{panel}</Fragment>)} /></article>;
}
