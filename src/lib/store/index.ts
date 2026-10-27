import "server-only";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { BookingStore } from "./types";

type StoreGlobal = typeof globalThis & { kcaBookingStore?: BookingStore; kcaDemoWarning?: boolean };
const shared = globalThis as StoreGlobal;
export function isMemoryMode() {
  return ![process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].every((s) => s?.trim());
}
export function getStore(): BookingStore {
  const memory = isMemoryMode();
  if (!shared.kcaBookingStore || shared.kcaBookingStore.mode !== (memory ? "memory" : "supabase")) {
    shared.kcaBookingStore = memory ? new MemoryStore() : new SupabaseStore(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  if (memory && !shared.kcaDemoWarning) {
    console.warn("KCA bookings: Demo data, nothing is saved. Supabase is not configured.");
    shared.kcaDemoWarning = true;
  }
  return shared.kcaBookingStore;
}
