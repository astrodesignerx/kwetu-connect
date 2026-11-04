import { addDays, earliestStartDate, isValidDate, type BookingRequest } from "./hours";
import type { BlockId, BookingSettings } from "./settings";
import { DAY_ORDER, BLOCK_ORDER, fromCells } from "./selection";
import { requestCells } from "./hours";
export type SearchParams = Record<string, string | string[] | undefined>;
export type Answers = BookingRequest;

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

export function normaliseDays(days: number[]): number[] {
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

export function normaliseBlocks(blocks: BlockId[]): BlockId[] {
  const chosen = new Set(blocks);
  return BLOCK_ORDER.filter((block) => chosen.has(block));
}

export function readAnswers(params: SearchParams, today: string, settings: BookingSettings): Answers {
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

  // `cells` names exact boxes; old links with only days and blocks book every chosen day at every chosen time.
  const cellsValue = readParam(params, "cells");
  const chosen = fromCells(cellsValue === undefined ? requestCells({ days, blocks }) : parseList(cellsValue));

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
    ...chosen,
    startDate,
    endDate,
  };
}

export function buildQuery(answers: Answers): string {
  return `len=${answers.lengthSeconds}&often=${answers.howOften}&cells=${requestCells(answers).join(",")}&from=${answers.startDate}&to=${answers.endDate}`;
}

