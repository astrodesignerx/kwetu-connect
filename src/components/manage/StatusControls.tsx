import Link from "next/link";
import { canMove } from "@/lib/booking/status";
import type { BookingStatus } from "@/lib/booking/capacity";
import type { BookingDetail } from "@/lib/store/types";
import type { BookingSettings } from "@/lib/booking/settings";
const NEXT: Partial<Record<BookingStatus, BookingStatus>> = { Quote: "Paid", Paid: "Approved", Approved: "Live", Live: "Finished" };
export default function StatusControls({ detail, settings, today, moveBase }: { detail: BookingDetail; settings: BookingSettings; today: string; moveBase: string }) {
  const b = detail.booking;
  if (b.status === "Finished" || b.status === "Cancelled") return <p>Nothing leaves {b.status}.</p>;
  const targets = [NEXT[b.status]!, "Cancelled"] as BookingStatus[];
  // Each choice opens the confirm step, which is where the cancel note is asked for.
  return <div className="v2-move-list">{targets.map((to) => {
    const result = canMove(b.status, to, { ...b, note: "asked at the confirm step", settings, capacity: detail.capacity }, detail.adverts, today);
    return result.ok ? <Link key={to} className="staff-button" data-danger={to === "Cancelled" || undefined} href={moveBase + (moveBase.endsWith("?") ? "" : "&") + "moveTo=" + to} scroll={false}>Move to {to}</Link> : <p key={to}>{to}: {result.reason}</p>;
  })}</div>;
}
