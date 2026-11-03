import type { BlockId } from "./settings";

export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const BLOCK_ORDER: BlockId[] = ["morning", "midday", "afternoon", "evening", "late"];
export type Selection = { days: number[]; blocks: BlockId[] };
export type SelectionAction = { kind: "day"; day: number } | { kind: "block"; block: BlockId }
  | { kind: "cell"; day: number; block: BlockId };

export function toggleSelection(selection: Selection, action: SelectionAction): Selection {
  let { days, blocks } = selection;
  if (action.kind === "day") days = days.includes(action.day) ? days.filter((d) => d !== action.day) : [...days, action.day];
  else if (action.kind === "block") blocks = blocks.includes(action.block) ? blocks.filter((b) => b !== action.block) : [...blocks, action.block];
  else if (days.includes(action.day) && blocks.includes(action.block)) {
    if (blocks.length > 1) blocks = blocks.filter((b) => b !== action.block);
    else days = days.filter((d) => d !== action.day);
  } else {
    days = [...days, action.day];
    blocks = [...blocks, action.block];
  }
  return { days: DAY_ORDER.filter((d) => days.includes(d)), blocks: BLOCK_ORDER.filter((b) => blocks.includes(b)) };
}
