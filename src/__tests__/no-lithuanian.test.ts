import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

const WORDS = [
  "karius", "tikslas", "kariai", "kaimai", "kaimus", "patvirtinti", "redaguoti",
  "pvz.", "dalyvis", "pozicija", "siteriai", "statistika", "populiacija", "gynyba",
  "daugiausiai", "miestai", "veiksmo", "atnaujino",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("user-facing strings are English", () => {
  it("contains no Lithuanian leftovers", () => {
    const root = join(__dirname, "..");
    const hits: string[] = [];
    for (const file of walk(root)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const lower = line.toLowerCase();
        for (const word of WORDS) {
          if (lower.includes(word)) hits.push(`${relative(root, file)}:${i + 1} ${word}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
