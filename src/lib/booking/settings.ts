export type BlockId = "morning" | "midday" | "afternoon" | "evening" | "late";

export type DiscountStep = {
  minPlays: number;
  percent: number;
};

export type HowOftenOption = {
  plays: number;
  label: string;
};

export type TimeBlock = {
  startHour: number;
  endHour: number;
  label: string;
};

export type ScreenHours = {
  open: number;
  close: number;
};

export type BookingSettings = {
  kesPerSecond: number;
  discountSteps: DiscountStep[];
  minOrderKes: number;
  secondsForSalePerHour: number;
  maxPlaysPerAdvertiserPerHour: number;
  lengths: number[];
  howOften: HowOftenOption[];
  screenHours: Record<number, ScreenHours>;
  timeBlocks: Record<BlockId, TimeBlock>;
  leadWorkingDays: number;
  publicHolidays: string[];
};

export const DEFAULT_SETTINGS: BookingSettings = {
  kesPerSecond: 1,
  discountSteps: [
    { minPlays: 10000, percent: 30 },
    { minPlays: 5000, percent: 20 },
    { minPlays: 1000, percent: 10 },
  ],
  minOrderKes: 3000,
  secondsForSalePerHour: 2700,
  maxPlaysPerAdvertiserPerHour: 20,
  lengths: [5, 10, 15, 20, 30],
  howOften: [
    { plays: 1, label: "Once an hour" },
    { plays: 2, label: "Every 30 minutes" },
    { plays: 4, label: "Every 15 minutes" },
    { plays: 6, label: "Every 10 minutes" },
    { plays: 10, label: "Every 6 minutes" },
    { plays: 20, label: "Every 3 minutes" },
  ],
  screenHours: {
    0: { open: 6, close: 24 },
    1: { open: 6, close: 22 },
    2: { open: 6, close: 22 },
    3: { open: 6, close: 22 },
    4: { open: 6, close: 22 },
    5: { open: 6, close: 24 },
    6: { open: 6, close: 24 },
  },
  timeBlocks: {
    morning: { startHour: 6, endHour: 10, label: "Morning" },
    midday: { startHour: 10, endHour: 14, label: "Midday" },
    afternoon: { startHour: 14, endHour: 18, label: "Afternoon" },
    evening: { startHour: 18, endHour: 22, label: "Evening" },
    late: { startHour: 22, endHour: 24, label: "Late" },
  },
  leadWorkingDays: 2,
  publicHolidays: [],
};
