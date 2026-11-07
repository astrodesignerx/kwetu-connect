/**
 * Bounded backoff for restarting the SignalR connection after automatic
 * reconnect gives up (or the first start fails). Capped delay, capped attempts,
 * then the UI reports failure instead of retrying forever.
 */
export const TERMINAL_BASE_MS = 1000;
export const TERMINAL_MAX_MS = 30000;
export const TERMINAL_MAX_ATTEMPTS = 10;

export function terminalBackoffDelay(failures: number): number {
  return Math.min(TERMINAL_MAX_MS, TERMINAL_BASE_MS * 2 ** Math.max(0, failures));
}

export function terminalAttemptsExhausted(failures: number): boolean {
  return failures >= TERMINAL_MAX_ATTEMPTS;
}
