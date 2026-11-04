import { todayInNairobi } from "@/lib/store/validation";
import { BookingSummary, CapacityNotice } from "@/components/booking/BookingSummary";
import { ActionForm } from "@/components/manage/ActionForm";
import StatusControls from "@/components/manage/StatusControls";
import { paymentNote, uploadAdvert, decideAdvert } from "@/app/manage/actions";
import type { BookingDetail as Detail } from "@/lib/store/types";
import type { BookingSettings } from "@/lib/booking/settings";
import AdvertPreview from "./AdvertPreview";
export default function BookingDetail({ detail, settings, demo, compact = false }: { detail: Detail; settings: BookingSettings; demo: boolean; compact?: boolean }) {
  const reference = detail.booking.reference;
  const { booking: b, advertiser: a, adverts, history } = detail;
  const closed = b.status === "Finished" || b.status === "Cancelled";
  return <article className={"booking-detail space-y-6" + (compact ? " detail-compact" : "")}>
    <AdvertPreview detail={detail} demo={demo} />
    <div key={b.updatedAt} className="animate-quote-in motion-reduce:animate-none"><h1 className="break-all text-2xl font-bold">{reference}</h1><p className="mt-2 text-brand-700">{b.status}</p></div>
    <div className="detail-facts-grid grid items-start gap-6 lg:grid-cols-2">
      <details className="staff-card detail-answers" open={!compact}><summary>Answers and sums</summary><BookingSummary booking={b} settings={settings} /><div className="mt-4"><CapacityNotice capacity={detail.capacity} /></div></details>
      <details className="staff-card space-y-2 detail-advertiser" open={!compact}><summary>Advertiser</summary><p>{a.name}</p><p>{a.business}</p><p className="break-all"><a className="underline" href={`tel:+${a.phone}`}>+{a.phone}</a></p>{a.email && <p className="break-all"><a className="underline" href={`mailto:${a.email}`}>{a.email}</a></p>}<p>{a.paysBy === "invoice" ? "Pay by invoice" : "Pay now"}</p></details>
      <section className="staff-card detail-payment" data-unpaid={b.status === "Quote"}><h2>Payment note</h2>{closed ? <p>{b.paymentNote || "No payment note."}</p> : <ActionForm action={paymentNote}><input type="hidden" name="reference" value={reference} /><label>M-Pesa code or invoice number<input name="paymentNote" defaultValue={b.paymentNote} required maxLength={200} /></label></ActionForm>}</section>
      <section className="staff-card detail-status"><h2>Change status</h2><StatusControls key={b.updatedAt} detail={detail} settings={settings} today={todayInNairobi()} /></section>
    </div>
    <section className="staff-card space-y-5 detail-adverts"><h2>Adverts ({adverts.length} of 3)</h2>
      {demo && <p className="text-sm text-gray-600">Demo mode keeps file names only. File contents cannot be viewed.</p>}
      <div className="grid items-start gap-4 md:grid-cols-3">{adverts.map((ad) => <div key={ad.id} className="min-w-0 space-y-3 rounded-lg border border-gray-200 p-4">
        <p className="break-all font-semibold">{ad.fileName}</p><p>{ad.seconds} seconds / {ad.decision}</p>{ad.reason && <p className="text-sm">{ad.reason}</p>}
        {ad.filePath && <a className="staff-link underline" href={`/manage/bookings/${reference}/advert/${ad.id}`} target="_blank" rel="noopener noreferrer">Open advert</a>}
        {!closed && <ActionForm action={decideAdvert} submit="Save decision"><input type="hidden" name="reference" value={reference} /><input type="hidden" name="id" value={ad.id} /><label>Decision<select name="decision" defaultValue={ad.decision === "refused" ? "refused" : "approved"}><option value="approved">Approved</option><option value="refused">Refused</option></select></label><label>Reason (needed to refuse)<input name="reason" maxLength={500} defaultValue={ad.reason} /></label></ActionForm>}
      </div>)}</div>
      {!closed && adverts.length < 3 && <details open={!compact || adverts.length === 0}><summary>{adverts.length ? "Upload another advert" : "Upload advert"}</summary><ActionForm action={uploadAdvert} submit="Upload advert"><input type="hidden" name="reference" value={reference} /><label>Advert file (MP4, PNG or JPEG, up to 50 MB)<input name="file" type="file" accept="video/mp4,image/png,image/jpeg" required /></label><label>Length in seconds<input type="number" name="seconds" min={1} max={3600} step={1} defaultValue={b.request.lengthSeconds} required /></label></ActionForm></details>}
    </section>
    <section className="staff-card detail-history"><h2>Status history</h2>{!history.length && <p>No status changes yet.</p>}<ol className="space-y-4">{history.map((h) => <li key={h.id} className="break-words border-b border-gray-200 pb-3"><p>{h.fromStatus} to {h.toStatus}</p><p className="mt-1 text-sm text-gray-600">{new Date(h.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} / {h.staffEmail}</p>{h.note && <p className="mt-1">{h.note}</p>}</li>)}</ol></section>
  </article>;
}
