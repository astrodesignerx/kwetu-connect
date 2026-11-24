import { promises as dns } from "node:dns";
import { PRESETS } from "./client";

type Server = [host: string, port: number, secure: boolean];
export interface Detected { label: string; imap?: Server; smtp?: Server; hint?: string }

/**
 * Work out a mailbox's servers from the address alone, so nobody has to know server names: known
 * providers, then the domain's MX records, then the host's published autoconfig file, then the usual
 * mail.<domain> name. The connection test afterwards confirms or rejects the guess.
 * Adapted from the Mjengo suite (Sauti Salama).
 */
const preset = (key: keyof typeof PRESETS, label?: string): Detected => ({ ...PRESETS[key], label: label ?? PRESETS[key].label });

const KNOWN: Record<string, Detected> = {
  "kwetuconnectads.co.ke": preset("kca"),
  "gmail.com": preset("gmail", "Gmail"),
  "googlemail.com": preset("gmail", "Gmail"),
  "outlook.com": preset("outlook", "Outlook"),
  "hotmail.com": preset("outlook", "Outlook"),
  "live.com": preset("outlook", "Outlook"),
  "yahoo.com": preset("yahoo"),
  "zoho.com": preset("zoho"),
};

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

async function mxHosts(domain: string): Promise<string[]> {
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 4000);
    return mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange.toLowerCase().replace(/\.$/, ""));
  } catch { return []; }
}

export function pickServer(xml: string, tag: "incomingServer" | "outgoingServer", type: string, domain: string, local: string): Server | null {
  const m = new RegExp(`<${tag}[^>]*type="${type}"[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!m) return null;
  const grab = (t: string) => new RegExp(`<${t}>\\s*([^<]+?)\\s*</${t}>`, "i").exec(m[1])?.[1];
  const host = grab("hostname")?.replace(/%EMAILDOMAIN%/gi, domain).replace(/%EMAILLOCALPART%/gi, local);
  const port = Number(grab("port"));
  const socket = (grab("socketType") ?? "SSL").toUpperCase();
  if (!host || !/^[a-z0-9.-]+$/i.test(host) || !(port > 0 && port < 65536)) return null;
  return [host.toLowerCase(), port, socket === "SSL"];
}

async function autoconfig(domain: string, local: string): Promise<Detected | null> {
  const urls = [
    `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(`${local}@${domain}`)}`,
    `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
    `https://autoconfig.thunderbird.net/v1.1/${domain}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "error", headers: { Accept: "application/xml,text/xml" } });
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 100_000);
      const imap = pickServer(xml, "incomingServer", "imap", domain, local);
      const smtp = pickServer(xml, "outgoingServer", "smtp", domain, local);
      if (imap && smtp) return { label: domain, imap, smtp };
    } catch { /* Try the next source. */ }
  }
  return null;
}

const resolves = async (host: string) => {
  try { return (await withTimeout(dns.resolve4(host), 3000)).length > 0; } catch { return false; }
};

export async function detectMailbox(email: string): Promise<Detected> {
  const [local, domainRaw] = email.trim().toLowerCase().split("@");
  const domain = (domainRaw ?? "").trim();
  if (!local || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Enter a valid email address.");
  if (KNOWN[domain]) return KNOWN[domain];

  const mx = await mxHosts(domain);
  if (mx.some((h) => /(^|\.)(google|googlemail)\.com$/.test(h))) return preset("gmail", "Google Workspace");
  if (mx.some((h) => /(^|\.)(outlook|protection\.outlook|office365)\.com$/.test(h))) return preset("outlook", "Microsoft 365");
  if (mx.some((h) => /(^|\.)zoho\.(com|eu|in)$/.test(h))) return preset("zoho");

  const auto = await autoconfig(domain, local);
  if (auto) return auto;

  for (const host of [`mail.${domain}`, `imap.${domain}`, `webmail.${domain}`, ...mx.slice(0, 1)]) {
    if (await resolves(host)) return { label: domain, imap: [host, 993, true], smtp: [host, 465, true] };
  }
  return { label: domain };
}
