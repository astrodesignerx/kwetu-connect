import type { Metadata } from "next";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import BookingQuote from "@/components/booking/BookingQuote";
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
  return (
    <BookingQuote initialAnswers={answers} initialOccupancy={occupancy} today={today} settings={settings} />
  );
}
