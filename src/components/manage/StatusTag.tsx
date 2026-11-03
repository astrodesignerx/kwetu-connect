import type { BookingStatus } from "@/lib/booking/capacity";
export default function StatusTag({ status }: { status: BookingStatus }) {
  return <span className="status-tag" data-status={status}>{status}</span>;
}
