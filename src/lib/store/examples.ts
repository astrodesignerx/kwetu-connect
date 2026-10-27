import type { BookingRequest } from "../booking/hours";
const allBlocks: BookingRequest["blocks"] = ["morning", "midday", "afternoon", "evening", "late"];
export const RULEBOOK_EXAMPLES: { name: string; request: BookingRequest }[] = [
  { name: "Small shop", request: { lengthSeconds: 10, howOften: 10, days: [6], blocks: ["morning", "midday"], startDate: "2026-11-02", endDate: "2026-11-29" } },
  { name: "Growing business", request: { lengthSeconds: 15, howOften: 10, days: [5, 6, 0], blocks: allBlocks, startDate: "2026-11-02", endDate: "2026-11-15" } },
  { name: "Large organisation", request: { lengthSeconds: 15, howOften: 10, days: [0, 1, 2, 3, 4, 5, 6], blocks: allBlocks, startDate: "2026-11-02", endDate: "2027-01-24" } },
];
