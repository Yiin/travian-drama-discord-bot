import { describe, expect, it, vi } from "vitest";

vi.mock("../../actions/messages", () => ({
  cmd: (path: string) => `</${path}:1>`,
  messageUrl: () => "https://discord.com/channels/1/2/3",
}));

import { composeStackPanel, StackEntry, PANEL_TEXT_BUDGET } from "../defense-message";

/** Count every component in the payload the way Discord does (nested included). */
function countComponents(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let count = "type" in node ? 1 : 0;
  for (const child of node.components ?? []) count += countComponents(child);
  if (node.accessory) count += countComponents(node.accessory);
  return count;
}

function totalText(node: any): number {
  if (!node || typeof node !== "object") return 0;
  let total = typeof node.content === "string" ? node.content.length : 0;
  for (const child of node.components ?? []) total += totalText(child);
  return total;
}

function entry(i: number): StackEntry {
  const village = "V".repeat(20);
  const note = "n".repeat(100);
  const line1 = `**#${i} · [${village}](https://ts31.x3.europe.travian.com/karte.php?x=100&y=-100)** (100|-100) · PlayerNameTwenty [ALLIANCE]`;
  const line2 = "▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ **12,345 / 99,999** · 12%";
  const line3 = `-# ${note} · asked by <@123456789012345678> <t:1725300000:R>`;
  return {
    section: `${line1}\n${line2}\n${line3}`,
    compact: `${line1}\n${line2}`,
    accessory: { label: "Send", url: "https://ts31.x3.europe.travian.com/build.php?id=39&gid=16&tt=2&targetMapId=1" },
  };
}

describe("composeStackPanel", () => {
  it("stays under 40 components and 4000 characters with 20 long requests", () => {
    const entries = Array.from({ length: 20 }, (_, i) => entry(i + 1));
    const header = "## 🛡️ Stack requests · 20 open · updated <t:1725300000:R>";
    const footer = "-# ✅ Done today: (1|1), (2|2), (3|3) · Report with the button or </stack sent:1>";
    const json = composeStackPanel(entries, header, footer).toJSON();
    expect(countComponents(json)).toBeLessThanOrEqual(40);
    expect(totalText(json)).toBeLessThanOrEqual(PANEL_TEXT_BUDGET);
    expect(JSON.stringify(json)).toContain("and ");
  });

  it("shows every request when they fit", () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({ ...entry(i + 1), section: `row ${i + 1}`, compact: `row ${i + 1}` }));
    const json = JSON.stringify(composeStackPanel(entries, "header", "footer").toJSON());
    expect(json).toContain("row 3");
    expect(json).not.toContain("more.");
  });

  it("renders the empty state", () => {
    const json = JSON.stringify(composeStackPanel([], "header", "footer").toJSON());
    expect(json).toContain("Everyone is safe.");
  });
});
