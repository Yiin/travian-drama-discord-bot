import { describe, expect, it } from "vitest";
import { isValidReportLink, normalizeReportLink } from "./report-link";

describe("isValidReportLink", () => {
  it("accepts report links on the configured server and any travian.com host", () => {
    expect(isValidReportLink("https://ts31.x3.europe.travian.com/report?id=123", "ts31.x3.europe")).toBe(true);
    expect(isValidReportLink("https://ts5.x1.international.travian.com/report/overview?id=9")).toBe(true);
    expect(isValidReportLink(" http://ts31.x3.europe.travian.com/berichte.php?id=1 ", "ts31.x3.europe")).toBe(true);
  });

  it("rejects other hosts, other schemes, and plain text", () => {
    expect(isValidReportLink("https://example.com/report?id=1", "ts31.x3.europe")).toBe(false);
    expect(isValidReportLink("ftp://ts31.x3.europe.travian.com/report", "ts31.x3.europe")).toBe(false);
    expect(isValidReportLink("2,400 EI and 800 TK", "ts31.x3.europe")).toBe(false);
    expect(isValidReportLink("travian.com.evil.net/report")).toBe(false);
  });

  it("normalizes whitespace", () => {
    expect(normalizeReportLink("  https://ts31.x3.europe.travian.com/report?id=1 ")).toBe("https://ts31.x3.europe.travian.com/report?id=1");
  });
});
