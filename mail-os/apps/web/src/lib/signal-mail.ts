import type { MailDraftDto } from "@kompanion/types";
import { ApiError } from "@kompanion/api-client";
import { api, handleUnauthorized } from "./api";
import { useAuthStore } from "./auth-store";
import { htmlToText } from "./mail-frame";
import type { SignalThreadDetail, SignalThreadSummary } from "./signal-api";

export interface MailInsight { id: string; mailboxConnectionId: string; clientId: string | null; clientName: string | null }
export type MailThreadSummary = SignalThreadSummary & MailInsight;
export type MailThreadDetail = SignalThreadDetail & MailInsight;

async function insights(ids: string[]): Promise<MailInsight[]> {
  if (!ids.length) return [];
  const token = useAuthStore.getState().token;
  const query = new URLSearchParams();
  ids.forEach((id) => query.append("ids", id));
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/mail/insights?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (response.status === 401 && token && useAuthStore.getState().token === token) handleUnauthorized();
  if (!response.ok) throw new ApiError(response.status, "Could not load conversation context.");
  return response.json();
}

// Preserve the real state fields omitted by the shared legacy DTOs.
export const signalMail = {
  listThreads: async (params: Parameters<typeof api.listThreads>[0]) => {
    const page = await api.listThreads(params) as { total: number; items: SignalThreadSummary[] };
    const context = new Map((await insights(page.items.map((thread) => thread.id))).map((item) => [item.id, item]));
    return { ...page, items: page.items.map((thread) => ({ ...thread, ...context.get(thread.id) })) as MailThreadSummary[] };
  },
  getThread: async (id: string): Promise<MailThreadDetail> => {
    const [thread, context] = await Promise.all([api.getThread(id), insights([id])]);
    if (!context[0]) throw new Error("Conversation context is unavailable.");
    return { ...thread as SignalThreadDetail, ...context[0] };
  },
};

export function groupThreads<T extends SignalThreadSummary>(items: T[], now = new Date()) {
  const groups: { label: string; items: T[] }[] = [
    { label: "Needs your reply", items: [] },
    { label: "Today", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const thread of items) {
    const today = thread.lastDate && new Date(thread.lastDate).toDateString() === now.toDateString();
    groups[thread.replyState === "ToReply" ? 0 : today ? 1 : 2].items.push(thread);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function durationLabel(seconds: number | null) {
  if (seconds === null) return "No replies yet";
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}

export function draftReadiness(draft: Pick<MailDraftDto, "toAddrs" | "ccAddrs" | "bccAddrs" | "subject" | "bodyText" | "bodyHtml" | "hasAttachments">) {
  const missing = [];
  if (!draft.toAddrs?.trim()) missing.push("recipient");
  if (!draft.subject?.trim()) missing.push("subject");
  if (!(draft.bodyText?.trim() || htmlToText(draft.bodyHtml ?? "").trim())) missing.push("message");
  return { ready: missing.length === 0, label: missing.length ? `Missing ${missing.join(" and ")}` : "Ready to send" };
}
