"use client";

import { useActionState, useState } from "react";
import { moveBooking } from "@/app/manage/actions";
import { canMove } from "@/lib/booking/status";
import type { BookingStatus } from "@/lib/booking/capacity";
import type { BookingDetail } from "@/lib/store/types";
import type { BookingSettings } from "@/lib/booking/settings";

export default function PipelineMove({ detail, target, settings, today }: { detail: BookingDetail; target: BookingStatus; settings: BookingSettings; today: string }) {
  const [note, setNote] = useState("");
  const [state, action, pending] = useActionState(moveBooking, { message: "" });
  const booking = detail.booking;
  const allowed = canMove(booking.status, target, { ...booking, note, settings, capacity: detail.capacity }, detail.adverts, today);
  return <section className="ns-card pipeline-move" aria-label="Confirm status change"><h2>{booking.status === target ? `Moved to ${target}` : `Move ${booking.status} to ${target}?`}</h2>
    {booking.status !== target && <form action={action} className="staff-form"><fieldset disabled={pending}>
      <input type="hidden" name="reference" value={booking.reference} /><input type="hidden" name="to" value={target} />
      <label>Change note{target === "Cancelled" ? " (required)" : " (optional)"}<input name="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} required={target === "Cancelled"} /></label>
      {!allowed.ok && <p>{allowed.reason}</p>}
      <button type="submit" className="staff-button" disabled={!allowed.ok}>{pending ? "Saving..." : "Confirm move to " + target}</button>
    </fieldset></form>}
    <p role="status">{state.message}</p>
  </section>;
}
