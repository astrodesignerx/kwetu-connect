import type { Metadata } from "next";
import { getStore } from "@/lib/store";
import { todayInNairobi } from "@/lib/store/validation";
import BookingQuote from "@/components/booking/BookingQuote";

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

  return (
    <BookingQuote initialParams={params} today={todayInNairobi()} settings={await getStore().getSettings()} />
  );
}
