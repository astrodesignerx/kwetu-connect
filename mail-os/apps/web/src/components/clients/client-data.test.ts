import { describe, expect, it } from "vitest";
import { validateFlight } from "@/lib/signal-clients";
import { fromChips, toChips, variablesIn } from "@/lib/merge-fields";

describe("flight dates", () => {
  const flight = { siteName: "Westlands", startDate: "2026-10-22", endDate: "2026-10-22" };
  it("allows a one-day flight and rejects reversed dates", () => {
    expect(validateFlight(flight)).toBeNull();
    expect(validateFlight({ ...flight, endDate: "2026-10-21" })).toBe("End date must be on or after start date.");
  });
  it("rejects missing, impossible and malformed dates and blank site names", () => {
    for (const date of ["", "2026-02-30", "tomorrow", "0000-01-01"]) expect(validateFlight({ ...flight, startDate: date })).not.toBeNull();
    expect(validateFlight({ ...flight, siteName: " " })).not.toBeNull();
  });
});

describe("template storage compatibility", () => {
  it("keeps placeholders and repeatable blocks through the pill editor", () => {
    const html = "<p>Hi {{client_name}},</p><p>{{custom_field}}</p>{{#each sites}}<p>{{item}}</p>{{/each}}";
    expect(fromChips(toChips(html))).toBe(html);
    expect(variablesIn("For {{client_name}}", html)).toEqual(["client_name", "custom_field", "item"]);
  });
});
