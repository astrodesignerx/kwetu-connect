import { describe, expect, it, vi } from "vitest";
import type { ImapFlow } from "imapflow";
import { restoreMoved, type MoveReceipt } from "./moves";
const receipt:MoveReceipt={accountId:"a",source:"INBOX",target:"Archive",validity:"42",expires:Date.now()+5000,messages:[{oldUid:3,uid:73,messageId:"<original@example.test>"}],signature:""};
function client(validity=BigInt(42)){return {mailbox:{uidValidity:validity},getMailboxLock:vi.fn(async()=>({release:vi.fn()})),fetchOne:vi.fn(async()=>({envelope:{messageId:"<original@example.test>"}})),search:vi.fn(async()=>[91]),messageMove:vi.fn(async()=>({uidMap:new Map([[73,12]])}))};}
const cast=(c:ReturnType<typeof client>)=>c as unknown as ImapFlow;
describe("move undo survives server renumbering",()=>{
 it("uses the move UID map and checks UIDVALIDITY",async()=>{const c=client();await restoreMoved(cast(c),receipt);expect(c.messageMove).toHaveBeenCalledWith("73","INBOX",{uid:true});expect(c.search).not.toHaveBeenCalled();});
 it("searches the destination by Message-ID when there is no UID map",async()=>{const c=client();await restoreMoved(cast(c),{...receipt,messages:[{...receipt.messages[0],uid:null}]});expect(c.search).toHaveBeenCalledWith({header:{"message-id":"<original@example.test>"}},{uid:true});expect(c.messageMove).toHaveBeenCalledWith("91","INBOX",{uid:true});});
 it("ignores stale UID maps after UIDVALIDITY changes",async()=>{const c=client(BigInt(55));await restoreMoved(cast(c),receipt);expect(c.fetchOne).not.toHaveBeenCalled();expect(c.messageMove).toHaveBeenCalledWith("91","INBOX",{uid:true});});
 it("leaves all messages where they are if one is missing or ambiguous",async()=>{const c=client();c.search.mockResolvedValue([]);await expect(restoreMoved(cast(c),{...receipt,messages:[{...receipt.messages[0],uid:null}]})).rejects.toThrow("Undo failed");expect(c.messageMove).not.toHaveBeenCalled();c.search.mockResolvedValue([1,2]);await expect(restoreMoved(cast(c),{...receipt,messages:[{...receipt.messages[0],uid:null}]})).rejects.toThrow("Undo failed");expect(c.messageMove).not.toHaveBeenCalled();});
});
