import { describe, expect, it } from "vitest";
import { demoData } from "@/lib/store/demo";
import { DEFAULT_SETTINGS } from "@/lib/booking/settings";
import { quote } from "@/lib/booking/quote";
import { readAnswers } from "@/lib/booking/answers";
import { clientsFrom, matchIndex, managerBrief, quickQuote, threadKey } from "./kca";
import { filterConversations } from "./conversations";
import type { MessageRow } from "@/app/mail/actions";

const today="2026-11-24";
const data={...demoData(today),settings:DEFAULT_SETTINGS};
const match=matchIndex(data);
describe("KCA conversation matching",() => {
  it("matches sender and other participants by case-insensitive email",() => {
    expect(match({subject:"Our run",addresses:[" DAVID@EXAMPLE.COM "]}).client?.advertiser.name).toBe("David Otieno");
    expect(match({subject:"Our run",addresses:["staff@example.net","david@example.com"]}).by).toBe("email");
  });
  it("matches references in subject, plain body and HTML, regardless of case",() => {
    const reference=data.bookings[0].reference;
    for(const input of [{subject:reference.toLowerCase()},{subject:"Hi",text:`About ${reference}.`},{subject:"Hi",html:`<p>${reference}</p>`}]) expect(match({...input,addresses:[]}).booking?.reference).toBe(reference);
  });
  it("lets a reference beat a conflicting participant email",() => {
    const result=match({subject:"Our booking",text:data.bookings[0].reference,addresses:["david@example.com"]});
    expect(result.by).toBe("reference");expect(result.client?.advertiser.name).toBe("Grace Wanjiru");
  });
  it("reports no match and unknown references honestly",() => {
    expect(match({subject:"New enquiry",addresses:["new@example.net"]}).client).toBeNull();
    expect(match({subject:"KCA-UNKNOWN123",addresses:["david@example.com"]}).unknownReference).toBe("KCA-UNKNOWN123");
  });
  it("groups repeated booking contacts without changing or double counting bookings",() => {
    const d=structuredClone(data);const first=d.advertisers[0];d.advertisers.push({...first,id:"second",email:first.email.toUpperCase()});
    d.bookings.push({...d.bookings[0],id:"second-b",reference:"KCA-SECOND",advertiserId:"second"});
    expect(clientsFrom(d).find((c) => c.emails.includes(first.email))?.bookings).toHaveLength(2);
    expect(threadKey("Aw: Re: Run")).toBe("run");
  });
});
describe("mail quote and manager brief",() => {
  it("has exactly the public quote price and plays and round-trips the public URL",() => {
    const request=readAnswers({len:"15",often:"10",days:"1,3,6",blocks:"morning,evening",from:"2026-12-01",to:"2026-12-28"},today,DEFAULT_SETTINGS);
    const result=quickQuote(request,DEFAULT_SETTINGS);
    expect(result.result).toEqual(quote(request,DEFAULT_SETTINGS));
    expect(readAnswers(Object.fromEntries(new URLSearchParams(result.href.split("?")[1])),today,DEFAULT_SETTINGS)).toEqual(request);
    if(result.result.ok) {expect(result.reply).toContain(result.result.plays.toLocaleString("en-GB"));expect(result.reply).toContain(result.result.priceKes.toLocaleString("en-GB"));}
  });
  it("populates each manager section from the sample booking snapshot",() => {
    const brief=managerBrief(data,today);
    expect(brief.review.length).toBeGreaterThan(0);expect(brief.payment.length).toBeGreaterThan(0);expect(brief.live.length).toBeGreaterThan(0);expect(brief.next.length).toBeGreaterThan(0);
    expect(brief.payment.every((b) => b.status==="Quote")).toBe(true);
    expect(brief.next.every((b) => b.request.startDate>today && b.request.startDate<="2026-12-01")).toBe(true);
    expect(managerBrief({...data,bookings:[]},today)).toEqual({review:[],payment:[],live:[],next:[]});
  });
});
const row=(subject:string,date:string,extra:Partial<MessageRow>={}):MessageRow => ({uid:1,mailbox:"INBOX",from:{name:"Client",address:"client@example.com"},to:[{name:"",address:"me@example.com"}],subject,date,seen:true,flagged:false,answered:false,hasAttachments:false,messageId:null,thread:1,...extra});
describe("conversation sections",() => {
  it("keeps waiting conversations oldest first and removes a later outgoing reply",() => {
    const rows=[row("Older","2026-11-20"),row("Newer","2026-11-23"),row("Re: Done","2026-11-24",{mailbox:"Sent",from:{name:"Me",address:"me@example.com"}}),row("Done","2026-11-21")];
    expect(filterConversations(rows,{kind:"waiting"},"me@example.com").map((r) => r.subject)).toEqual(["Older","Newer"]);
  });
  it("matches clients from CC and assigned conversations across subject prefixes",() => {
    const rows=[row("Re: Campaign","2026-11-23",{cc:[{name:"",address:"COPY@EXAMPLE.COM"}]})];
    expect(filterConversations(rows,{kind:"client",emails:["copy@example.com"]},"me@example.com")).toHaveLength(1);
    expect(filterConversations(rows,{kind:"assigned",subjects:["campaign"]},"me@example.com")).toHaveLength(1);
  });
});
