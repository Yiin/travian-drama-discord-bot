import { describe, expect, it } from "vitest";
import { villageLink } from "../map-data";

describe("villageLink", () => {
  it("links the name when Discord renders it as a link", () => {
    expect(villageLink("ts1", { x: 74, y: -102 }, "03 CookieJar ᓚᕠᗢ ᶻ")).toBe(
      "[03 CookieJar ᓚᕠᗢ ᶻ](https://ts1.travian.com/karte.php?x=74&y=-102) (74|-102)",
    );
  });

  it("bolds inside the link", () => {
    expect(villageLink("ts1", { x: 1, y: 2 }, "Jure 2", { bold: true })).toBe(
      "[**Jure 2**](https://ts1.travian.com/karte.php?x=1&y=2) (1|2)",
    );
  });

  it("links the coordinates when the name has an emoji", () => {
    expect(villageLink("ts33.x3.international", { x: 75, y: -102 }, "BBᓚᕠᗢ ⭐ ᗢᕡᓗ ... zᶻᶻᶻ")).toBe(
      "BBᓚᕠᗢ ⭐ ᗢᕡᓗ ... zᶻᶻᶻ [(75|-102)](https://ts33.x3.international.travian.com/karte.php?x=75&y=-102)",
    );
  });

  it("links the coordinates and escapes the name when it has markdown characters", () => {
    expect(villageLink("ts1", { x: 1, y: 2 }, "_village_", { bold: true })).toBe(
      "**\\_village\\_** [(1|2)](https://ts1.travian.com/karte.php?x=1&y=2)",
    );
  });

  it("links the coordinates when the name has brackets or is invisible", () => {
    expect(villageLink("ts1", { x: 1, y: 2 }, "[BBC] base")).toContain("[(1|2)]");
    expect(villageLink("ts1", { x: 1, y: 2 }, "\u200B ")).toContain("[(1|2)]");
  });
});
