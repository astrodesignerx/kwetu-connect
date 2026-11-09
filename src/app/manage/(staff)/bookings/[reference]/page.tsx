import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { STATUSES } from "@/lib/booking/status";
import { todayInNairobi } from "@/lib/store/validation";
import BookingDetail from "@/components/manage/BookingDetail";
import PipelineMove from "@/components/manage/PipelineMove";
export default async function BookingPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff();
  const { reference } = await params;
  const { moveTo } = await searchParams;
  const store = getStore();
  const [detail, settings] = await Promise.all([store.bookingDetail(reference), store.getSettings()]);
  if (!detail) notFound();
  const today = todayInNairobi();
  const target = STATUSES.find((stage) => stage === moveTo);
  return <section className="v2-booking-full"><Link className="quiet-button" href="/manage/bookings">Back to bookings</Link><BookingDetail detail={detail} settings={settings} demo={store.mode === "memory"} today={today} moveBase={"/manage/bookings/" + encodeURIComponent(reference) + "?"}
    confirm={target ? <PipelineMove key={detail.booking.reference + target} detail={detail} target={target} settings={settings} today={today} /> : undefined} /></section>;
}
