"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { moveBooking } from "@/app/manage/actions";
import { canMove } from "@/lib/booking/status";
import type { BookingStatus } from "@/lib/booking/capacity";
import type { BookingDetail } from "@/lib/store/types";
import type { BookingSettings } from "@/lib/booking/settings";
const NEXT: Partial<Record<BookingStatus, BookingStatus>> = { Quote: "Paid", Paid: "Approved", Approved: "Live", Live: "Finished" };
export default function StatusControls({ detail, settings, today, moveBase }: { detail: BookingDetail; settings: BookingSettings; today: string; moveBase?: string }) {
  const [note, setNote] = useState("");
  const [state, action, pending] = useActionState(moveBooking, { message: "" });
  const b = detail.booking;
  if (b.status === "Finished" || b.status === "Cancelled") return <p>Nothing leaves {b.status}.</p>;
  const targets = [NEXT[b.status]!, "Cancelled"] as BookingStatus[];
  // With moveBase each choice opens the confirm step, which is where the cancel note is asked for.
  if (moveBase !== undefined) return <div className="v2-move-list">{targets.map((to) => {
    const result = canMove(b.status, to, { ...b, note: "asked at the confirm step", settings, capacity: detail.capacity }, detail.adverts, today);
    return result.ok ? <Link key={to} className="staff-button" href={moveBase + (moveBase.endsWith("?") ? "" : "&") + "moveTo=" + to} scroll={false}>Move to {to}</Link> : <p key={to}>{to}: {result.reason}</p>;
  })}</div>;
  return <form action={action} className="staff-form space-y-4">
    <input type="hidden" name="reference" value={b.reference} />
    <label>Change note (required to cancel)<input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
    <div className="space-y-3">{targets.map((to) => {
      const result = canMove(b.status, to, { ...b, note, settings, capacity: detail.capacity }, detail.adverts, today);
      return <div key={to} className="animate-quote-in motion-reduce:animate-none">{result.ok ? <button className="staff-button" name="to" value={to} disabled={pending}>Move to {to}</button> : <p className="text-sm text-gray-600">{to}: {result.reason}</p>}</div>;
    })}</div>
    <p role="status" key={state.message} className="animate-quote-in motion-reduce:animate-none">{pending ? "Saving..." : state.message}</p>
  </form>;
}
