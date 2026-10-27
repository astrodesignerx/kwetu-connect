"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import AnimatedItem from "@/components/AnimatedItem";
import AnimatedSection from "@/components/AnimatedSection";
import BookingForm from "./BookingForm";
import {
  addDays,
  earliestStartDate,
  formatHour,
  isValidDate,
  type BookingRequest,
} from "@/lib/booking/hours";
import { suggestPlan } from "@/lib/booking/plan";
import { quote } from "@/lib/booking/quote";
import {
  type BookingSettings,
  type BlockId,
} from "@/lib/booking/settings";

type SearchValue = string | string[] | undefined;
type SearchParams = Record<string, SearchValue>;

type Answers = {
  lengthSeconds: number;
  howOften: number;
  days: number[];
  blocks: BlockId[];
  startDate: string;
  endDate: string;
};

type BudgetMessage = {
  tone: "info" | "error";
  text: string;
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BLOCK_ORDER: BlockId[] = [
  "morning",
  "midday",
  "afternoon",
  "evening",
  "late",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const CARD_CLASS =
  "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6";

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normaliseDays(days: number[]): number[] {
  const chosen = new Set(
    days.filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6
    )
  );
  return DAY_ORDER.filter((day) => chosen.has(day));
}

function isBlockId(value: string): value is BlockId {
  return BLOCK_ORDER.includes(value as BlockId);
}

function normaliseBlocks(blocks: BlockId[]): BlockId[] {
  const chosen = new Set(blocks);
  return BLOCK_ORDER.filter((block) => chosen.has(block));
}

function readAnswers(params: SearchParams, today: string, settings: BookingSettings): Answers {
  const earliest = earliestStartDate(today, settings);
  const lengthValue = Number(readParam(params, "len"));
  const lengthSeconds = settings.lengths.includes(lengthValue)
    ? lengthValue
    : (settings.lengths.includes(10) ? 10 : settings.lengths[0]);
  const oftenValue = Number(readParam(params, "often"));
  const howOften = settings.howOften.some(
    (option) => option.plays === oftenValue
  )
    ? oftenValue
    : (settings.howOften.some((o) => o.plays === 10) ? 10 : settings.howOften[0].plays);

  const daysValue = readParam(params, "days");
  const days =
    daysValue === undefined
      ? [6]
      : normaliseDays(parseList(daysValue).map(Number));

  const blocksValue = readParam(params, "blocks");
  const blocks =
    blocksValue === undefined
      ? (["morning", "midday"] as BlockId[])
      : normaliseBlocks(parseList(blocksValue).filter(isBlockId));

  const fromValue = readParam(params, "from");
  const requestedStart =
    fromValue && isValidDate(fromValue) ? fromValue : earliest;
  const startDate = requestedStart < earliest ? earliest : requestedStart;

  // `weeks` lets a link ask for whole weeks from the earliest start, so it never goes stale.
  const toValue = readParam(params, "to");
  const weeksValue = Number(readParam(params, "weeks"));
  const weeks =
    Number.isInteger(weeksValue) && weeksValue >= 1 && weeksValue <= 52
      ? weeksValue
      : 4;
  const endDate =
    toValue && isValidDate(toValue) && toValue >= startDate
      ? toValue
      : addDays(startDate, 7 * weeks - 1);

  return {
    lengthSeconds,
    howOften,
    days,
    blocks,
    startDate,
    endDate,
  };
}

function buildQuery(answers: Answers): string {
  return `len=${answers.lengthSeconds}&often=${answers.howOften}&days=${answers.days.join(",")}&blocks=${answers.blocks.join(",")}&from=${answers.startDate}&to=${answers.endDate}`;
}

function formatNumber(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatKes(value: number): string {
  return `KES ${formatNumber(value)}`;
}

function formatPerPlay(value: number): string {
  return Number.isInteger(value) ? formatKes(value) : `KES ${value.toFixed(2)}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function blockHours(block: BlockId, settings: BookingSettings): string {
  const hours = settings.timeBlocks[block];
  return `${formatHour(hours.startHour)} to ${formatHour(hours.endHour)}`;
}

function QuestionHeading({
  step,
  kicker,
  title,
}: {
  step: string;
  kicker: string;
  title: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[0.6875rem] font-bold text-brand-500">
          {step}
        </span>
        <span className="section-label text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-brand-700">
          {kicker}
        </span>
      </div>
      <h2 className="mt-3 text-xl font-bold tracking-[-0.01em] text-black sm:text-2xl">
        {title}
      </h2>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-12 items-center justify-center rounded-xl border px-2.5 py-2.5 text-center transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none ${
        selected
          ? "-translate-y-0.5 border-brand-600 bg-brand-500 text-black shadow-sm"
          : "border-gray-300 bg-white text-gray-800 hover:border-brand-500 hover:bg-brand-50"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-semibold text-gray-900">
        {value}
      </span>
    </div>
  );
}

export default function BookingQuote({
  initialParams,
  today,
  settings,
}: {
  initialParams: SearchParams;
  today: string;
  settings: BookingSettings;
}) {
  const [answers, setAnswers] = useState<Answers>(() =>
    readAnswers(initialParams, today, settings)
  );
  const [bookOpen, setBookOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetMessage, setBudgetMessage] = useState<BudgetMessage | null>(
    null
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  const query = buildQuery(answers);
  const earliest = useMemo(() => earliestStartDate(today, settings), [today, settings]);

  useEffect(() => {
    const nextUrl = `${window.location.pathname}?${query}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [query]);

  const request = useMemo<BookingRequest>(
    () => ({
      lengthSeconds: answers.lengthSeconds,
      howOften: answers.howOften,
      days: answers.days,
      blocks: answers.blocks,
      startDate: answers.startDate,
      endDate: answers.endDate,
    }),
    [answers]
  );

  const result = useMemo(() => quote(request, settings), [request, settings]);
  const signature = result.ok
    ? `${result.plays}-${result.priceKes}-${result.hoursBooked}-${result.discountPercent}`
    : result.errors.join("|");

  const nextStepIsNear =
    result.ok &&
    result.nextStep !== null &&
    result.nextStep.playsNeeded <= result.nextStep.minPlays * 0.25;

  const onlyLate =
    answers.blocks.length === 1 && answers.blocks[0] === "late";

  function change(partial: Partial<Answers>) {
    setAnswers((current) => ({ ...current, ...partial }));
    setBudgetMessage(null);
  }

  function toggleDay(day: number) {
    const chosen = answers.days.includes(day)
      ? answers.days.filter((value) => value !== day)
      : [...answers.days, day];
    change({ days: normaliseDays(chosen) });
  }

  function toggleBlock(block: BlockId) {
    const chosen = answers.blocks.includes(block)
      ? answers.blocks.filter((value) => value !== block)
      : [...answers.blocks, block];
    change({ blocks: normaliseBlocks(chosen) });
  }

  function updateStartDate(value: string) {
    if (!isValidDate(value)) return;
    const startDate = value < earliest ? earliest : value;
    const endDate =
      answers.endDate < startDate ? addDays(startDate, 27) : answers.endDate;
    change({ startDate, endDate });
  }

  function updateEndDate(value: string) {
    if (!isValidDate(value)) return;
    change({ endDate: value });
  }

  function applyBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const budgetKes = Math.floor(Number(budgetInput));

    if (!Number.isFinite(budgetKes) || budgetKes <= 0) {
      setBudgetMessage({ tone: "error", text: "Enter a budget in KES." });
      return;
    }

    const suggested = suggestPlan(
      { budgetKes },
      { lengthSeconds: answers.lengthSeconds, startDate: answers.startDate },
      settings
    );

    if (!suggested.ok) {
      setBudgetMessage({ tone: "error", text: suggested.reason });
      return;
    }

    setAnswers({
      lengthSeconds: suggested.request.lengthSeconds,
      howOften: suggested.request.howOften,
      days: normaliseDays(suggested.request.days),
      blocks: normaliseBlocks(suggested.request.blocks),
      startDate: suggested.request.startDate,
      endDate: suggested.request.endDate,
    });
    setBudgetMessage({
      tone: "info",
      text: `We filled in ${formatNumber(suggested.quote.plays)} plays for ${formatKes(suggested.quote.priceKes)}.`,
    });
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?${query}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  function sendQuote() { setBookOpen(true); }

  return (
    <>
      <section className="relative overflow-hidden bg-ink pb-14 pt-[calc(7rem+30px)] text-white lg:pb-20 lg:pt-[calc(9rem+30px)]">
        <div
          className="absolute inset-0 grid-pattern opacity-70"
          aria-hidden="true"
        />
        <div
          className="absolute -right-24 top-16 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <span className="section-label mb-5 inline-block text-xs font-semibold uppercase tracking-[0.15em] text-brand-500">
            Book plays
          </span>
          <h1 className="max-w-3xl text-[2rem] font-extrabold leading-tight tracking-[-0.02em] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem]">
            See the number
            <br />
            <span className="italic text-brand-500">before</span> you ask.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-gray-300 sm:text-base">
            Choose the length, how often it plays, the days and the time
            blocks. The price updates with every answer.
          </p>
          <p className="mt-4 text-xs leading-relaxed text-gray-400">
            Screen hours: {DAY_ORDER.map((day) => `${DAY_SHORT[day]} ${formatHour(settings.screenHours[day].open)} to ${formatHour(settings.screenHours[day].close)}`).join(". ")}.
          </p>
        </div>
      </section>

      <AnimatedSection className="bg-white py-12 text-black lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
            <div className="min-w-0 space-y-5">
              <AnimatedItem delay={1}>
                <fieldset className={CARD_CLASS}>
                  <legend className="sr-only">
                    How long is your advert?
                  </legend>
                  <QuestionHeading
                    step="01"
                    kicker="Length"
                    title="How long is your advert?"
                  />
                  <div className="mt-5 grid grid-cols-5 gap-2">
                    {settings.lengths.map((length) => (
                      <ChoiceButton
                        key={length}
                        selected={answers.lengthSeconds === length}
                        onClick={() => change({ lengthSeconds: length })}
                      >
                        <span className="text-lg font-bold leading-none">
                          {length}s
                        </span>
                      </ChoiceButton>
                    ))}
                  </div>
                </fieldset>
              </AnimatedItem>

              <AnimatedItem delay={2}>
                <fieldset className={CARD_CLASS}>
                  <legend className="sr-only">
                    How often should it play?
                  </legend>
                  <QuestionHeading
                    step="02"
                    kicker="How often"
                    title="How often should it play?"
                  />
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {settings.howOften.map((option) => (
                      <ChoiceButton
                        key={option.plays}
                        selected={answers.howOften === option.plays}
                        onClick={() => change({ howOften: option.plays })}
                      >
                        <span className="text-sm font-semibold">
                          {option.label}
                        </span>
                      </ChoiceButton>
                    ))}
                  </div>
                </fieldset>
              </AnimatedItem>

              <AnimatedItem delay={3}>
                <fieldset className={CARD_CLASS}>
                  <legend className="sr-only">When should it play?</legend>
                  <QuestionHeading
                    step="03"
                    kicker="Time blocks"
                    title="When should it play?"
                  />
                  <div className="mt-5">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
                      Days
                    </span>
                    <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {DAY_ORDER.map((day) => (
                        <ChoiceButton
                          key={day}
                          selected={answers.days.includes(day)}
                          onClick={() => toggleDay(day)}
                          className="px-1 text-xs font-semibold"
                        >
                          {DAY_SHORT[day]}
                        </ChoiceButton>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5">
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
                      Time blocks
                    </span>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {BLOCK_ORDER.map((block) => (
                        <ChoiceButton
                          key={block}
                          selected={answers.blocks.includes(block)}
                          onClick={() => toggleBlock(block)}
                          className="flex-col items-start px-3 text-left"
                        >
                          <span className="text-sm font-semibold">
                            {settings.timeBlocks[block].label}
                          </span>
                          <span className="mt-0.5 text-[0.625rem] font-normal text-black/60">
                            {blockHours(block, settings)}
                          </span>
                        </ChoiceButton>
                      ))}
                    </div>
                  </div>
                </fieldset>
              </AnimatedItem>

              <AnimatedItem delay={4}>
                <fieldset className={CARD_CLASS}>
                  <legend className="sr-only">From when to when?</legend>
                  <QuestionHeading
                    step="04"
                    kicker="Dates"
                    title="From when to when?"
                  />
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
                        Start date
                      </span>
                      <input
                        type="date"
                        value={answers.startDate}
                        min={earliest}
                        onChange={(event) =>
                          updateStartDate(event.target.value)
                        }
                        className="min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 transition-[border-color,box-shadow] duration-200 ease-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 motion-reduce:transition-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-wider text-gray-500">
                        End date
                      </span>
                      <input
                        type="date"
                        value={answers.endDate}
                        min={answers.startDate}
                        onChange={(event) =>
                          updateEndDate(event.target.value)
                        }
                        className="min-h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 transition-[border-color,box-shadow] duration-200 ease-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 motion-reduce:transition-none"
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-gray-500">
                    The earliest start is {formatDate(earliest)}.
                  </p>
                </fieldset>
              </AnimatedItem>

              <AnimatedItem delay={5}>
                <form
                  onSubmit={applyBudget}
                  className="rounded-2xl border border-brand-200 bg-brand-50 p-5 sm:p-6"
                >
                  <label
                    htmlFor="budget"
                    className="section-label block text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-brand-800"
                  >
                    Start from a budget
                  </label>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">
                    We will fill the four answers for you. You can change them
                    after.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                        KES
                      </span>
                      <input
                        id="budget"
                        type="number"
                        inputMode="numeric"
                        min={settings.minOrderKes}
                        step={1000}
                        value={budgetInput}
                        onChange={(event) =>
                          setBudgetInput(event.target.value)
                        }
                        placeholder="10000"
                        className="min-h-12 w-full rounded-xl border border-brand-200 bg-white pl-14 pr-4 text-sm font-semibold text-gray-900 transition-[border-color,box-shadow] duration-200 ease-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 motion-reduce:transition-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn-sweep inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition-[transform,opacity] duration-200 ease-out hover:bg-black active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
                    >
                      Use this budget
                    </button>
                  </div>
                  <p
                    aria-live="polite"
                    className={`mt-3 min-h-5 text-sm leading-relaxed ${
                      budgetMessage?.tone === "error"
                        ? "text-red-700"
                        : "text-brand-900"
                    }`}
                  >
                    {budgetMessage?.text ?? ""}
                  </p>
                </form>
              </AnimatedItem>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-28">
              <AnimatedItem delay={2}>
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="bg-ink p-6 text-white">
                    <span className="section-label text-[0.6875rem] font-semibold uppercase tracking-[0.15em] text-brand-500">
                      Your quote
                    </span>

                    {result.ok ? (
                      <div
                        key={signature}
                        className="animate-quote-in motion-reduce:animate-none"
                      >
                        <div className="mt-4">
                          <p className="text-[0.6875rem] uppercase tracking-wider text-gray-400">
                            Plays
                          </p>
                          <p className="mt-1 text-5xl font-extrabold leading-none tracking-[-0.03em]">
                            {formatNumber(result.plays)}
                          </p>
                          <p className="mt-4 text-[0.6875rem] uppercase tracking-wider text-gray-400">
                            Price
                          </p>
                          <p className="mt-1 text-2xl font-bold leading-tight text-brand-500 sm:text-[1.75rem]">
                            {formatKes(result.priceKes)}
                          </p>
                        </div>
                        <p className="mt-5 text-[0.6875rem] leading-relaxed text-gray-400">
                          KCA confirms space before you pay. Prices include VAT.
                        </p>
                      </div>
                    ) : (
                      <div
                        key={signature}
                        className="mt-4 animate-quote-in motion-reduce:animate-none"
                      >
                        <p className="text-lg font-semibold leading-snug">
                          {result.errors[0]}
                        </p>
                        {result.errors.length > 1 ? (
                          <ul className="mt-2 space-y-1 text-sm text-gray-400">
                            {result.errors.slice(1).map((error) => (
                              <li key={error}>{error}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    {result.ok ? (
                      <>
                        <div
                          key={`details-${signature}`}
                          className="animate-quote-in space-y-3 motion-reduce:animate-none"
                        >
                          <ResultRow
                            label="Screen hours booked"
                            value={formatNumber(result.hoursBooked)}
                          />
                          <ResultRow
                            label="Full price"
                            value={formatKes(result.fullPriceKes)}
                          />
                          <ResultRow
                            label="Discount"
                            value={
                              result.discountPercent > 0
                                ? `${result.discountPercent}% off`
                                : "None yet"
                            }
                          />
                          <ResultRow
                            label="Each play costs"
                            value={formatPerPlay(result.perPlayKes)}
                          />
                        </div>

                        <div className="mt-4 space-y-2">
                          {result.belowMinimum ? (
                            <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-medium leading-relaxed text-brand-900">
                              The smallest order is{" "}
                              {formatKes(settings.minOrderKes)}.
                            </p>
                          ) : null}

                          {nextStepIsNear && result.nextStep ? (
                            <p className="text-sm leading-relaxed text-gray-700">
                              Add{" "}
                              {formatNumber(result.nextStep.playsNeeded)}{" "}
                              plays to get {result.nextStep.percent}% off.
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : null}

                    {onlyLate ? (
                      <p className="mt-4 text-sm leading-relaxed text-gray-600">
                        Late plays follow the screen hours for each chosen day.
                      </p>
                    ) : null}

                    <div className="mt-5 space-y-2">
                      {result.ok && !result.belowMinimum && <button type="button" className="staff-button w-full" aria-expanded={bookOpen} onClick={() => setBookOpen((open) => !open)}>Book these plays</button>}
                      {bookOpen && result.ok && !result.belowMinimum && <BookingForm key={query} request={request} priceKes={result.priceKes} />}
                      <button
                        type="button"
                        onClick={sendQuote}
                        disabled={!result.ok || result.belowMinimum}
                        className="btn-sweep inline-flex min-h-12 w-full items-center justify-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-black transition-[transform,opacity] duration-200 ease-out hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none motion-reduce:transition-none"
                      >
                        Send this quote to KCA
                      </button>
                      <button
                        type="button"
                        onClick={copyLink}
                        className="btn-outline inline-flex min-h-12 w-full items-center justify-center rounded-full border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-800 transition-[transform,background-color,border-color,opacity] duration-200 ease-out hover:bg-gray-50 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
                      >
                        {copyState === "copied" ? "Link copied" : "Copy link"}
                      </button>
                      <p
                        aria-live="polite"
                        className="min-h-5 text-center text-xs leading-relaxed text-gray-500"
                      >
                        {copyState === "failed"
                          ? "Copy failed. Select the address bar."
                          : copyState === "copied"
                            ? "The link is on your clipboard."
                            : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </AnimatedItem>
            </aside>
          </div>
        </div>
      </AnimatedSection>
    </>
  );
}
