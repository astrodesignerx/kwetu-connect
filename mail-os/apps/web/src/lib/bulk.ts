/**
 * Runs one task per id, at most `limit` at a time, and reports which ids failed.
 * One failure never stops the rest: a bulk action should do everything it can.
 */
export async function runEach(ids: string[], task: (id: string) => Promise<unknown>, limit = 4): Promise<{ done: string[]; failed: string[] }> {
  const done: string[] = [];
  const failed: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try { await task(id); done.push(id); } catch { failed.push(id); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, ids.length) }, worker));
  return { done, failed: ids.filter((id) => failed.includes(id)) };
}

/** "Archived 3 of 5. 2 could not be archived, try again." Empty when all worked. */
export function bulkArchiveMessage(done: number, total: number): string {
  const failed = total - done;
  if (failed <= 0) return "";
  if (done === 0) return total === 1 ? "That conversation could not be archived, try again." : `None of the ${total} conversations could be archived, try again.`;
  return `Archived ${done} of ${total}. ${failed} could not be archived, try again.`;
}
