import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { commands } from "../commands";

interface OptionJson {
  type: number;
  name: string;
  options?: OptionJson[];
}

/** Every `/name`, `/name sub` and `/name group sub` path of a command. */
function commandPaths(json: { name: string; options?: OptionJson[] }): string[] {
  const options = json.options ?? [];
  const subs = options.filter((o) => o.type === 1).map((o) => `/${json.name} ${o.name}`);
  const grouped = options
    .filter((o) => o.type === 2)
    .flatMap((g) => (g.options ?? []).map((s) => `/${json.name} ${g.name} ${s.name}`));
  const paths = [...subs, ...grouped];
  return paths.length > 0 ? paths : [`/${json.name}`];
}

describe("README command reference", () => {
  const readme = fs.readFileSync(path.join(__dirname, "../../README.md"), "utf8");

  it("lists every command that /help shows", () => {
    const missing = [...commands.values()]
      .filter((c) => c.topic)
      .flatMap((c) => commandPaths(c.data.toJSON()))
      .filter((p) => !readme.includes(`\`${p}\``));
    expect(missing).toEqual([]);
  });
});
