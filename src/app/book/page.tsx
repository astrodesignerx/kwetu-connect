import type { Metadata } from "next";
import BookingQuote from "@/components/booking/BookingQuote";

export const metadata: Metadata = {
  title: "Book plays on our LED screen",
  description:
    "Choose the length, how often, days and time blocks for plays on the KCA LED screen and see the price before you send your quote.",
  alternates: { canonical: "/book" },
};

function todayInNairobi(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? "01";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <BookingQuote initialParams={params} today={todayInNairobi()} />
  );
}
