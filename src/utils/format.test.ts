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
