import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import { BookingSummary, CapacityNotice } from "@/components/booking/BookingSummary";
import { ActionForm } from "@/components/manage/ActionForm";
import StatusControls from "@/components/manage/StatusControls";
import { paymentNote, uploadAdvert, decideAdvert } from "../../../actions";
export default async function BookingPage({ params }: { params: Promise<{ reference: string }> }) {
  await requireStaff();
  const { reference } = await params;
  const store = getStore();
  const [detail, settings] = await Promise.all([store.bookingDetail(reference), store.getSettings()]);
  if (!detail) notFound();
  const { booking: b, advertiser: a, adverts, history } = detail;
  const closed = b.status === "Finished" || b.status === "Cancelled";
  return <article className="space-y-6">
    <div key={b.updatedAt} className="animate-quote-in motion-reduce:animate-none"><h1 className="break-all text-2xl font-bold">{reference}</h1><p className="mt-2 text-brand-500">{b.status}</p></div>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="staff-card"><h2>Answers and sums</h2><BookingSummary booking={b} settings={settings} /><div className="mt-4"><CapacityNotice capacity={detail.capacity} /></div></section>
      <section className="staff-card space-y-2"><h2>Advertiser</h2><p>{a.name}</p><p>{a.business}</p><p className="break-all"><a className="underline" href={`tel:+${a.phone}`}>+{a.phone}</a></p>{a.email && <p className="break-all"><a className="underline" href={`mailto:${a.email}`}>{a.email}</a></p>}<p>{a.paysBy === "invoice" ? "Pay by invoice" : "Pay now"}</p></section>
      <section className="staff-card"><h2>Payment note</h2>{closed ? <p>{b.paymentNote || "No payment note."}</p> : <ActionForm action={paymentNote}><input type="hidden" name="reference" value={reference} /><label>M-Pesa code or invoice number<input name="paymentNote" defaultValue={b.paymentNote} required maxLength={200} /></label></ActionForm>}</section>
      <section className="staff-card"><h2>Change status</h2><StatusControls key={b.updatedAt} detail={detail} settings={settings} today={todayInNairobi()} /></section>
    </div>
    <section className="staff-card space-y-5"><h2>Adverts ({adverts.length} of 3)</h2>
      {store.mode === "memory" && <p className="text-sm text-gray-300">Demo mode keeps file names only. File contents cannot be viewed.</p>}
      <div className="grid items-start gap-4 md:grid-cols-3">{adverts.map((ad) => <div key={ad.id} className="min-w-0 space-y-3 rounded-lg border border-white/15 p-4">
        <p className="break-all font-semibold">{ad.fileName}</p><p>{ad.seconds} seconds / {ad.decision}</p>{ad.reason && <p className="text-sm">{ad.reason}</p>}
        {ad.filePath && <a className="staff-link underline" href={`/manage/bookings/${reference}/advert/${ad.id}`} target="_blank" rel="noopener noreferrer">Open advert</a>}
        {!closed && <ActionForm action={decideAdvert} submit="Save decision"><input type="hidden" name="reference" value={reference} /><input type="hidden" name="id" value={ad.id} /><label>Decision<select name="decision" defaultValue={ad.decision === "refused" ? "refused" : "approved"}><option value="approved">Approved</option><option value="refused">Refused</option></select></label><label>Reason (needed to refuse)<input name="reason" maxLength={500} defaultValue={ad.reason} /></label></ActionForm>}
      </div>)}</div>
      {!closed && adverts.length < 3 && <ActionForm action={uploadAdvert} submit="Upload advert"><input type="hidden" name="reference" value={reference} /><label>Advert file (MP4, PNG or JPEG, up to 50 MB)<input name="file" type="file" accept="video/mp4,image/png,image/jpeg" required /></label><label>Length in seconds<input type="number" name="seconds" min={1} max={3600} step={1} defaultValue={b.request.lengthSeconds} required /></label></ActionForm>}
    </section>
    <section className="staff-card"><h2>Status history</h2>{!history.length && <p>No status changes yet.</p>}<ol className="space-y-4">{history.map((h) => <li key={h.id} className="break-words border-b border-white/10 pb-3"><p>{h.fromStatus} to {h.toStatus}</p><p className="mt-1 text-sm text-gray-300">{new Date(h.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} / {h.staffEmail}</p>{h.note && <p className="mt-1">{h.note}</p>}</li>)}</ol></section>
  </article>;
}
