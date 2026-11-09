import { cellKey, requestCells } from "./hours";
import type { BlockId } from "./settings";

export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const BLOCK_ORDER: BlockId[] = ["morning", "midday", "afternoon", "evening", "late"];
export type Selection = { days: number[]; blocks: BlockId[]; cells?: string[] };
export type SelectionAction = { kind: "day"; day: number } | { kind: "block"; block: BlockId }
  | { kind: "cell"; day: number; block: BlockId };
/** Whether the screen is on for that day and time; closed boxes are never added. */
export type IsOpen = (day: number, block: BlockId) => boolean;

const CELL_PATTERN = /^([0-6])-([a-z]+)$/;

export function parseCell(key: string): { day: number; block: BlockId } | null {
  const match = CELL_PATTERN.exec(key);
  if (!match || !BLOCK_ORDER.includes(match[2] as BlockId)) return null;
  return { day: Number(match[1]), block: match[2] as BlockId };
}

/** Puts cells in grid order, drops duplicates and bad keys, and sets days and blocks to the ones the cells use. */
export function fromCells(cells: string[]): Required<Selection> {
  const chosen = new Set(cells.filter((key) => parseCell(key)));
  const ordered = DAY_ORDER.flatMap((day) => BLOCK_ORDER.map((block) => cellKey(day, block))).filter((key) => chosen.has(key));
  const parsed = ordered.map((key) => parseCell(key)!);
  return {
    cells: ordered,
    days: DAY_ORDER.filter((day) => parsed.some((cell) => cell.day === day)),
    blocks: BLOCK_ORDER.filter((block) => parsed.some((cell) => cell.block === block)),
  };
}

export function toggleSelection(selection: Selection, action: SelectionAction, isOpen: IsOpen = () => true): Required<Selection> {
  const cells = new Set(requestCells(selection));
  const toggleGroup = (keys: string[]) => {
    const open = keys.filter((key) => { const cell = parseCell(key)!; return isOpen(cell.day, cell.block); });
    const allOn = open.length > 0 && open.every((key) => cells.has(key));
    for (const key of open) { if (allOn) cells.delete(key); else cells.add(key); }
  };
  if (action.kind === "day") toggleGroup(BLOCK_ORDER.map((block) => cellKey(action.day, block)));
  else if (action.kind === "block") toggleGroup(DAY_ORDER.map((day) => cellKey(day, action.block)));
  else {
    const key = cellKey(action.day, action.block);
    if (cells.has(key)) cells.delete(key);
    else if (isOpen(action.day, action.block)) cells.add(key);
  }
  return fromCells([...cells].filter((key) => { const cell = parseCell(key); return cell !== null && isOpen(cell.day, cell.block); }));
}

export type QuickPick = "mornings" | "evenings" | "weekends" | "clear";
/** A ready-made selection that replaces the current one, made only of boxes that are open. */
export function quickPick(pick: QuickPick, isOpen: IsOpen): Required<Selection> {
  const keys = pick === "clear" ? [] : pick === "mornings" ? DAY_ORDER.map((day) => cellKey(day, "morning"))
    : pick === "evenings" ? DAY_ORDER.map((day) => cellKey(day, "evening"))
    : [6, 0].flatMap((day) => BLOCK_ORDER.map((block) => cellKey(day, block)));
  return fromCells(keys.filter((key) => { const cell = parseCell(key)!; return isOpen(cell.day, cell.block); }));
}

/** The picked boxes with closed ones removed, so summaries and saved bookings only list boxes that can play. */
export function openSelection(selection: Selection, isOpen: IsOpen): Required<Selection> {
  return fromCells(requestCells(selection).filter((key) => { const cell = parseCell(key); return cell !== null && isOpen(cell.day, cell.block); }));
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Plain lines such as "Fri, Sat: Morning, Midday", grouping days that share the same times. */
export function scheduleLines(selection: Selection, labels: Record<BlockId, { label: string }>): string[] {
  const cells = new Set(requestCells(selection));
  const groups: { days: number[]; blocks: BlockId[] }[] = [];
  for (const day of DAY_ORDER) {
    const blocks = BLOCK_ORDER.filter((block) => cells.has(cellKey(day, block)));
    if (blocks.length === 0) continue;
    const same = groups.find((group) => group.blocks.join() === blocks.join());
    if (same) same.days.push(day); else groups.push({ days: [day], blocks });
  }
  return groups.map((group) => `${group.days.length === 7 ? "Every day" : group.days.map((d) => SHORT_DAYS[d]).join(", ")}: ${group.blocks.length === 5 ? "All day" : group.blocks.map((b) => labels[b].label).join(", ")}`);
}
