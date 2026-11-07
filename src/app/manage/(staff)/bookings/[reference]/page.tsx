import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import BookingDetail from "@/components/manage/BookingDetail";
export default async function BookingPage({ params }: { params: Promise<{ reference: string }> }) {
  await requireStaff();
  const { reference } = await params;
  const store = getStore();
  const [detail, settings] = await Promise.all([store.bookingDetail(reference), store.getSettings()]);
  if (!detail) notFound();
  return <section className="v2-booking-full"><Link className="quiet-button" href="/manage/bookings">Back to bookings</Link><BookingDetail detail={detail} settings={settings} demo={store.mode === "memory"} /></section>;
}
