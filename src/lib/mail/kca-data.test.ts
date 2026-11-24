import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { saveAccount } from "./accounts";
import { demoAccountFields } from "./demo";
import { assignThread, listMeta, listNotes, listTemplates, saveTemplate, deleteTemplate, saveNote } from "./kca-data";
beforeEach(() => {for(const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"]) vi.stubEnv(key,"");});
afterEach(() => vi.unstubAllEnvs());
describe("mail workspace persistence",() => {
  it("seeds five replies and supports create, edit, sort and delete",async () => {
    expect(await listTemplates()).toHaveLength(5);
    const row=await saveTemplate("staff@example.com",{name:"Test",body:"A reply",sort_order:40});
    expect(row.created_by).toBe("staff@example.com");
    await saveTemplate("other@example.com",{...row,body:"Edited reply",sort_order:-1});
    expect((await listTemplates())[0]).toMatchObject({id:row.id,body:"Edited reply",created_by:"staff@example.com"});
    await deleteTemplate(row.id);expect((await listTemplates()).some((t) => t.id===row.id)).toBe(false);
    await expect(saveTemplate("staff@example.com",{name:"",body:"x",sort_order:0})).rejects.toThrow();
  });
  it("authorises mailbox ownership and prevents assignment impersonation",async () => {
    const account=await saveAccount("owner@example.com",demoAccountFields("sales@example.com"));
    await expect(assignThread("intruder@example.com",account.id,"Campaign","intruder@example.com")).rejects.toThrow("not connected");
    await expect(assignThread("owner@example.com",account.id,"Campaign","other@example.com")).rejects.toThrow("access to this mailbox");
    await assignThread("owner@example.com",account.id,"Re: Campaign","OWNER@example.com");
    expect(await listMeta("owner@example.com",account.id)).toMatchObject([{thread_key:"campaign",assigned_email:"owner@example.com"}]);
    await assignThread("owner@example.com",account.id,"Campaign",null);
    expect((await listMeta("owner@example.com",account.id))[0].assigned_email).toBeNull();
  });
  it("shares client notes by normalised advertiser email and records the author",async () => {
    await saveNote("STAFF@example.com"," CLIENT@example.com "," Call before changing dates ");
    const note=(await listNotes()).find((n) => n.advertiser_email==="client@example.com");
    expect(note).toMatchObject({note:"Call before changing dates",updated_by:"staff@example.com"});
    await saveNote("other@example.com","client@example.com","");
    expect((await listNotes()).find((n) => n.advertiser_email==="client@example.com")?.note).toBe("");
  });
});
