import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function mailMemoryMode() {
  return ![process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY].every((v) => v?.trim());
}

const shared = globalThis as typeof globalThis & { kcaMailDb?: SupabaseClient };
export function mailDb() {
  return shared.kcaMailDb ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000) }) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
