import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BaseStore, type StoreData } from "./base";
import type { AdvertUpload, Booking } from "./types";
import { ensure, StoreError } from "./validation";

type Row = Record<string, unknown>;
function rename(row: Row, snake: boolean): Row {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [snake ? key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`) : key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value]));
}
function encode(row: { id: string }, booking = false): Row {
  if (!booking) return rename(row as unknown as Row, true);
  const { request, ...rest } = row as Booking;
  return rename({ ...rest, ...request }, true);
}
function decodeBooking(row: Row): Booking {
  const { lengthSeconds, howOften, days, blocks, cells, startDate, endDate, ...rest } = rename(row, false);
  // Bookings saved before 0003_booking_cells have no cells: every chosen day at every chosen time.
  return { ...rest, request: { lengthSeconds, howOften, days, blocks, ...(Array.isArray(cells) && cells.length > 0 ? { cells } : {}), startDate, endDate } } as Booking;
}
function changed<T extends { id: string }>(before: T[], after: T[], booking = false) {
  const old = new Map(before.map((row) => [row.id, JSON.stringify(row)]));
  return after.filter((row) => old.get(row.id) !== JSON.stringify(row)).map((row) => encode(row, booking));
}
export class SupabaseStore extends BaseStore {
  readonly mode = "supabase" as const;
  private client: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    super();
    this.client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  protected async read(): Promise<StoreData> {
    const { data, error } = await this.client.rpc("read_booking_store");
    if (error) { console.error("Booking store read failed:", error.code); throw new StoreError("Unable to read bookings. Please try again."); }
    ensure(data && typeof data.revision === "number", "Apply the bookings migration before using Supabase.");
    return { revision: data.revision, settings: data.settings, advertisers: data.advertisers.map((r: Row) => rename(r, false)), bookings: data.bookings.map(decodeBooking), adverts: data.adverts.map((r: Row) => rename(r, false)), history: data.history.map((r: Row) => rename(r, false)) } as StoreData;
  }
  protected async transaction<T>(change: (data: StoreData) => T): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await this.read();
      const after = structuredClone(before);
      const result = change(after);
      const changes: Row = { advertisers: changed(before.advertisers, after.advertisers), bookings: changed(before.bookings, after.bookings, true), adverts: changed(before.adverts, after.adverts), history: changed(before.history, after.history) };
      if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) changes.settings = after.settings;
      const { data, error } = await this.client.rpc("commit_booking_store", { expected_revision: before.revision, changes });
      if (error) { console.error("Booking store write failed:", error.code); throw new StoreError("Unable to save this change. Please try again."); }
      if (data === true) return result;
      // Retry against a fresh snapshot, including settings, capacity and phone counts.
    }
    throw new StoreError("Another change was saved at the same time. Please try again.");
  }
  async isStaff(email: string) {
    const { data, error } = await this.client.from("staff").select("email").eq("email", email.toLowerCase()).maybeSingle();
    if (error) throw new StoreError("Unable to verify staff access.");
    return Boolean(data);
  }
  async replaceQuote(reference: string, request: unknown, today?: string) {
    const { data, error } = await this.client.rpc("booking_edits_ready");
    if (error || data !== true) throw new StoreError("Plan changes are not available yet. Please ask KCA on WhatsApp.");
    return super.replaceQuote(reference, request, today);
  }
  protected async upload(path: string, file: AdvertUpload) {
    const { error } = await this.client.storage.from("adverts").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (error) throw new StoreError("Unable to upload the advert. Please try again.");
  }
  protected async removeUpload(path: string) {
    const { error } = await this.client.storage.from("adverts").remove([path]);
    if (error) console.error("Unused advert cleanup failed:", error.name);
  }
  protected async fileUrl(path: string) {
    const { data, error } = await this.client.storage.from("adverts").createSignedUrl(path, 60);
    if (error) throw new StoreError("Unable to open the advert.");
    return data.signedUrl;
  }
}
