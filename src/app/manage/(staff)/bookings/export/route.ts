import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { loadCards, parseFilters, visibleBookings } from "@/lib/booking/pipeline";
import { todayInNairobi } from "@/lib/store/validation";
import { toCsv } from "@/lib/format/csv";

const HEADERS = ["reference", "business", "status", "start date", "end date", "length seconds", "plays an hour", "plays", "price KES", "payment note"];

// The bookings the Bookings page shows for the same filters, as one CSV file.
export async function GET(request: NextRequest) {
  await requireStaff();
  const params = request.nextUrl.searchParams;
  const filter = parseFilters((key) => params.get(key) ?? "");
  const cards = await loadCards(getStore());
  const rows = visibleBookings(cards, filter, todayInNairobi()).map((booking) => [
    booking.reference, booking.business, booking.status, booking.request.startDate, booking.request.endDate,
    booking.request.lengthSeconds, booking.request.howOften, booking.plays, booking.priceKes, booking.paymentNote,
  ]);
  return new Response(toCsv([HEADERS, ...rows]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="bookings-${todayInNairobi()}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
