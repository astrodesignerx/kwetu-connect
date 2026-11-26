// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MailDesk from "./MailDesk";
import { mailFolders, mailList, mailMove, mailThread } from "@/app/mail/actions";
import { mailAssigned, mailWaiting, mailWorkspace } from "@/app/mail/kca-actions";
import type { MessageRow } from "@/app/mail/actions";

vi.mock("@/app/mail/actions", () => ({
  mailFolders:vi.fn(), mailList:vi.fn(), mailThread:vi.fn(), mailMove:vi.fn(),
}));
vi.mock("@/app/mail/kca-actions", () => ({
  mailAssigned:vi.fn(), mailWaiting:vi.fn(), mailWorkspace:vi.fn(),
}));
vi.mock("@/app/manage/auth-actions", () => ({ signOut:vi.fn() }));

function message(subject:string, uid=1):MessageRow {
  return {subject, uid, mailbox:"INBOX", from:{name:"Ada", address:"ada@example.test"}, to:[],
    date:null, seen:false, flagged:false, answered:false, hasAttachments:false, messageId:null, thread:1};
}
const accounts = ["one", "two"].map((id)=>({id, email:id+"@example.test", label:id}));
let root:Root;
let host:HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.mocked(mailWorkspace).mockResolvedValue({ok:false, error:"Directory unavailable"});
  vi.mocked(mailFolders).mockResolvedValue({ok:true, data:{boxes:[{path:"INBOX", name:"Inbox", special:"inbox"}], unread:0}});
  vi.mocked(mailWaiting).mockResolvedValue({ok:true, data:{items:[], partial:false, errors:[]}});
});
afterEach(async () => {
  await act(async ()=>root.unmount());
  host.remove();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("drops a late page after a mailbox switch and hides rows while the new list loads", async () => {
  type Result = Awaited<ReturnType<typeof mailList>>;
  const older = Promise.withResolvers<Result>();
  const inbox = Promise.withResolvers<Result>();
  vi.mocked(mailList).mockImplementation(async (id, _folder, _query, offset) => {
    if (id==="two") return inbox.promise;
    if (offset) return older.promise;
    return {ok:true, data:{items:[message("First mailbox")], total:2}};
  });
  await act(async ()=>root.render(<MailDesk initialAccounts={accounts} initialQuery=""/>));
  await act(async ()=>host.querySelector<HTMLButtonElement>(".mail-more")!.click());
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Mailbox"]')!;
  await act(async ()=>{
    select.value="two";
    select.dispatchEvent(new Event("change", {bubbles:true}));
  });
  expect(host.querySelector(".row-main")).toBeNull();
  await act(async ()=>inbox.resolve({ok:true, data:{items:[message("Second mailbox")], total:1}}));
  await act(async ()=>older.resolve({ok:true, data:{items:[message("Old page",2)], total:2}}));
  expect(host.querySelectorAll(".row-main")).toHaveLength(1);
  expect(host.querySelector(".row-subj")?.textContent).toContain("Second mailbox");
});

it("archives only the targeted account's UID when assigned messages have matching UIDs", async () => {
  const first = {...message("First mailbox"), accountId:"one"};
  const second = {...message("Second mailbox"), accountId:"two"};
  vi.mocked(mailAssigned).mockResolvedValue({ok:true, data:{items:[first,second], partial:false, errors:[]}});
  vi.mocked(mailThread).mockResolvedValue({ok:true, data:[1, 7].map((uid)=>({
    ...message("First mailbox", uid), from:[], cc:[], text:"Hello", html:null,
    references:[], inReplyTo:null, attachments:[],
  }))});
  vi.mocked(mailMove).mockResolvedValue({ok:false, error:"Move unavailable"});
  await act(async ()=>root.render(<MailDesk initialAccounts={accounts} initialQuery="" initialView="Assigned"/>));
  await act(async ()=>host.querySelector<HTMLButtonElement>(".row-main")!.click());
  await act(async ()=>host.querySelector<HTMLButtonElement>('[aria-label="Archive: Second mailbox"]')!.click());
  expect(mailMove).toHaveBeenCalledWith("two", "INBOX", [1], "archive");
});

it("keeps keyboard navigation out of the previous inbox when a folder is missing", async () => {
  vi.mocked(mailList).mockResolvedValue({ok:true, data:{items:[message("Inbox only")], total:1}});
  await act(async ()=>root.render(<MailDesk initialAccounts={accounts} initialQuery=""/>));
  const archive = Array.from(host.querySelectorAll<HTMLButtonElement>(".rail-item")).find((button)=>button.textContent==="Archive");
  await act(async ()=>archive!.click());
  expect(host.textContent).toContain("This mailbox has no Archive folder.");
  await act(async ()=>{ window.dispatchEvent(new KeyboardEvent("keydown", {key:"j"})); });
  expect(mailThread).not.toHaveBeenCalled();
});

it("can page past an inbox page with no matches for the Waiting filter", async () => {
  const waiting = {...message("Needs a reply", 2), accountId:"one"};
  vi.mocked(mailWaiting).mockResolvedValue({ok:true, data:{items:[waiting], errors:[], partial:false}});
  vi.mocked(mailList).mockImplementation(async (_id, _folder, _query, offset) => ({
    ok:true, data:{items:[offset ? waiting : message("Already answered")], total:2},
  }));
  await act(async ()=>root.render(<MailDesk initialAccounts={accounts} initialQuery=""/>));
  const filter = Array.from(host.querySelectorAll<HTMLButtonElement>(".filters button")).find((button)=>button.textContent==="Waiting");
  await act(async ()=>filter!.click());
  expect(host.querySelector(".row-main")).toBeNull();
  await act(async ()=>host.querySelector<HTMLButtonElement>(".mail-more")!.click());
  expect(host.querySelector(".row-subj")?.textContent).toContain("Needs a reply");
});

it("uses the waiting conversation's mailbox to address an immediate reply", async () => {
  const waiting = {...message("Sales follow-up"), accountId:"two"};
  vi.mocked(mailList).mockResolvedValue({ok:true, data:{items:[], total:0}});
  vi.mocked(mailWaiting).mockResolvedValue({ok:true, data:{items:[waiting], errors:[], partial:false}});
  vi.mocked(mailThread).mockResolvedValue({ok:true, data:[{
    ...waiting, from:[{name:"Sales", address:"two@example.test"}], to:[{name:"Ada", address:"ada@example.test"}],
    cc:[], references:[], inReplyTo:null, attachments:[], html:null, text:"Sent follow-up",
  }]});
  await act(async ()=>root.render(<MailDesk initialAccounts={accounts} initialQuery=""/>));
  await act(async ()=>host.querySelector<HTMLButtonElement>(".reply-hint")!.click());
  expect(host.querySelector<HTMLInputElement>('input[name="to"]')?.value).toBe("ada@example.test");
  expect(host.querySelector(".dock-from")?.textContent).toContain("two@example.test");
});
