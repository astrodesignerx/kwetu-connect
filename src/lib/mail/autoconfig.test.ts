import { describe, expect, it } from "vitest";
import { connectionCandidates, pickServer } from "./autoconfig";

describe("mail server candidates", () => {
  it("tries cPanel incoming hosts in order and SMTP independently of the working IMAP host", () => {
    const c = connectionCandidates("info@kwetuconnectads.co.ke", { label: "KCA", imap: ["mail.kwetuconnectads.co.ke", 993, true], smtp: ["mail.kwetuconnectads.co.ke", 465, true] });
    expect(c.imap).toEqual([["webmail.kwetuconnectads.co.ke", 993, true], ["mail.kwetuconnectads.co.ke", 993, true]]);
    expect(c.smtp("webmail.kwetuconnectads.co.ke")).toEqual([["mail.kwetuconnectads.co.ke", 465, true], ["webmail.kwetuconnectads.co.ke", 465, true], ["smtp.kwetuconnectads.co.ke", 465, true]]);
  });
  it("keeps the domain's published settings and deduplicates candidates", () => {
    const c = connectionCandidates("a@example.test", { label: "Example", imap: ["incoming.host.test", 993, true], smtp: ["outgoing.host.test", 587, false] });
    expect(c.imap.at(-1)).toEqual(["incoming.host.test", 993, true]);
    expect(c.smtp("mail.example.test")).toEqual([["mail.example.test", 465, true], ["smtp.example.test", 465, true], ["outgoing.host.test", 587, false]]);
    expect(pickServer('<incomingServer type="imap"><hostname>imap.%EMAILDOMAIN%</hostname><port>993</port><socketType>SSL</socketType></incomingServer>', "incomingServer", "imap", "example.test", "a")).toEqual(["imap.example.test", 993, true]);
  });
  it("preserves the known provider servers", () => {
    const c = connectionCandidates("a@gmail.com", { label: "Google", imap: ["imap.gmail.com", 993, true], smtp: ["smtp.gmail.com", 465, true] });
    expect(c.imap).toEqual([["imap.gmail.com", 993, true]]);
    expect(c.smtp("imap.gmail.com")).toEqual([["smtp.gmail.com", 465, true]]);
  });
});
