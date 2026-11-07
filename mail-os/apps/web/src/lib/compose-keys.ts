/**
 * Session-stable caller keys. One compose session owns one draft id (so overlapping
 * autosaves converge on one row) and one idempotency key (so retries of one send
 * replay instead of duplicating).
 */
export function newComposeKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
