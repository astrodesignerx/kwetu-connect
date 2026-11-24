import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ accounts: vi.fn(), record: vi.fn(), imap: vi.fn(), clean: vi.fn() }));
vi.mock("./accounts", () => ({ accountsToWatch: mocks.accounts, recordSync: mocks.record }));
vi.mock("./drafts", () => ({ cleanUploads: mocks.clean }));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), withImap: mocks.imap }));
import { watchMail } from "./watch";
afterEach(() => vi.resetAllMocks());
describe("bounded mailbox checks", () => {
  it("continues after a mailbox fails and records only safe errors", async () => {
    mocks.accounts.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    mocks.imap.mockImplementation(async (a, fn) => {
      if (a.id === "a") throw new Error("private password ENOTFOUND");
      return fn({ list: async () => [], status: async () => ({ unseen: 7 }) });
    });
    expect(await watchMail()).toEqual({ checked: 2, errors: 1, complete: true });
    expect(mocks.record).toHaveBeenCalledWith("a", null, "That mail server could not be found. Check the server name.");
    expect(mocks.record).toHaveBeenCalledWith("b", 7, null);
    expect(mocks.imap.mock.calls.every((call) => call[2] <= 8000)).toBe(true);
    expect(mocks.clean).toHaveBeenCalledOnce();
  });
  it("does not start another batch when its budget has been spent", async () => {
    expect(await watchMail(1)).toEqual({ checked: 0, errors: 0, complete: false });
    expect(mocks.accounts).not.toHaveBeenCalled();
  });
});
