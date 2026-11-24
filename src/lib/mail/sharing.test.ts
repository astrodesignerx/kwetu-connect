import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const actor=vi.hoisted(()=>({email:"owner@example.test"}));
vi.mock("@/lib/auth/server",()=>({requireStaff:vi.fn(async()=>({email:actor.email}))}));
import { addMember, listAccounts, loadAccount, mailboxPeople, removeMember, saveAccount } from "./accounts";
import { assignThread, listMeta, setDone } from "./kca-data";
import { demoAccountFields, demoList } from "./demo";
import { getDraft, saveDraft } from "./drafts";
import { connectMailbox, disconnectMailbox, mailAddMember, mailFolders, mailRemoveMember, mailRename, mailSend } from "@/app/mail/actions";
import { filterConversations } from "./conversations";
import { messageIdentity } from "./status";
const owner="owner@example.test",member="member@example.test",outsider="outside@example.test";
let id="";
beforeEach(async()=>{
  for(const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"])vi.stubEnv(key,"");
  (globalThis as typeof globalThis & {kcaMailStaff?:Map<string,string>}).kcaMailStaff=new Map([[owner,"Owner Name"],[member,"Member Name"],[outsider,"Outside Name"]]);
  actor.email=owner;id=(await saveAccount(owner,demoAccountFields(`box-${randomUUID()}@example.test`))).id;await addMember(owner,id,member);
});
afterEach(()=>vi.unstubAllEnvs());
describe("one mailbox access check",()=>{
  it("allows owner and member, hides the mailbox from outsiders and returns credential-free views",async()=>{
    for(const me of [owner,member]){expect((await loadAccount(me,id)).id).toBe(id);const a=(await listAccounts(me)).find((a)=>a.id===id)!;expect(a).toBeDefined();expect(a).not.toHaveProperty("password_enc");}
    expect((await listAccounts(outsider)).some((a)=>a.id===id)).toBe(false);
    actor.email=outsider;expect(await mailFolders(id)).toEqual(await mailFolders(randomUUID()));
    expect((await mailboxPeople(member,id)).map((p)=>p.name)).toEqual(["Owner Name","Member Name"]);
  });
  it.each([owner,member,outsider])("authorises reading and sending for %s",async(me)=>{
    actor.email=me;const folders=await mailFolders(id);expect(folders.ok).toBe(me!==outsider);
    const draftId=randomUUID(),content={title:"New email",to:"client@example.test",cc:"",subject:"Test",body:"Real text",uploadIds:[]};
    if(me===outsider){await expect(saveDraft(me,draftId,id,0,content)).rejects.toThrow("not connected");expect(await mailSend({accountId:id,to:[content.to],subject:"Test",html:"<p>Test</p>"})).toMatchObject({ok:false,error:"That mailbox is not connected."});return;}
    const row=await saveDraft(me,draftId,id,0,content);
    expect(await mailSend({accountId:id,draftId,expectedVersion:row.row_version,to:[content.to],subject:content.subject,html:"<p>Real text</p>"})).toEqual({ok:true,data:true});
    expect(await getDraft(me===owner?member:owner,draftId)).toBeNull();
  });
  it.each([owner,member,outsider])("keeps settings and member management owner-only for %s",async(me)=>{
    actor.email=me;expect((await mailRename(id,"Shared team")).ok).toBe(me===owner);
    expect((await mailAddMember(id,outsider)).ok).toBe(me===owner);
    expect((await mailRemoveMember(id,outsider)).ok).toBe(me===owner);
    if(me!==owner){expect((await connectMailbox({accountId:id,email:"anything@example.test",password:"do not echo"})).ok).toBe(false);expect((await disconnectMailbox(id)).ok).toBe(false);expect((await loadAccount(owner,id)).id).toBe(id);}
  });
  it("lets people assign to anyone with access and refuses an outsider as actor or assignee",async()=>{
    await assignThread(owner,id,"Campaign",member);await assignThread(member,id,"Campaign",owner);
    await expect(assignThread(member,id,"Campaign",outsider)).rejects.toThrow("access");
    await expect(assignThread(outsider,id,"Campaign",owner)).rejects.toThrow("not connected");
  });
  it.each([owner,member])("removes membership and clears assignments in the same action by %s",async(me)=>{
    await assignThread(owner,id,"Campaign",member);const draft=await saveDraft(member,randomUUID(),id,0,{title:"Reply",to:"a@example.test",cc:"",subject:"Campaign",body:"Draft",uploadIds:[]});
    await removeMember(me,id,member);
    expect((await listMeta(owner,id)).find((m)=>m.thread_key==="campaign")?.assigned_email).toBeNull();
    await expect(loadAccount(member,id)).rejects.toThrow("not connected");await expect(getDraft(member,draft.id)).rejects.toThrow("not connected");
    await expect(removeMember(owner,id,owner)).rejects.toThrow("owner");
  });
  it("keeps done separate from assignment, reopens for newer incoming mail and stops waiting after a reply",async()=>{
    const a=await loadAccount(owner,id),row=demoList(a,"INBOX",{},0,100).items.find((r)=>r.from.address==="agnes@example.com")!;
    await assignThread(owner,id,row.subject,member);await setDone(member,id,row.subject,messageIdentity(row));
    const meta=await listMeta(owner,id);expect(meta.find((m)=>m.thread_key.includes("advert attached"))?.assigned_email).toBe(member);
    expect(filterConversations([row],{kind:"waiting"},a.email,["INBOX"],meta)).toHaveLength(0);
    const newer={...row,uid:1000,messageId:"<new@example.test>",date:new Date(Date.now()+1000).toISOString()};
    expect(filterConversations([row,newer],{kind:"waiting"},a.email,["INBOX"],meta)).toEqual([newer]);
    expect(filterConversations([row,{...newer,mailbox:"Sent",from:{name:"",address:a.email}}],{kind:"waiting"},a.email,["INBOX"],meta)).toHaveLength(0);
    await setDone(owner,id,row.subject,null);expect(filterConversations([row],{kind:"waiting"},a.email,["INBOX"],await listMeta(owner,id))).toHaveLength(1);
  });
});
