import { addDays, weekdayOf, type BookingRequest } from "../booking/hours";
import { quote } from "../booking/quote";
import { DEFAULT_SETTINGS, type BlockId } from "../booking/settings";
import type { BookingStatus } from "../booking/capacity";
import { emptyData, type StoreData } from "./base";

/**
 * Made-up bookings for showing the manager area to a client: about 79% of this
 * week's saleable time sold (KCA_DEMO_DATA=1), or about 70% of the whole calendar month
 * (KCA_DEMO_DATA=month70). Memory mode only; it never touches Supabase.
 * Every business, name and phone number here is invented.
 */
const ALL: BlockId[] = ["morning", "midday", "afternoon", "evening", "late"];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [5, 6, 0];

type Plan = {
  business: string; name: string; length: number; often: number; days: number[]; blocks: BlockId[];
  status: BookingStatus; start: number; weeks: number; createdDaysAgo: number;
  advert?: "approved" | "waiting"; paymentNote?: string;
};
// start is days from this week's Monday. Live bookings span the whole week, so the share holds on any day.
const PLANS: Plan[] = [
  { business: "Eldo Fresh Supermarket", name: "Grace Wanjiru", length: 20, often: 10, days: EVERY_DAY, blocks: ALL, status: "Live", start: -21, weeks: 9, createdDaysAgo: 40, advert: "approved" },
  { business: "Highland Dairies", name: "Peter Kiprop", length: 15, often: 20, days: EVERY_DAY, blocks: ALL, status: "Live", start: -14, weeks: 8, createdDaysAgo: 33, advert: "approved" },
  { business: "Kerio Valley Sacco", name: "Ann Jepkosgei", length: 30, often: 6, days: EVERY_DAY, blocks: ALL, status: "Live", start: -28, weeks: 12, createdDaysAgo: 45, advert: "approved" },
  { business: "Sosiani Pharmacy", name: "David Otieno", length: 15, often: 10, days: EVERY_DAY, blocks: ALL, status: "Live", start: -7, weeks: 6, createdDaysAgo: 24, advert: "approved" },
  { business: "Rift Motors", name: "Brian Kibet", length: 30, often: 10, days: EVERY_DAY, blocks: ALL, status: "Live", start: -14, weeks: 10, createdDaysAgo: 30, advert: "approved" },
  { business: "Kapsoya Hardware", name: "Mercy Chebet", length: 10, often: 20, days: EVERY_DAY, blocks: ALL, status: "Live", start: -7, weeks: 5, createdDaysAgo: 19, advert: "approved" },
  { business: "Mjini Phones", name: "Kevin Mutai", length: 20, often: 6, days: EVERY_DAY, blocks: ALL, status: "Live", start: -21, weeks: 8, createdDaysAgo: 36, advert: "approved" },
  { business: "Fikra Insurance", name: "Lucy Achieng", length: 30, often: 6, days: EVERY_DAY, blocks: ALL, status: "Live", start: 0, weeks: 6, createdDaysAgo: 12, advert: "approved" },
  { business: "Safari Line Shuttles", name: "Joseph Rono", length: 20, often: 20, days: WEEKDAYS, blocks: ["morning", "evening"], status: "Live", start: -14, weeks: 6, createdDaysAgo: 27, advert: "approved" },
  { business: "Chebisaas Academy", name: "Ruth Jelagat", length: 15, often: 20, days: WEEKDAYS, blocks: ["morning", "midday"], status: "Live", start: -7, weeks: 4, createdDaysAgo: 17, advert: "approved" },
  { business: "Signal Lounge", name: "Victor Langat", length: 30, often: 20, days: [4, 5, 6, 0], blocks: ["evening", "late"], status: "Live", start: -14, weeks: 8, createdDaysAgo: 26, advert: "approved" },
  { business: "Mega Home Furniture", name: "Faith Njeri", length: 20, often: 20, days: WEEKEND, blocks: ["midday", "afternoon"], status: "Live", start: 0, weeks: 4, createdDaysAgo: 9, advert: "approved" },
  { business: "Baraka Medical Centre", name: "Samuel Korir", length: 10, often: 20, days: EVERY_DAY, blocks: ["afternoon"], status: "Live", start: -7, weeks: 6, createdDaysAgo: 15, advert: "approved" },
  { business: "Mwangaza Supplies", name: "Esther Moraa", length: 10, often: 10, days: [1, 2, 3, 4], blocks: ["midday", "afternoon"], status: "Live", start: 0, weeks: 3, createdDaysAgo: 8, advert: "approved" },
  // Next week onwards: these fill the "Starting soon" and "Needs you" tiles without changing this week's share.
  { business: "Kapseret Gardens", name: "John Kiplagat", length: 15, often: 10, days: WEEKDAYS, blocks: ["afternoon"], status: "Approved", start: 8, weeks: 4, createdDaysAgo: 4, advert: "approved" },
  { business: "Nandi Hills Tea Room", name: "Agnes Jeptoo", length: 10, often: 6, days: [6, 0], blocks: ["midday"], status: "Paid", start: 12, weeks: 4, createdDaysAgo: 2, advert: "waiting", paymentNote: "M-Pesa QKT4H7XZ2P" },
  { business: "Ziwa Bakery", name: "Daniel Cheruiyot", length: 5, often: 20, days: WEEKDAYS, blocks: ["morning"], status: "Paid", start: 9, weeks: 3, createdDaysAgo: 1, paymentNote: "M-Pesa QKS9L2MN4R" },
  { business: "Chepkanga Car Wash", name: "Moses Kemboi", length: 10, often: 10, days: [6], blocks: ["midday", "afternoon"], status: "Quote", start: 12, weeks: 4, createdDaysAgo: 1, paymentNote: "M-Pesa QKV1B8RT6W" },
  { business: "Kimumu Events", name: "Sharon Wambui", length: 15, often: 6, days: [5, 6], blocks: ["evening"], status: "Quote", start: 11, weeks: 3, createdDaysAgo: 0 },
  { business: "Lakeside Salon", name: "Irene Nafula", length: 10, often: 4, days: [6, 0], blocks: ["midday", "afternoon"], status: "Quote", start: 13, weeks: 4, createdDaysAgo: 3 },
  { business: "Rotich Electronics", name: "Paul Rotich", length: 20, often: 10, days: EVERY_DAY, blocks: ALL, status: "Finished", start: -49, weeks: 4, createdDaysAgo: 60, advert: "approved" },
  { business: "Uzuri Boutique", name: "Janet Akinyi", length: 10, often: 6, days: [6], blocks: ["afternoon"], status: "Cancelled", start: 5, weeks: 2, createdDaysAgo: 6 },
];
const STEPS: BookingStatus[] = ["Quote", "Paid", "Approved", "Live", "Finished"];

// The "month70" scenario leaves these out (together about 9% of a week), so the Live bookings
// sell about 70% of every week, then stretches each Live booking over the whole calendar month.
const LEFT_OUT_FOR_MONTH70 = new Set(["Mjini Phones", "Chebisaas Academy", "Mwangaza Supplies"]);
export type DemoScenario = "week" | "month70";

export function demoData(today: string, scenario: DemoScenario = "week"): StoreData {
  const data = emptyData();
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  // Monday on or before the 1st, and Sunday on or after the last day, so every week of the month is covered.
  const monthStart = today.slice(0, 8) + "01";
  const monthEnd = addDays(addDays(monthStart, 31).slice(0, 8) + "01", -1);
  const monthMonday = addDays(monthStart, -((weekdayOf(monthStart) + 6) % 7));
  const monthSunday = addDays(monthEnd, (7 - weekdayOf(monthEnd)) % 7);
  const at = (daysAgo: number, hour = 9) => new Date(Date.parse(addDays(today, -daysAgo) + "T00:00:00Z") + (hour - 3) * 3600000).toISOString();
  PLANS.forEach((plan, index) => {
    if (scenario === "month70" && LEFT_OUT_FOR_MONTH70.has(plan.business)) return;
    const n = index + 1;
    const request: BookingRequest = { lengthSeconds: plan.length, howOften: plan.often, days: plan.days, blocks: plan.blocks,
      startDate: addDays(monday, plan.start), endDate: addDays(monday, plan.start + plan.weeks * 7 - 1) };
    if (scenario === "month70" && plan.status === "Live") {
      if (request.startDate > monthMonday) request.startDate = monthMonday;
      if (request.endDate < monthSunday) request.endDate = monthSunday;
    }
    const priced = quote(request, DEFAULT_SETTINGS);
    if (!priced.ok) throw new Error(`Demo booking ${plan.business} does not price: ${priced.errors.join(" ")}`);
    const created = at(plan.createdDaysAgo, 8 + (n % 9));
    const advertiserId = `demo-advertiser-${n}`;
    const bookingId = `demo-booking-${n}`;
    data.advertisers.push({ id: advertiserId, name: plan.name, phone: `2547000001${String(n).padStart(2, "0")}`,
      email: `${plan.name.split(" ")[0].toLowerCase()}@example.com`, business: plan.business, paysBy: priced.priceKes >= 50000 && n % 3 === 0 ? "invoice" : "now", createdAt: created });
    data.bookings.push({ id: bookingId, advertiserId, reference: `KCA-DE40${n.toString(16).toUpperCase().padStart(12, "0")}`, request,
      plays: priced.plays, fullPriceKes: priced.fullPriceKes, discountPercent: priced.discountPercent, priceKes: priced.priceKes,
      status: plan.status, paymentNote: plan.paymentNote ?? (["Paid", "Approved", "Live", "Finished"].includes(plan.status) ? `M-Pesa QK${n}DEMO${n * 7}` : ""),
      createdAt: created, updatedAt: created });
    if (plan.advert) data.adverts.push({ id: `demo-advert-${n}`, bookingId, filePath: "", fileName: `${plan.business.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${plan.length}s.mp4`,
      seconds: plan.length, decision: plan.advert, reason: "", createdAt: created });
    // History up to the current status, a day apart, so the booking detail shows a believable trail.
    const path = plan.status === "Cancelled" ? ["Quote", "Cancelled"] as BookingStatus[] : STEPS.slice(0, STEPS.indexOf(plan.status) + 1);
    path.slice(1).forEach((to, step) => data.history.push({ id: `demo-history-${n}-${step}`, bookingId, fromStatus: path[step], toStatus: to,
      staffEmail: "staff@example.com", note: to === "Cancelled" ? "Customer changed plans." : "", createdAt: at(Math.max(0, plan.createdDaysAgo - step - 1), 11) }));
  });
  return data;
}
