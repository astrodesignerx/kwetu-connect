import { bookedHours, isValidDate, type BookingRequest } from "./hours";
import { DEFAULT_SETTINGS, type BookingSettings } from "./settings";

export type NextDiscountStep = {
  minPlays: number;
  percent: number;
  playsNeeded: number;
};

export type QuoteSuccess = {
  ok: true;
  hoursBooked: number;
  plays: number;
  fullPriceKes: number;
  discountPercent: number;
  priceKes: number;
  perPlayKes: number;
  belowMinimum: boolean;
  nextStep: NextDiscountStep | null;
};

export type QuoteFailure = {
  ok: false;
  errors: string[];
};

export type Quote = QuoteSuccess | QuoteFailure;

export function quote(
  request: BookingRequest,
  settings: BookingSettings = DEFAULT_SETTINGS
): Quote {
  const errors: string[] = [];
  const lengthAvailable = settings.lengths.includes(request.lengthSeconds);
  const howOftenAvailable = settings.howOften.some(
    (option) => option.plays === request.howOften
  );
  const datesValid = isValidDate(request.startDate) && isValidDate(request.endDate);
  const datesInOrder = datesValid && request.startDate <= request.endDate;

  if (!lengthAvailable) errors.push("That length is not available.");
  if (!howOftenAvailable) errors.push("That how often choice is not available.");
  if (datesValid && !datesInOrder) {
    errors.push("The end date is before the start date.");
  }

  const hours = bookedHours(request, settings);

  if (datesInOrder && hours.length === 0) {
    errors.push("No screen hours are booked with these choices.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const hoursBooked = hours.length;
  const plays = request.howOften * hoursBooked;
  const fullPriceKes =
    plays * request.lengthSeconds * settings.kesPerSecond;
  const discountPercent =
    settings.discountSteps.find((step) => step.minPlays <= plays)?.percent ?? 0;
  const priceKes = Math.floor(
    (fullPriceKes * (100 - discountPercent)) / 100
  );
  const perPlayKes = Math.floor(priceKes / plays);
  const nextStep =
    settings.discountSteps
      .filter((step) => step.minPlays > plays)
      .sort((a, b) => a.minPlays - b.minPlays)[0] ?? null;

  return {
    ok: true,
    hoursBooked,
    plays,
    fullPriceKes,
    discountPercent,
    priceKes,
    perPlayKes,
    belowMinimum: priceKes < settings.minOrderKes,
    nextStep: nextStep
      ? {
          minPlays: nextStep.minPlays,
          percent: nextStep.percent,
          playsNeeded: nextStep.minPlays - plays,
        }
      : null,
  };
}
