import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarTone, bookingDates, briefDate, fullTime, listTime, money, number } from "./mail-format";
import { shortcut, typingIn } from "./shortcuts";
import { holdSend } from "./send-hold";
import { hasRemoteContent, messageDoc } from "@/lib/mail/thread";
const now=new Date("2026-11-24T06:42:00Z");
afterEach(()=>vi.useRealTimers());
describe("Nairobi dates and grouped numbers",()=>{
 it.each([["2026-11-24T06:42:00Z","09:42"],["2026-11-23T18:00:00Z","Yesterday"],["2026-11-22T04:00:00Z","Sun"],["2026-11-18T04:00:00Z","Wed"],["2026-11-17T04:00:00Z","17 Nov"],["2025-11-23T04:00:00Z","23 Nov 2025"],["2026-11-23T22:00:00Z","01:00"]])("formats %s as %s",(iso,text)=>expect(listTime(iso,now)).toBe(text));
 it("writes complete reader and brief headings",()=>{expect(fullTime(now.toISOString())).toBe("Tue 24 Nov 2026, 09:42");expect(briefDate(now)).toBe("Tue 24 Nov 2026");});
 it("adds years only when needed for booking ranges",()=>{expect(bookingDates("2026-12-01","2026-12-19",now)).toBe("1 Dec to 19 Dec");expect(bookingDates("2026-12-19","2027-01-02",now)).toBe("19 Dec 2026 to 2 Jan 2027");expect(bookingDates("2025-11-01","2025-11-10",now)).toBe("1 Nov 2025 to 10 Nov 2025");expect(bookingDates("2026-12-19",undefined,now)).toBe("19 Dec");});
 it("groups money, plays and seconds",()=>{expect(money(12400)).toBe("KES 12,400");expect(number(12400)).toBe("12,400");});
});
describe("remote content consent",()=>{
 it("blocks external images, media, fonts and stylesheets until explicitly allowed",()=>{const input={html:'<img src="https://remote.test/pixel">',text:""};expect(messageDoc(input).doc).toContain('http-equiv="Content-Security-Policy"');expect(messageDoc(input).doc).toContain("style-src 'unsafe-inline'");expect(messageDoc(input).doc).toContain("/mail/attachment");expect(messageDoc({...input,showPictures:true}).doc).not.toContain('http-equiv="Content-Security-Policy"');});
 it.each(['<img src="https://a.test/x">','<source srcset="https://a.test/x 2x">','<div style="background:url(//a.test/x)">','<td background="http://a.test/x">','<link rel="stylesheet" href="https://a.test/x">'])('detects remote references in %s',(html)=>expect(hasRemoteContent(html)).toBe(true));
 it("keeps embedded pictures visible without remote consent",()=>{expect(hasRemoteContent('<img src="data:image/png;base64,AAAA">')).toBe(false);expect(hasRemoteContent('<img src="cid:photo">')).toBe(false);expect(messageDoc({html:'<img src="data:image/png;base64,AAAA">',text:""}).doc).toContain("data: blob: cid:");});
});
describe("five second browser send hold",()=>{
 it("does not send before five seconds and releases exactly once",()=>{vi.useFakeTimers();const send=vi.fn();holdSend(send);vi.advanceTimersByTime(4999);expect(send).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(send).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(10000);expect(send).toHaveBeenCalledTimes(1);});
 it("undo or disposal leaves the saved draft unsent",()=>{vi.useFakeTimers();const send=vi.fn(),cancel=holdSend(send);expect(cancel()).toBe(true);expect(cancel()).toBe(false);vi.advanceTimersByTime(10000);expect(send).not.toHaveBeenCalled();});
});
describe("keyboard typing protection",()=>{
 it.each(["INPUT","TEXTAREA","SELECT"])("does not run shortcuts in %s",(tagName)=>{const target={tagName,isContentEditable:false,closest:()=>null} as unknown as EventTarget;expect(typingIn(target)).toBe(true);for(const key of ["c","j","k","e","d","s","u","r","a","f","i","z","/","?"])expect(shortcut({key,target,ctrlKey:false,metaKey:false,altKey:false})).toBeNull();expect(shortcut({key:"k",target,ctrlKey:true,metaKey:false,altKey:false})).toBe("search");});
 it("does not run shortcuts in editable rich text",()=>expect(shortcut({key:"e",target:{isContentEditable:true,tagName:"DIV"} as unknown as EventTarget,ctrlKey:false,metaKey:false,altKey:false})).toBeNull());
 it.each([['c','compose'],['j','next'],['k','previous'],['e','archive'],['d','done'],['s','star'],['u','unread'],['r','reply'],['a','replyAll'],['f','forward'],['i','inspector'],['z','undo'],['/','search'],['?','help'],['Escape','escape']])("maps %s to %s",(key,action)=>expect(shortcut({key,target:null,ctrlKey:false,metaKey:false,altKey:false})).toBe(action));
 it("assigns deterministic colour tones for avatars",()=>{expect(avatarTone("Chepkanga Car Wash")).toBe(avatarTone("Chepkanga Car Wash"));expect(["amber","blue","violet","sage","rose","ember"]).toContain(avatarTone("Nandi Hills Tea Room"));});
});
