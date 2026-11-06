import type { Metadata } from "next";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import BookingQuote from "@/components/booking/BookingQuote";
import BookHeader from "@/components/workspace/BookHeader";
import { readAnswers } from "@/lib/booking/answers";
import { occupancyByDayBlock } from "@/lib/booking/occupancy";
import { addDays } from "@/lib/booking/hours";

export const metadata: Metadata = {
  title: "Book plays on our LED screen",
  description:
    "Choose the length, how often, days and time blocks for plays on the KCA LED screen and see the price before you send your quote.",
  alternates: { canonical: "/book" },
};

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = todayInNairobi();
  const store = getStore();
  const settings = await store.getSettings();
  const answers = readAnswers(params, today, settings);
  const occupancy = answers.endDate <= addDays(answers.startDate, 365)
    ? await store.occupancy(answers.startDate, answers.endDate)
    : occupancyByDayBlock([], answers.startDate, addDays(answers.startDate, 365), settings);
  // ?edit=<reference> changes an unpaid booking instead of starting a new one; anything else is a new quote.
  const editRef = typeof params.edit === "string" ? params.edit : "";
  const editBooking = editRef ? await store.publicBooking(editRef) : null;
  const editing = editBooking && editBooking.status === "Quote" && !editBooking.replacedBy
    ? { reference: editBooking.reference, priceKes: editBooking.priceKes } : null;
  return (
    <><BookHeader settings={settings} /><BookingQuote initialAnswers={answers} initialOccupancy={occupancy} today={today} settings={settings} editing={editing} /></>
  );
}
