import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("leaves plain text and numbers alone", () => {
    expect(csvCell("Kimumu Events")).toBe("Kimumu Events");
    expect(csvCell(3200)).toBe("3200");
    expect(csvCell(-5)).toBe("-5");
  });
  it("writes empty cells for missing values", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("quotes commas, quotes and line breaks and doubles inner quotes", () => {
    expect(csvCell("Tea, Coffee")).toBe('"Tea, Coffee"');
    expect(csvCell('The "Best" Bakery')).toBe('"The ""Best"" Bakery"');
    expect(csvCell("Line one\nLine two")).toBe('"Line one\nLine two"');
  });
  it("defuses text that starts like a spreadsheet formula", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(csvCell("+254700000000")).toBe("'+254700000000");
  });
  it("joins rows with CRLF and ends with a line break", () => {
    expect(toCsv([["a", "b"], [1, "c,d"]])).toBe('a,b\r\n1,"c,d"\r\n');
  });
});
