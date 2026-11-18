import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SETTINGS } from "../../lib/booking/settings";
import { quote } from "../../lib/booking/quote";
import { RULEBOOK_EXAMPLES } from "../../lib/store/examples";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@phosphor-icons/react", () => ({
  X: ({ size = 16 }: { size?: number }) => <svg width={size} height={size} aria-hidden="true" />,
}));
vi.mock("@/app/manage/actions", () => ({ saveSettings: async () => ({ message: "" }) }));
vi.mock("@/lib/booking/hours", async () => import("../../lib/booking/hours"));
vi.mock("@/lib/booking/quote", async () => import("../../lib/booking/quote"));
vi.mock("@/lib/dashboard", async () => import("../../lib/dashboard"));
vi.mock("@/lib/format/dates", async () => import("../../lib/format/dates"));
vi.mock("@/lib/store/validation", async () => import("../../lib/store/validation"));
vi.mock("@/lib/store/examples", async () => import("../../lib/store/examples"));
vi.mock("@/components/booking/QuoteTotals", async () => import("../booking/QuoteTotals"));

import SettingsRuleTiles from "./SettingsRuleTiles";
import SettingsEditor from "./SettingsEditor";
import ScheduleWeekGrid from "./ScheduleWeekGrid";
import ScheduleSelectedHour from "./ScheduleSelectedHour";
import ScheduleHours from "./ScheduleHours";
import ManagerScreenSkeleton from "./ManagerScreenSkeleton";

const renderTiles = (settings = DEFAULT_SETTINGS) => renderToStaticMarkup(<SettingsRuleTiles candidate={settings} open="price" onSelect={() => {}} />);

describe("Ember glass screen rules", () => {
  it("keeps every existing editable rule and uses the saved values", () => {
    const html = renderTiles();
    expect(html.match(/data-section=/g)).toHaveLength(8);
    expect(html).toContain('aria-controls="settings-panel"');
    expect(html).toContain("Smallest order KES 3,000");
    expect(html).toContain("45 min");
    expect(html).toContain("Late block runs Fri to Sun only");
    expect(html).toContain("5s / play");
    expect(html).toContain("5 lengths on offer");
  });
  it("supports an empty discount table without inventing a threshold", () => {
    const html = renderTiles({ ...DEFAULT_SETTINGS, discountSteps: [] });
    expect(html).toContain("No discount steps");
    expect(html).toContain("All orders");
    expect(html).not.toContain("Under 0");
  });
  it("does not round saleable minutes into a misleading whole number", () => {
    expect(renderTiles({ ...DEFAULT_SETTINGS, secondsForSalePerHour: 2730 })).toContain("45.5 min");
  });
  it("renders the SettingsEditor with real quote sample orders and existing controls", () => {
    const html = renderToStaticMarkup(<SettingsEditor initial={DEFAULT_SETTINGS} activeBookings={4} />);
    expect(html).toContain("Editing <span>Price</span>");
    expect(html).toContain("No changes to save");
    expect(html).toContain("Reset");
    expect(html).toContain("4 keep their booked price");
    for (const example of RULEBOOK_EXAMPLES) {
      const q = quote(example.request, DEFAULT_SETTINGS);
      if (q.ok) {
        expect(html).toContain(q.priceKes.toLocaleString("en-GB"));
      }
    }
  });
});

describe("Ember glass planned schedule", () => {
  it("groups hours by the real blocks and preserves selectable closed hours", () => {
    const html = renderToStaticMarkup(<ScheduleWeekGrid rows={[{ date: "2026-11-17", label: "Tue", hours: [{ hour: 6, share: .25 }, { hour: 7, share: 0, closed: true }] }]} blocks={DEFAULT_SETTINGS.timeBlocks} selected={{ date: "2026-11-17", hour: 7 }} today="2026-11-17" onSelect={() => {}} />);
    expect(html).toContain("Morning");
    expect(html).toContain("25% sold, planned");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Screen closed");
  });
  it("shows saleable shares, playlist pill, links and a separate reserved-time explanation", () => {
    const html = renderToStaticMarkup(<ScheduleSelectedHour date="2026-11-17" hour={6} items={[{ reference: "KCA-EXAMPLE", business: "Test business", seconds: 1350, share: .5 }]} secondsForSale={2700} isOpen playlist={{ name: "P01", entries: 12 }} />);
    expect(html).toContain("50%");
    expect(html).toContain("22.5 of 45 min");
    expect(html).toContain("/manage/bookings/KCA-EXAMPLE");
    expect(html).toContain("P01, 12 entries");
    expect(html).toContain("Unsold saleable time");
    expect(html).toContain("Reserved KCA time is separate");
  });
  it("keeps a closed hour honest", () => {
    const html = renderToStaticMarkup(<ScheduleSelectedHour date="2026-11-17" hour={23} items={[]} secondsForSale={2700} isOpen={false} playlist={null} />);
    expect(html).toContain("Closed");
    expect(html).toContain("No playlist");
    expect(html).toContain("No plays are planned");
    expect(html).not.toContain("Unsold saleable time");
  });
  it("renders ScheduleHours with day average, peak, screen open, bands and week grid", () => {
    const html = renderToStaticMarkup(
      <ScheduleHours
        schedule={{
          playlists: [{ name: "P01", items: [{ kind: "advert", bookingId: "KCA-1", advert: "ad.mp4", start: 0, seconds: 1350 }] }],
          rows: [{ playlist: "P01", startDate: "2026-11-17", endDate: "2026-11-17", startHour: 6, endHour: 10 }],
          playlistsCsv: "",
          scheduleCsv: "",
        }}
        businesses={{ "KCA-1": "Test Cafe" }}
        settings={DEFAULT_SETTINGS}
        from="2026-11-16"
        to="2026-11-22"
        now="2026-11-17T05:00:00Z"
      />
    );
    expect(html).toContain("Day average");
    expect(html).toContain("Peak, from 06:00");
    expect(html).toContain("Screen open");
    expect(html).toContain("06 to 22");
    expect(html).toContain("This week by hour");
    expect(html).toContain("Test Cafe");
  });
  it("provides matching page headings and eight loading rule tiles", () => {
    expect(renderToStaticMarkup(<ManagerScreenSkeleton />)).toContain("Screen schedule");
    const html = renderToStaticMarkup(<ManagerScreenSkeleton settings />);
    expect(html).toContain("Screen settings");
    expect(html.match(/data-section=/g)).toHaveLength(8);
  });
});
