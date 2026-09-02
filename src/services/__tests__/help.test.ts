import { describe, expect, it } from "vitest";
import { commands } from "../../commands";
import { buildHelpButtons, buildHelpEmbed, HELP_TOPICS } from "../help";

describe("help is generated from the command registry", () => {
  it("lists every command with a topic and hides the rest", () => {
    const listed = new Set<string>();
    for (const topic of HELP_TOPICS) {
      const embed = buildHelpEmbed(commands, topic.id).toJSON();
      for (const field of embed.fields ?? []) {
        listed.add(field.name.split(" ")[0].replace(/^\//, ""));
      }
    }
    for (const command of commands.values()) {
      if (command.topic) expect(listed).toContain(command.data.name);
      else expect(listed).not.toContain(command.data.name);
    }
    expect(listed).not.toContain("penis");
  });

  it("shows every subcommand of a topic with its description", () => {
    const embed = buildHelpEmbed(commands, "defense").toJSON();
    const text = (embed.fields ?? []).map((f) => `${f.name}\n${f.value}`).join("\n");
    expect(text).toContain("/stack");
    expect(text).toContain("stack sent");
    expect(text).toContain("def request");
    expect(text).toContain("Report troops you sent");
  });

  it("overview names every topic and the text shortcuts", () => {
    const embed = buildHelpEmbed(commands).toJSON();
    const names = (embed.fields ?? []).map((f) => f.name);
    for (const topic of HELP_TOPICS) expect(names).toContain(topic.label);
    expect(names.some((n) => n.startsWith("Text shortcuts"))).toBe(true);
    expect(buildHelpButtons(commands).flatMap((r) => r.components).length).toBe(HELP_TOPICS.length + 1);
  });
});
