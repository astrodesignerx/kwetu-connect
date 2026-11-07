import { ApiError } from "@kompanion/api-client";
import { handleUnauthorized } from "./api";
import { useAuthStore } from "./auth-store";

export interface WorkspaceOverview {
  workspaceName: string;
  memberCount: number;
  mailboxCount: number;
  templateCount: number;
  sendsLast30Days: number;
  pendingInvitations: number | null;
  mailboxHealth: { healthy: number; pending: number; backfilling: number; needsAttention: number };
}
export interface SyncStats {
  mailboxId: string;
  syncState: string;
  syncError: string | null;
  lastSyncCompletedAt: string | null;
  conversationCount: number;
  messagesSynced: number;
  hourly: { hour: string; count: number }[];
  errorCount24Hours: number | null;
}
export interface DailyAudit { today: string; weeks: number; days: { date: string; count: number }[] }

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api${path}`, {
    signal, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401 && token && useAuthStore.getState().token === token) handleUnauthorized();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export const settingsApi = {
  overview: (signal?: AbortSignal) => get<WorkspaceOverview>("/workspace/overview", signal),
  syncStats: (id: string, signal?: AbortSignal) => get<SyncStats>(`/mailboxes/${encodeURIComponent(id)}/sync-stats?hours=24`, signal),
  dailyAudit: (signal?: AbortSignal) => get<DailyAudit>("/admin/audit-log/daily?weeks=12", signal),
};

export function passwordStrength(password: string) {
  const rules = [
    { key: "length", label: "8 or more characters", met: password.length >= 8 },
    { key: "case", label: "Upper and lower case", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { key: "number", label: "A number", met: /[0-9]/.test(password) },
    { key: "symbol", label: "A symbol", met: /[^A-Za-z0-9\s]/.test(password) },
  ];
  return { rules, score: password ? rules.filter((rule) => rule.met).length : 0 };
}

export type ConnectStage = "idle" | "connecting" | "connected" | "verifying" | "verified" | "connect-error" | "verify-error";
export function connectChecklist(stage: ConnectStage) {
  const connected = ["connected", "verifying", "verified", "verify-error"].includes(stage);
  return [
    { label: "Find server and sign in securely", detail: "Check your receiving server and mailbox password.",
      state: connected ? "complete" : stage === "connecting" ? "running" : stage === "connect-error" ? "error" : "waiting" },
    { label: "Save connection and queue sync", detail: "Save your details securely and prepare to fetch messages.",
      state: connected ? "complete" : "waiting" },
    { label: "Test the saved connection", detail: "Sign in again with your saved details.",
      state: stage === "verified" ? "complete" : stage === "verifying" ? "running" : stage === "verify-error" ? "error" : "waiting" },
  ];
}

export function invitationExpiry(expiresAt: string, status: string, now = Date.now()) {
  if (status === "accepted") return "Accepted";
  if (status === "revoked") return "Revoked";
  const remaining = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remaining)) return "Expiry unavailable";
  if (status === "expired" || remaining <= 0) return "Expired";
  const hours = Math.ceil(remaining / 3_600_000);
  if (remaining < 86_400_000) return hours === 1 ? "Expires within an hour" : `Expires in ${hours} hours`;
  const days = Math.ceil(remaining / 86_400_000);
  return days === 1 ? "Expires in 1 day" : `Expires in ${days} days`;
}

export function auditKind(action: string) {
  if (action.includes("invitation")) return { label: "Invite", colour: "var(--warn)" };
  if (action.includes("role")) return { label: "Role", colour: "var(--jac)" };
  if (action.includes("login") || action.includes("password") || action.includes("auth")) return { label: "Security", colour: "var(--good)" };
  if (action.includes("brand") || action.includes("template") || action.includes("state")) return { label: "Settings", colour: "var(--fg)" };
  return { label: "Access", colour: "var(--muted)" };
}

export function utcHourValues(hourly: SyncStats["hourly"]) {
  const values = Array<number>(24).fill(0);
  for (const bucket of hourly) values[new Date(bucket.hour).getUTCHours()] += bucket.count;
  return values;
}

export function auditLabel(action: string) {
  const labels: Record<string, string> = {
    "admin.users.view": "Viewed the team directory",
    "admin.user.role_change": "Changed a role",
    "admin.invitation.create": "Issued an invitation",
    "admin.invitation.revoke": "Revoked an invitation",
    "admin.mailboxes.view": "Viewed mailbox connections",
    "admin.mailbox.threads.view": "Viewed a mailbox's conversations",
    "admin.thread.view": "Viewed a conversation",
    "admin.workspace.overview": "Viewed the workspace overview",
    "admin.audit.daily.view": "Viewed audit activity",
    "mail.thread.state": "Changed a conversation's reply state",
    "brandkit.update": "Updated email appearance",
    "template.create": "Created a template",
    "template.update": "Updated a template",
    "template.delete": "Deleted a template",
  };
  return labels[action] ?? action.replace(/[._]/g, " ");
}
