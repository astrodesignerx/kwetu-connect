import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, unknown>>(), filters: [] as [string, unknown][] }));
vi.mock("./accounts", () => ({ loadAccount: vi.fn().mockResolvedValue({}) }));
vi.mock("./db", () => ({
  mailMemoryMode: () => false,
  mailDb: () => ({ from: () => {
    let op = "read";
    let patch: Record<string, unknown> = {};
    const filters: [string, unknown][] = [];
    const run = () => {
      state.filters = filters;
      if (op === "insert") {
        const id = patch.id as string;
        if (state.rows.has(id)) return { data: null, error: { code: "23505" } };
        const row = { ...patch, row_version: 1, send_state: "draft", send_hash: null };
        state.rows.set(id, row); return { data: row, error: null };
      }
      const row = [...state.rows.values()].find((r) => filters.every(([key, value]) => r[key] === value));
      if (!row) return { data: null, error: null };
      if (op === "update") { const next = { ...row, ...patch }; state.rows.set(next.id as string, next); return { data: next, error: null }; }
      return { data: structuredClone(row), error: null };
    };
    const query = {
      insert: (value: Record<string, unknown>) => { op = "insert"; patch = value; return query; },
      update: (value: Record<string, unknown>) => { op = "update"; patch = value; return query; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      select: () => query,
      single: async () => run(), maybeSingle: async () => run(),
      then: (resolve: (r: ReturnType<typeof run>) => void) => Promise.resolve(run()).then(resolve),
    };
    return query;
  } }),
}));
import { DraftConflict, saveDraft, sendOnce } from "./drafts";
const content = { title: "New email", to: "a@example.test", cc: "", subject: "Subject", body: "Body", uploadIds: [] };
beforeEach(() => { state.rows.clear(); state.filters = []; });
describe("Supabase draft compare and update", () => {
  it("puts the owner, version and unsent state in the update predicate", async () => {
    const id = randomUUID(); const account = randomUUID();
    await saveDraft("staff@example.test", id, account, 0, content);
    const row = await saveDraft("staff@example.test", id, account, 1, { ...content, body: "Changed" });
    expect(row.row_version).toBe(2);
    expect(state.filters).toEqual(expect.arrayContaining([["owner_email", "staff@example.test"], ["mailbox_id", account], ["row_version", 1], ["send_state", "draft"]]));
    await expect(saveDraft("staff@example.test", id, account, 1, content)).rejects.toBeInstanceOf(DraftConflict);
    expect(state.rows.get(id)?.data).toMatchObject({ body: "Changed" });
  });
  it("records a durable send receipt and replays it without submitting to SMTP again", async () => {
    const id = randomUUID(); const account = randomUUID(); const send = vi.fn().mockResolvedValue(undefined);
    await saveDraft("staff@example.test", id, account, 0, content);
    await sendOnce("staff@example.test", id, account, 1, content, send);
    expect(state.rows.get(id)?.send_state).toBe("sent");
    await sendOnce("staff@example.test", id, account, 1, content, send);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
