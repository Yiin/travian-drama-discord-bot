import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  EmbedBuilder,
} from "discord.js";
import { Command, HelpTopic } from "../types";
import { cmd } from "../actions/messages";

export const HELP_BUTTON_PREFIX = "help:";

export const HELP_TOPICS: { id: HelpTopic; label: string; blurb: string }[] = [
  { id: "defense", label: "Defense", blurb: "Stack queue for long-term stacking, defense calls for incoming attacks." },
  { id: "scouting", label: "Scouting", blurb: "Ask the scouts to check a village." },
  { id: "pushes", label: "Pushes", blurb: "Resource pushes, one thread per request." },
  { id: "you", label: "You", blurb: "Your account link and sitter list." },
  { id: "info", label: "Info", blurb: "Lookups, stats, undo." },
  { id: "admin", label: "Admin", blurb: "Setup and reminders." },
];

const TEXT_SHORTCUTS = [
  "`!stack 12|-45 5000 anti cav` · `!sent 41 500` · `!remove 41` · `!move 41 1`",
  "`!def 12|-45 14:30 note` · `!sent 500` (inside a defense thread) · `!close`",
  "`!scout 12|-45 WWK or fake?` · `!lookup Player` · `!undo` · `!help`",
];

interface SubcommandJson {
  type: number;
  name: string;
  description: string;
  options?: SubcommandJson[];
}

/** Every `/name sub` line for a command, from its registered options. */
function commandLines(command: Command): string[] {
  const json = command.data.toJSON();
  const options = (json.options ?? []) as SubcommandJson[];
  const groups = options.filter((o) => o.type === 2);
  const subs = options.filter((o) => o.type === 1);

  if (groups.length === 0 && subs.length === 0) {
    return [`${cmd(json.name)} · ${command.summary ?? json.description}`];
  }

  const lines: string[] = [];
  for (const sub of subs) {
    lines.push(`${cmd(`${json.name} ${sub.name}`)} · ${sub.description}`);
  }
  for (const group of groups) {
    for (const sub of group.options ?? []) {
      lines.push(`${cmd(`${json.name} ${group.name} ${sub.name}`)} · ${sub.description}`);
    }
  }
  return lines;
}

export function commandsForTopic(commands: Collection<string, Command>, topic: HelpTopic): Command[] {
  return [...commands.values()].filter((c) => c.topic === topic);
}

/** Overview when no topic is chosen, or the full list for one topic. */
export function buildHelpEmbed(commands: Collection<string, Command>, topic?: HelpTopic): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(0x5865f2);

  if (!topic) {
    embed.setTitle("Drama · how to use it");
    embed.setDescription(
      "Most things are buttons on the panels in the stack, defense-call, scouting and push channels. " +
        "Commands do the same from anywhere. Pick a topic below for the full list."
    );
    for (const t of HELP_TOPICS) {
      const names = commandsForTopic(commands, t.id).map((c) => cmd(c.data.name));
      if (names.length === 0) continue;
      embed.addFields({ name: t.label, value: `${t.blurb}\n${names.join(" · ")}` });
    }
    embed.addFields({ name: "Text shortcuts (prefix `!`)", value: TEXT_SHORTCUTS.join("\n") });
    return embed;
  }

  const meta = HELP_TOPICS.find((t) => t.id === topic)!;
  embed.setTitle(`Drama · ${meta.label}`);
  embed.setDescription(meta.blurb);
  for (const command of commandsForTopic(commands, topic)) {
    embed.addFields({
      name: `/${command.data.name} · ${command.summary ?? command.data.description}`,
      value: commandLines(command).join("\n").slice(0, 1024),
    });
  }
  return embed;
}

export function buildHelpButtons(commands: Collection<string, Command>, active?: HelpTopic): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = HELP_TOPICS.filter((t) => commandsForTopic(commands, t.id).length > 0).map((t) =>
    new ButtonBuilder()
      .setCustomId(`${HELP_BUTTON_PREFIX}${t.id}`)
      .setLabel(t.label)
      .setStyle(t.id === active ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${HELP_BUTTON_PREFIX}overview`)
      .setLabel("Overview")
      .setStyle(active ? ButtonStyle.Secondary : ButtonStyle.Primary)
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + 5)));
  }
  return rows;
}

export function isHelpTopic(value: string): value is HelpTopic {
  return HELP_TOPICS.some((t) => t.id === value);
}
