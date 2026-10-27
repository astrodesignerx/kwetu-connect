import {
  bookedHours,
  isScreenHour,
  screenHourKey,
  type BookingRequest,
} from "./hours";
import { DEFAULT_SETTINGS, type BookingSettings } from "./settings";

export type BookingStatus =
  | "Quote"
  | "Paid"
  | "Approved"
  | "Live"
  | "Finished"
  | "Cancelled";

export type ExistingBooking = {
  id: string;
  advertiserId: string;
  status: BookingStatus;
  request: BookingRequest;
};

export type FullHour = {
  hour: string;
  reason: string;
};

export type CapacitySuggestion = {
  hour: string;
  suggestedHour: string | null;
};

export type CapacityResult = {
  ok: boolean;
  fullHours: FullHour[];
  suggestions: CapacitySuggestion[];
  largestHowOftenThatFits: number | null;
};

const STATUSES_THAT_HOLD_SPACE = new Set<BookingStatus>([
  "Paid",
  "Approved",
  "Live",
]);

function hourKeyParts(hour: string): { date: string; hourNumber: number } {
  const [date, hourPart] = hour.split("T");
  return { date, hourNumber: Number(hourPart) };
}

export function checkCapacity(
  request: BookingRequest,
  advertiserId: string,
  existing: ExistingBooking[],
  settings: BookingSettings = DEFAULT_SETTINGS
): CapacityResult {
  const requestHours = bookedHours(request, settings);
  const soldSeconds = new Map<string, number>();
  const advertiserPlays = new Map<string, number>();

  for (const booking of existing) {
    if (!STATUSES_THAT_HOLD_SPACE.has(booking.status)) continue;

    const seconds =
      booking.request.howOften * booking.request.lengthSeconds;
    for (const hour of bookedHours(booking.request, settings)) {
      soldSeconds.set(hour, (soldSeconds.get(hour) ?? 0) + seconds);
      if (booking.advertiserId === advertiserId) {
        advertiserPlays.set(
          hour,
          (advertiserPlays.get(hour) ?? 0) + booking.request.howOften
        );
      }
    }
  }

  if (requestHours.length === 0) {
    return {
      ok: false,
      fullHours: [],
      suggestions: [],
      largestHowOftenThatFits: null,
    };
  }

  const secondsNeeded = request.howOften * request.lengthSeconds;
  const requestHourSet = new Set(requestHours);
  const fullHours: FullHour[] = [];
  const suggestions: CapacitySuggestion[] = [];

  const fitsInHour = (hour: string) => {
    const sold = soldSeconds.get(hour) ?? 0;
    const plays = advertiserPlays.get(hour) ?? 0;
    return (
      sold + secondsNeeded <= settings.secondsForSalePerHour &&
      plays + request.howOften <= settings.maxPlaysPerAdvertiserPerHour
    );
  };

  for (const hour of requestHours) {
    const sold = soldSeconds.get(hour) ?? 0;
    const plays = advertiserPlays.get(hour) ?? 0;
    const screenFull = sold + secondsNeeded > settings.secondsForSalePerHour;
    const advertiserFull =
      plays + request.howOften > settings.maxPlaysPerAdvertiserPerHour;

    if (!screenFull && !advertiserFull) continue;

    const reason =
      screenFull && advertiserFull
        ? "The screen is full and this advertiser has the most plays allowed."
        : screenFull
          ? "The screen is fully sold in this hour."
          : "This advertiser already has the most plays allowed in this hour.";

    fullHours.push({ hour, reason });

    const { date, hourNumber } = hourKeyParts(hour);
    let suggestedHour: string | null = null;

    for (let distance = 1; distance < 24 && !suggestedHour; distance += 1) {
      const candidates = [hourNumber - distance, hourNumber + distance];
      for (const candidate of candidates) {
        if (candidate < 0 || candidate > 23) continue;
        const key = screenHourKey(date, candidate);
        if (requestHourSet.has(key)) continue;
        if (!isScreenHour(date, candidate, settings)) continue;
        if (!fitsInHour(key)) continue;
        suggestedHour = key;
        break;
      }
    }

    suggestions.push({ hour, suggestedHour });
  }

  const howOftenValues = [...new Set(settings.howOften.map((option) => option.plays))]
    .sort((a, b) => b - a);

  let largestHowOftenThatFits: number | null = null;
  for (const value of howOftenValues) {
    const seconds = value * request.lengthSeconds;
    const fitsEveryHour = requestHours.every((hour) => {
      const sold = soldSeconds.get(hour) ?? 0;
      const plays = advertiserPlays.get(hour) ?? 0;
      return (
        sold + seconds <= settings.secondsForSalePerHour &&
        plays + value <= settings.maxPlaysPerAdvertiserPerHour
      );
    });
    if (fitsEveryHour) {
      largestHowOftenThatFits = value;
      break;
    }
  }

  return {
    ok: fullHours.length === 0,
    fullHours,
    suggestions,
    largestHowOftenThatFits,
  };
}
