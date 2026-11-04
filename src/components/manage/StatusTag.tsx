import type { BookingStatus } from "@/lib/booking/capacity";
import { Badge } from "@/components/ui/badge";
export default function StatusTag({ status }: { status: BookingStatus }) {
  return <Badge className="status-tag" data-status={status}>{status}</Badge>;
}
