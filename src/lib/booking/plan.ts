import {
  addDays,
  isValidDate,
  type BookingRequest,
} from "./hours";
import { quote, type QuoteSuccess } from "./quote";
import {
  DEFAULT_SETTINGS,
  type BlockId,
  type BookingSettings,
} from "./settings";

export type PlanTarget = { budgetKes: number } | { plays: number };

export type PlanPreferences = {
  lengthSeconds: number;
  startDate: string;
  days?: number[];
  blocks?: BlockId[];
};

export type PlanSuccess = {
  ok: true;
  request: BookingRequest;
  quote: QuoteSuccess;
};

export type PlanFailure = {
  ok: false;
  reason: string;
};

export type PlanResult = PlanSuccess | PlanFailure;

type Candidate = {
  request: BookingRequest;
  quote: QuoteSuccess;
  weeks: number;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const ALL_BLOCKS: BlockId[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "late",
];
const MAX_WEEKS = 12;

function weeksFromFour(candidate: Candidate): number {
  return Math.abs(candidate.weeks - 4);
}

function isBetterBudgetCandidate(
  candidate: Candidate,
  best: Candidate
): boolean {
  if (candidate.quote.plays !== best.quote.plays) {
    return candidate.quote.plays > best.quote.plays;
  }
  if (weeksFromFour(candidate) !== weeksFromFour(best)) {
    return weeksFromFour(candidate) < weeksFromFour(best);
  }
  return candidate.request.howOften > best.request.howOften;
}

function isBetterPlaysCandidate(
  candidate: Candidate,
  best: Candidate
): boolean {
  if (candidate.quote.priceKes !== best.quote.priceKes) {
    return candidate.quote.priceKes < best.quote.priceKes;
  }
  if (weeksFromFour(candidate) !== weeksFromFour(best)) {
    return weeksFromFour(candidate) < weeksFromFour(best);
  }
  return candidate.request.howOften > best.request.howOften;
}

export function suggestPlan(
  target: PlanTarget,
  prefs: PlanPreferences,
  settings: BookingSettings = DEFAULT_SETTINGS
): PlanResult {
  if (!settings.lengths.includes(prefs.lengthSeconds)) {
    return { ok: false, reason: "That length is not available." };
  }
  if (!isValidDate(prefs.startDate)) {
    return { ok: false, reason: "Use a valid start date." };
  }

  if ("budgetKes" in target) {
    if (
      !Number.isFinite(target.budgetKes) ||
      !Number.isInteger(target.budgetKes) ||
      target.budgetKes <= 0
    ) {
      return { ok: false, reason: "Enter a budget in KES." };
    }
    if (target.budgetKes < settings.minOrderKes) {
      return {
        ok: false,
        reason: `That budget is below the smallest order of KES ${settings.minOrderKes.toLocaleString("en-US")}.`,
      };
    }
  } else if (
    !Number.isFinite(target.plays) ||
    !Number.isInteger(target.plays) ||
    target.plays <= 0
  ) {
    return { ok: false, reason: "Enter how many plays you need." };
  }

  const days = prefs.days ?? ALL_DAYS;
  const blocks = prefs.blocks ?? ALL_BLOCKS;
  const howOftenValues = settings.howOften.map((option) => option.plays);
  let best: Candidate | null = null;

  for (let weeks = 1; weeks <= MAX_WEEKS; weeks += 1) {
    const endDate = addDays(prefs.startDate, weeks * 7 - 1);

    for (const howOften of howOftenValues) {
      const request: BookingRequest = {
        lengthSeconds: prefs.lengthSeconds,
        howOften,
        days,
        blocks,
        startDate: prefs.startDate,
        endDate,
      };
      const result = quote(request, settings);
      if (!result.ok) continue;

      if ("budgetKes" in target) {
        if (
          result.priceKes > target.budgetKes ||
          result.priceKes < settings.minOrderKes
        ) {
          continue;
        }
      } else if (result.plays < target.plays) {
        continue;
      }

      const candidate: Candidate = { request, quote: result, weeks };
      if (
        best === null ||
        ("budgetKes" in target
          ? isBetterBudgetCandidate(candidate, best)
          : isBetterPlaysCandidate(candidate, best))
      ) {
        best = candidate;
      }
    }
  }

  if (best === null) {
    return {
      ok: false,
      reason:
        "budgetKes" in target
          ? "No quote fits that budget."
          : "No quote reaches that number of plays.",
    };
  }

  return { ok: true, request: best.request, quote: best.quote };
}
