import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",() => ({}));
const rpc=vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js",() => ({createClient:() => ({rpc})}));
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import { demoData } from "./demo";
import { DEFAULT_SETTINGS } from "../booking/settings";
afterEach(() => {vi.unstubAllEnvs();rpc.mockReset();});
describe("read-only staff mail directory",() => {
  it("reads all related records from memory with detached data and no writes",async () => {
    vi.stubEnv("KCA_DEMO_DATA","1");const store=new MemoryStore();
    const before=await store.listBookings();const directory=await store.mailDirectory();
    expect(directory.bookings).toHaveLength(before.length);expect(directory.advertisers.length).toBeGreaterThan(0);expect(directory.adverts.length).toBeGreaterThan(0);
    directory.bookings[0].priceKes=0;directory.advertisers[0].email="changed@example.com";directory.settings.kesPerSecond=999;
    expect(await store.listBookings()).toEqual(before);
    expect((await store.mailDirectory()).settings).toEqual(DEFAULT_SETTINGS);
  });
  it("uses exactly one Supabase snapshot RPC, never a commit or per-row lookup",async () => {
    const data=demoData("2026-11-24");
    const snake=(value:object) => Object.fromEntries(Object.entries(value).map(([key,v]) => [key.replace(/[A-Z]/g,(c) => "_"+c.toLowerCase()),v]));
    rpc.mockResolvedValue({data:{...data,advertisers:data.advertisers.map(snake),adverts:data.adverts.map(snake),history:data.history.map(snake),bookings:data.bookings.map(({request,...b}) => snake({...b,...request}))},error:null});
    const store=new SupabaseStore("https://example.supabase.co","fake");
    const actual=await store.mailDirectory();
    expect(actual).toEqual({advertisers:data.advertisers,bookings:data.bookings,adverts:data.adverts,settings:DEFAULT_SETTINGS});
    expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith("read_booking_store");
  });
  it("propagates a failed snapshot rather than inventing empty business data",async () => {
    rpc.mockResolvedValue({data:null,error:{code:"unavailable"}});
    await expect(new SupabaseStore("https://example.supabase.co","fake").mailDirectory()).rejects.toThrow("Unable to read bookings");
  });
});
