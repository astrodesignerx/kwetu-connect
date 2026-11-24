import { beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(() => ({auth:vi.fn(),directory:vi.fn(),account:vi.fn(),templates:vi.fn(),notes:vi.fn(),meta:vi.fn(),assign:vi.fn(),save:vi.fn(),remove:vi.fn(),saveNote:vi.fn(),rows:vi.fn()}));
vi.mock("@/lib/auth/server",() => ({requireStaff:mock.auth}));
vi.mock("@/lib/store",() => ({getStore:() => ({mailDirectory:mock.directory})}));
vi.mock("@/lib/mail/accounts",() => ({loadAccount:mock.account,mailboxPeople:async()=>[],listAccounts:async()=>[]}));
vi.mock("@/lib/mail/conversations",() => ({conversationRows:mock.rows}));
vi.mock("@/lib/mail/kca-data",() => ({listTemplates:mock.templates,listNotes:mock.notes,listMeta:mock.meta,assignThread:mock.assign,saveTemplate:mock.save,deleteTemplate:mock.remove,saveNote:mock.saveNote}));
import { mailAssign, mailAssigned, mailClientConversations, mailDeleteTemplate, mailSaveNote, mailSaveTemplate, mailWaiting, mailWorkspace } from "./kca-actions";
beforeEach(() => {vi.resetAllMocks();mock.auth.mockResolvedValue({email:"staff@example.com"});mock.account.mockResolvedValue({});mock.templates.mockResolvedValue([]);mock.notes.mockResolvedValue([]);mock.meta.mockResolvedValue([]);});
describe("private KCA mail actions",() => {
  it("requires staff auth on every new entry point",async () => {
    mock.auth.mockRejectedValue(new Error("sign-in"));
    const calls=[() => mailWorkspace("a"),() => mailAssign("a","s",null),() => mailAssigned("a"),() => mailClientConversations(["c@example.com"]),() => mailWaiting(),() => mailSaveNote("c@example.com","n"),() => mailSaveTemplate({name:"n",body:"b",sort_order:0}),() => mailDeleteTemplate("id")];
    for(const call of calls) await expect(call()).rejects.toThrow("sign-in");
    expect(mock.assign).not.toHaveBeenCalled();expect(mock.save).not.toHaveBeenCalled();expect(mock.remove).not.toHaveBeenCalled();expect(mock.saveNote).not.toHaveBeenCalled();
  });
  it("loads one booking snapshot and keeps mail usable when bookings fail",async () => {
    mock.directory.mockRejectedValue(new Error("offline"));const r=await mailWorkspace("a");
    expect(r.ok).toBe(true);if(r.ok) {expect(r.data.directory).toBeNull();expect(r.data.errors).toContain("Bookings could not be loaded. Mail is still available.");}
    expect(mock.directory).toHaveBeenCalledTimes(1);expect(mock.account).toHaveBeenCalledWith("staff@example.com","a");
  });
  it("never trusts a claimed owner and delegates the authenticated actor",async () => {
    mock.assign.mockResolvedValue({assigned_email:"staff@example.com"});
    await mailAssign("a","Subject","staff@example.com");
    expect(mock.assign).toHaveBeenCalledWith("staff@example.com","a","Subject","staff@example.com");
  });
});
