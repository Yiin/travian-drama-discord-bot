import { describe, expect, it } from "vitest";
import { filterChoices, pushChoiceLabel, stackChoiceLabel } from "./choices";

describe("stackChoiceLabel", () => {
  it("formats id, village, coords and progress", () => {
    const request = { id: 41, x: 12, y: -45, troopsSent: 1200, troopsNeeded: 5000 };
    expect(stackChoiceLabel(request, "Capital")).toBe("#41 · Capital (12|-45) · 1,200/5,000");
    expect(stackChoiceLabel(request, "Capital", true)).toBe("➡️ #41 · Capital (12|-45) · 1,200/5,000");
    expect(stackChoiceLabel(request, undefined)).toBe("#41 · (12|-45) · 1,200/5,000");
  });

  it("never exceeds Discord's 100-character label limit", () => {
    const request = { id: 41, x: 12, y: -45, troopsSent: 1200, troopsNeeded: 5000 };
    expect(stackChoiceLabel(request, "V".repeat(200)).length).toBeLessThanOrEqual(100);
  });
});

describe("pushChoiceLabel", () => {
  it("uses resource formatting", () => {
    expect(pushChoiceLabel({ id: 9, x: 1, y: 2, resourcesSent: 250000, resourcesNeeded: 500000 }, "Capital")).toBe(
      "#9 · Capital (1|2) · 250k/500k"
    );
  });
});

describe("filterChoices", () => {
  const choices = Array.from({ length: 30 }, (_, i) => ({ name: `#${i + 1} · Village${i + 1}`, value: String(i + 1) }));

  it("matches case-insensitively and caps at 25", () => {
    expect(filterChoices(choices, "")).toHaveLength(25);
    expect(filterChoices(choices, "village3").map((c) => c.value)).toEqual(["3", "30"]);
    expect(filterChoices(choices, "#12")).toEqual([{ name: "#12 · Village12", value: "12" }]);
  });
});
