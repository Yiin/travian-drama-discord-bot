import { describe, expect, it } from "vitest";
import { formatResources, formatTroops } from "./format";

describe("formatTroops", () => {
  it("groups thousands and drops decimals", () => {
    expect(formatTroops(1200)).toBe("1,200");
    expect(formatTroops(5000)).toBe("5,000");
    expect(formatTroops(12345.6)).toBe("12,346");
  });
});

describe("formatResources", () => {
  it("uses k and M with no forced decimal", () => {
    expect(formatResources(950)).toBe("950");
    expect(formatResources(500000)).toBe("500k");
    expect(formatResources(5000)).toBe("5k");
    expect(formatResources(1200000)).toBe("1.2M");
    expect(formatResources(2000000)).toBe("2M");
    expect(formatResources(1250)).toBe("1.3k");
    expect(formatResources(12500)).toBe("13k");
  });
});

describe("progressBar", () => {
  it("fills 16 cells in proportion and caps at 100%", async () => {
    const { progressBar, percentOf } = await import("./format");
    expect(progressBar(0, 5000)).toBe("▱".repeat(16));
    expect(progressBar(1200, 5000)).toBe("▰▰▰▰" + "▱".repeat(12));
    expect(progressBar(5000, 5000)).toBe("▰".repeat(16));
    expect(progressBar(9000, 5000)).toBe("▰".repeat(16));
    expect(percentOf(1200, 5000)).toBe(24);
    expect(percentOf(10, 0)).toBe(0);
  });
});
