import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@kompanion/api-client";
import { newComposeKey } from "./compose-keys";

export type SendOutcome = "none" | "safe_failure" | "uncertain" | "accepted";

export interface SendIdentityState {
  key: string;
  outcome: SendOutcome;
  /** Content snapshot at the last safe failure, for edit detection. */
  failedContent: string | null;
}

const PREFIX = "ccos-send:";

function storageKey(compositionId: string): string {
  return `${PREFIX}${compositionId}`;
}

export function loadStoredIdentity(compositionId: string | null): SendIdentityState | null {
  if (!compositionId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(compositionId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { key?: unknown }).key === "string"
    ) {
      const p = parsed as { key: string; outcome?: unknown; failedContent?: unknown };
      const outcome: SendOutcome =
        p.outcome === "uncertain" || p.outcome === "accepted" || p.outcome === "safe_failure"
          ? p.outcome
          : "none";
      return {
        key: p.key,
        outcome,
        failedContent: typeof p.failedContent === "string" ? p.failedContent : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function storeIdentity(compositionId: string | null, state: SendIdentityState): void {
  if (!compositionId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(compositionId), JSON.stringify(state));
  } catch {
    // Private mode or quota: identity stays in memory for the session.
  }
}

export function clearStoredIdentity(compositionId: string | null): void {
  if (!compositionId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(compositionId));
  } catch {
    // Ignore.
  }
}

function serverOutcomeToLocal(status: string | null | undefined): SendOutcome {
  if (status === "Uncertain") return "uncertain";
  if (status === "Accepted") return "accepted";
  if (status === "Failed") return "safe_failure";
  return "none";
}

/** Canonical snapshot of the composed content for edit detection. */
export function snapshotSendContent(parts: {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachmentIds: string[];
  skipBrandWrap: boolean;
}): string {
  return JSON.stringify({
    ...parts,
    attachmentIds: [...parts.attachmentIds].sort(),
  });
}

export type SendErrorAction = "send" | "blocked";

export interface SendErrorResolution {
  action: SendErrorAction;
  /** Key to use if the caller sends again immediately. */
  key: string;
}

export interface SendIdentity {
  key: string;
  outcome: SendOutcome;
  canSend: boolean;
  keyForSend: (content: string) => string;
  noteSuccess: () => void;
  noteError: (error: unknown, content: string) => SendErrorResolution;
  resetWithNewKey: () => void;
}

/**
 * Owns one composition's send identity across reloads and remounts.
 *
 * The key survives reloads (server record first, then local storage) so an
 * uncertain or accepted outcome cannot be bypassed with a fresh key. Editing
 * after a safe failure mints a new key; uncertain and accepted outcomes block
 * new sends until the user explicitly starts over. Network failures are treated
 * as uncertain: the server may already have accepted.
 */
export function useSendIdentity(
  compositionId: string | null,
  serverKey?: string | null,
  serverStatus?: string | null,
  serverFailedContent?: string | null
): SendIdentity {
  const [state, setState] = useState<SendIdentityState>(() => {
    if (serverKey) {
      const outcome = serverOutcomeToLocal(serverStatus);
      return {
        key: serverKey,
        outcome,
        failedContent: outcome === "safe_failure" ? (serverFailedContent ?? null) : null,
      };
    }
    return (
      loadStoredIdentity(compositionId) ?? { key: newComposeKey(), outcome: "none", failedContent: null }
    );
  });

  useEffect(() => {
    storeIdentity(compositionId, state);
  }, [compositionId, state]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const keyForSend = useCallback(
    (content: string): string => {
      if (state.outcome === "safe_failure" && state.failedContent !== null && content !== state.failedContent) {
        const key = newComposeKey();
        setState({ key, outcome: "none", failedContent: null });
        return key;
      }
      return state.key;
    },
    [state]
  );

  const noteSuccess = useCallback(() => {
    setState((s) => ({ ...s, outcome: "accepted", failedContent: null }));
  }, []);

  const noteError = useCallback(
    (error: unknown, content: string): SendErrorResolution => {
      const code = error instanceof ApiError ? error.code : undefined;
      if (code === "uncertain" || code === "in_progress" || code === "already_sent") {
        // Nothing may be sent under the current identity: unknown, active, or
        // already-delivered outcomes all require explicit user resolution first.
        const key = stateRef.current.key;
        setState((s) => ({ ...s, outcome: code === "already_sent" ? "accepted" : "uncertain" }));
        return { action: "blocked", key };
      }
      if (code === "failed_changed" || code === "key_conflict") {
        // Safe: the recorded operation provably never delivered, so this
        // version needs a fresh identity. Minting the key sends nothing by
        // itself; the caller decides whether to send.
        const key = newComposeKey();
        setState({ key, outcome: "none", failedContent: null });
        return { action: "send", key };
      }
      if (code === "not_sent" || (error instanceof ApiError && error.status < 500)) {
        // Safe failures under the same key: record the failed content so an
        // edit afterwards mints a new key.
        setState((s) => ({ ...s, outcome: "safe_failure", failedContent: content }));
        return { action: "send", key: stateRef.current.key };
      }
      // Server errors without a safe code, and network failures where the bytes
      // may have gone out, are uncertainty, not retryable failures.
      const key = stateRef.current.key;
      setState((s) => ({ ...s, outcome: "uncertain" }));
      return { action: "blocked", key };
    },
    []
  );

  const resetWithNewKey = useCallback(() => {
    setState({ key: newComposeKey(), outcome: "none", failedContent: null });
  }, []);

  const canSend = state.outcome !== "uncertain" && state.outcome !== "accepted";
  return { key: state.key, outcome: state.outcome, canSend, keyForSend, noteSuccess, noteError, resetWithNewKey };
}

/** Extracts the machine-readable outcome code from a send failure, if any. */
export function sendErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}
