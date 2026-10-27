import type { PublicBooking } from "@/lib/store/types";
import type { BookingSettings } from "@/lib/booking/settings";
import type { CapacityResult } from "@/lib/booking/capacity";

export function BookingSummary({ booking: b, settings }: { booking: Pick<PublicBooking, "request" | "plays" | "fullPriceKes" | "discountPercent" | "priceKes">; settings: BookingSettings }) {
  const r = b.request;
  const rows = [
    ["Length", `${r.lengthSeconds} seconds`], ["How often", `${r.howOften} plays an hour`],
    ["Days", r.days.map((d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]).join(", ")],
    ["Time blocks", r.blocks.map((id) => settings.timeBlocks[id].label).join(", ")],
    ["Dates", `${r.startDate} to ${r.endDate}`], ["Plays", b.plays.toLocaleString("en-GB")],
    ["Full price", `KES ${b.fullPriceKes.toLocaleString("en-GB")}`], ["Discount", `${b.discountPercent}%`], ["Price", `KES ${b.priceKes.toLocaleString("en-GB")}`],
  ];
  return <dl className="divide-y divide-gray-200">{rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2 py-2"><dt>{label}</dt><dd className="max-w-full text-right font-semibold">{value}</dd></div>)}</dl>;
}
export function CapacityNotice({ capacity }: { capacity: CapacityResult }) {
  if (capacity.ok) return <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900">Space is available now. KCA checks again when payment is marked.</p>;
  return <div className="space-y-2 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
    <p className="font-semibold">Some screen hours are full. This Quote is saved. KCA can help you choose other hours before payment.</p>
    <details><summary>Full hours and suggestions ({capacity.fullHours.length})</summary>
      <ul className="mt-2 space-y-2">{capacity.fullHours.map((h) => <li key={h.hour}>{h.hour.replace("T", " at ")}:00. {h.reason} {capacity.suggestions.find((s) => s.hour === h.hour)?.suggestedHour ? `Try ${capacity.suggestions.find((s) => s.hour === h.hour)!.suggestedHour!.replace("T", " at ")}:00.` : "Ask KCA about another day."}</li>)}</ul>
    </details>
    {capacity.largestHowOftenThatFits !== null && <p>{capacity.largestHowOftenThatFits} plays an hour would fit.</p>}
  </div>;
}
