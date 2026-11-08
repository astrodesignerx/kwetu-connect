import { ApiError } from "@kompanion/api-client";
import { handleUnauthorized } from "./api";
import { useAuthStore } from "./auth-store";
import type { ProjectFlightInput, ReplyState } from "./signal-api";

export interface ClientActivity {
  id: string; name: string; domain: string | null; projectCount: number; threadCount: number; boardsBooked: number;
  waitingCount: number; status: "WaitingOnUs" | "AllReplied";
  weeks: { startDate: string; conversations: number }[];
}
export interface ClientInsights {
  clientId: string; startDate: string; endDate: string; boardsBooked: number;
  firstReply: { days: number; count: number; medianSeconds: number | null };
  lastContactAt: string | null; threadCount: number; waitingCount: number;
  recentThreads: { id: string; subject: string | null; participants: string | null; snippet: string | null;
    lastDate: string | null; hasUnread: boolean; replyState: ReplyState; stateSince: string; needsNudge: boolean }[];
}

async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/companies${path}`, {
    signal, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401 && token && useAuthStore.getState().token === token) handleUnauthorized();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export const clientsApi = {
  activity: (signal?: AbortSignal) => read<ClientActivity[]>("/activity?weeks=8", signal),
  insights: (id: string, signal?: AbortSignal) => read<ClientInsights>(`/${encodeURIComponent(id)}/insights`, signal),
};

export function validateFlight(input: ProjectFlightInput): string | null {
  if (!input.siteName.trim() || input.siteName.length > 200) return "Enter a site name of up to 200 characters.";
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= "0001-01-01"
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(input.startDate) || !validDate(input.endDate)) return "Choose valid start and end dates.";
  if (input.endDate < input.startDate) return "End date must be on or after start date.";
  return null;
}

export function nairobiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function displayDate(value: string | null): string {
  if (!value) return "No contact yet";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function replyDuration(seconds: number | null): string {
  if (seconds === null) return "No replies yet";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
