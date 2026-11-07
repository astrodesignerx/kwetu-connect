import { ApiError } from "@kompanion/api-client";
import type { ThreadDetailDto, ThreadSummaryDto } from "@kompanion/types";
import { handleUnauthorized } from "./api";
import { useAuthStore } from "./auth-store";

export type ReplyState = "ToReply" | "Awaiting" | "Done";
export interface ThreadState {
  replyState: ReplyState;
  stateSince: string;
  needsNudge: boolean;
}
export type SignalThreadSummary = ThreadSummaryDto & ThreadState;
export type SignalThreadDetail = ThreadDetailDto & ThreadState;
export interface ProjectFlightInput { siteName: string; startDate: string; endDate: string }
export interface ProjectFlight extends ProjectFlightInput { id: string; projectId: string }
export interface UpcomingFlight extends ProjectFlight { clientId: string; client: string }
export interface WaitingThread {
  id: string; subject: string | null; stateSince: string; waitingSeconds: number; needsNudge: boolean;
}
export interface ResponseDay { date: string; count: number; medianSeconds: number | null }
export interface MailBrief {
  unreadCount: number;
  waitingOnMe: WaitingThread[];
  awaitingCount: number;
  upcomingFlights: UpcomingFlight[];
  firstReply: { workingDays: number; count: number; medianSeconds: number | null; daily: ResponseDay[] };
}
export interface ResponseTimes {
  by: "client" | "user"; days: number; count: number; medianSeconds: number | null;
  groups: { id: string | null; name: string; count: number; medianSeconds: number }[];
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (response.status === 401 && token && useAuthStore.getState().token === token) handleUnauthorized();
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body as { error?: string; code?: string };
    throw new ApiError(response.status, error.error ?? `Request failed (${response.status})`, error.code);
  }
  return body as T;
}

export const signalApi = {
  brief: (signal?: AbortSignal) => request<MailBrief>("/mail/brief", { signal }),
  responseTimes: (by: "client" | "user" = "client", days = 30, signal?: AbortSignal) =>
    request<ResponseTimes>(`/stats/response-times?${new URLSearchParams({ by, days: String(days) })}`, { signal }),
  setThreadState: (id: string, state: "Done" | "ToReply") =>
    request<ThreadState & { id: string }>(`/mail/threads/${encodeURIComponent(id)}/state`, { method: "POST", body: JSON.stringify({ state }) }),
  flights: (projectId: string, signal?: AbortSignal) =>
    request<ProjectFlight[]>(`/projects/${encodeURIComponent(projectId)}/flights`, { signal }),
  createFlight: (projectId: string, body: ProjectFlightInput) =>
    request<ProjectFlight>(`/projects/${encodeURIComponent(projectId)}/flights`, { method: "POST", body: JSON.stringify(body) }),
  updateFlight: (projectId: string, id: string, body: ProjectFlightInput) =>
    request<ProjectFlight>(`/projects/${encodeURIComponent(projectId)}/flights/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteFlight: (projectId: string, id: string) =>
    request<void>(`/projects/${encodeURIComponent(projectId)}/flights/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
