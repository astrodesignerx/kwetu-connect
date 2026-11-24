import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAccount } from "./accounts";
import { deleteDraft, DraftConflict, getDraft, listDrafts, loadUploads, saveDraft, saveUpload, sendOnce, cleanUploads, type DraftData } from "./drafts";

const owner = "staff@example.test";
const content: DraftData = { title: "New email", to: "client@example.test", cc: "", subject: "Kisumu Ndogo Road", body: "Hello", uploadIds: [] };
let account: string;
beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  account = (await saveAccount(owner, { email: randomUUID() + "@example.test", label: "Test", username: "user", password_enc: "enc:v1:test", imap_host: "imap.example.test", imap_port: 993, imap_secure: true, smtp_host: "smtp.example.test", smtp_port: 465, smtp_secure: true })).id;
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("persistent draft contract", () => {
  it("rejects a stale tab and simultaneous first saves without overwriting either", async () => {
    const id = randomUUID();
    const initial = await saveDraft(owner, id, account, 0, content);
    const results = await Promise.allSettled([saveDraft(owner, id, account, initial.row_version, { ...content, body: "First" }), saveDraft(owner, id, account, initial.row_version, { ...content, body: "Second" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    await expect(saveDraft(owner, id, account, 0, content)).rejects.toBeInstanceOf(DraftConflict);
    expect((await getDraft(owner, id))?.row_version).toBe(2);
    expect((await getDraft(owner, id))?.data.body).toBe("First");
  });
  it("never reads, claims or overwrites somebody else's draft", async () => {
    const row = await saveDraft(owner, randomUUID(), account, 0, content);
    expect(await getDraft("other@example.test", row.id)).toBeNull();
    await expect(saveDraft("other@example.test", row.id, account, 1, content)).rejects.toThrow("not connected");
    await expect(sendOnce("other@example.test", row.id, account, 1, content, vi.fn())).rejects.toThrow("not connected");
    await expect(deleteDraft(owner, row.id, 0)).rejects.toBeInstanceOf(DraftConflict);
  });
  it("submits once across a retry and blocks a concurrent send and late autosave", async () => {
    const row = await saveDraft(owner, randomUUID(), account, 0, content);
    let finish!: () => void;
    const send = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = sendOnce(owner, row.id, account, 1, content, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await expect(sendOnce(owner, row.id, account, 1, content, send)).rejects.toThrow("already started");
    await expect(saveDraft(owner, row.id, account, 1, content)).rejects.toBeInstanceOf(DraftConflict);
    finish(); await first;
    await sendOnce(owner, row.id, account, 1, content, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await getDraft(owner, row.id))?.send_state).toBe("sent");
    expect(await listDrafts(owner, account)).toEqual([]);
  });
  it("keeps ambiguous SMTP failures locked so retrying cannot duplicate a delivery", async () => {
    const row = await saveDraft(owner, randomUUID(), account, 0, content);
    const send = vi.fn().mockRejectedValue(new Error("socket lost after DATA"));
    await expect(sendOnce(owner, row.id, account, 1, content, send)).rejects.toThrow("could not be confirmed");
    await expect(sendOnce(owner, row.id, account, 1, content, send)).rejects.toThrow("already started");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await getDraft(owner, row.id))?.send_state).toBe("uncertain");
  });
  it("stages each attachment up to 4 MB, checks ownership and clears all uploads after 24 hours", async () => {
    const row = await saveDraft(owner, randomUUID(), account, 0, content);
    const a = await saveUpload(owner, row.id, new File(["hello"], "hello.txt"));
    expect((await loadUploads(owner, row.id, [a.id]))[0].data_base64).toBe(Buffer.from("hello").toString("base64"));
    await expect(loadUploads("other@example.test", row.id, [a.id])).rejects.toThrow("unavailable");
    await expect(loadUploads(owner, randomUUID(), [a.id])).rejects.toThrow("unavailable");
    await expect(saveUpload(owner, row.id, new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.bin"))).rejects.toThrow("4 MB");
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 86_400_001);
    await cleanUploads();
    await expect(loadUploads(owner, row.id, [a.id])).rejects.toThrow("expired");
  });
});
