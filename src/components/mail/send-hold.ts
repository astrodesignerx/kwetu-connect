export const UNDO_MS = 5000;
/** Only a live browser can release this hold. Closing it leaves the saved draft unsent. */
export function holdSend(send: () => void, schedule = setTimeout, cancel = clearTimeout) {
  let pending = true;
  const timer = schedule(() => { if (pending) { pending = false; send(); } }, UNDO_MS);
  return () => { if (!pending) return false; pending = false; cancel(timer); return true; };
}
