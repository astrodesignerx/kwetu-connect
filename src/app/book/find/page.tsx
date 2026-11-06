import type { Metadata } from "next";
import { getStore } from "@/lib/store";
import BookHeader from "@/components/workspace/BookHeader";
import FindBooking from "@/components/booking/FindBooking";

export const metadata: Metadata = { title: "Find your booking", robots: { index: false, follow: false }, alternates: { canonical: null } };

export default async function FindPage() {
  const settings = await getStore().getSettings();
  return <><BookHeader settings={settings} step={3} /><section className="booking-canvas find-page"><FindBooking /></section></>;
}
