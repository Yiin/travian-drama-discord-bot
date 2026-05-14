import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Command } from "../types";

export interface CommandDoc {
  name: string;
  description: { lt: string; en: string };
  usage: string;
  example: string;
  adminOnly?: boolean;
}

export const commandDocs: CommandDoc[] = [
  // Defense commands
  {
    name: "/def",
    description: {
      lt: "Create or update a defense request",
      en: "Create or update a defense request",
    },
    usage: "/def coords:<coordinates> troops:<number> [message:<message>]",
    example: "/def coords:123|456 troops:5000 message:Incoming hammer",
  },
  {
    name: "/sent",
    description: {
      lt: "Report troops sent to a defense request",
      en: "Report troops sent to a defense request",
    },
    usage: "/sent target:<ID or coordinates> troops:<number> [user:<user>]",
    example: "/sent target:1 troops:2000",
  },
  {
    name: "/stack",
    description: {
      lt: "Same as /sent - report troops sent to a defense request",
      en: "Same as /sent - report troops sent to a defense request",
    },
    usage: "/stack target:<ID or coordinates> troops:<number> [user:<user>]",
    example: "/stack target:123|456 troops:1500",
  },
  {
    name: "/deletedef",
    description: {
      lt: "Delete a defense request",
      en: "Delete a defense request",
    },
    usage: "/deletedef id:<number>",
    example: "/deletedef id:3",
  },
  {
    name: "/updatedef",
    description: {
      lt: "Update a defense request",
      en: "Update a defense request",
    },
    usage: "/updatedef id:<number> [troops_sent:<number>] [troops_needed:<number>] [message:<message>]",
    example: "/updatedef id:1 troops_sent:3000 troops_needed:6000",
  },
  {
    name: "/undo",
    description: {
      lt: "Undo a previous action",
      en: "Undo a previous action",
    },
    usage: "/undo id:<action ID>",
    example: "/undo id:5",
  },
  {
    name: "/stackinfo",
    description: {
      lt: "Re-post the defense request list",
      en: "Re-post the defense request list",
    },
    usage: "/stackinfo",
    example: "/stackinfo",
  },

  // Scout commands
  {
    name: "/scout",
    description: {
      lt: "Send a scouting request",
      en: "Send a scouting request",
    },
    usage: "/scout coords:<coordinates> message:<message>",
    example: "/scout coords:-50|120 message:WWK or fake?",
  },

  // Lookup command
  {
    name: "/lookup",
    description: {
      lt: "Look up village or player information",
      en: "Look up village or player information",
    },
    usage: "/lookup query:<coordinates or name>",
    example: "/lookup query:PlayerName",
  },

  // Addstat command
  {
    name: "/addstat",
    description: {
      lt: "Add troops sent to stats (without a defense request)",
      en: "Add troops sent to stats (without defense request)",
    },
    usage: "/addstat coords:<coordinates> troops:<number>",
    example: "!addstat 123|456 5000",
  },

  // Account/Sitter commands
  {
    name: "/account set",
    description: {
      lt: "Associate yourself with an in-game account",
      en: "Associate yourself with an in-game account",
    },
    usage: "/account set <name>",
    example: "!account set MyPlayerName",
  },
  {
    name: "/account del",
    description: {
      lt: "Remove your in-game account association",
      en: "Remove your in-game account association",
    },
    usage: "/account del",
    example: "!account del",
  },
  {
    name: "/sitter set",
    description: {
      lt: "Mark yourself as a sitter for one or more players",
      en: "Mark yourself as a sitter for one or more players",
    },
    usage: "/sitter set <names, separated by commas>",
    example: "!sitter set Player1, Player2",
  },
  {
    name: "/sitter del",
    description: {
      lt: "Remove yourself as a sitter for one or more players",
      en: "Remove yourself as a sitter for one or more players",
    },
    usage: "/sitter del <names, separated by commas>",
    example: "!sitter del Player1",
  },
  {
    name: "/players",
    description: {
      lt: "List all players with their Discord users and sitters",
      en: "List all players with their Discord users and sitters",
    },
    usage: "/players",
    example: "!players",
  },

  // Stats commands
  {
    name: "/stats leaderboard",
    description: {
      lt: "Show users ranked by total troops sent",
      en: "Show users ranked by total troops sent",
    },
    usage: "/stats leaderboard",
    example: "/stats leaderboard",
    adminOnly: true,
  },
  {
    name: "/stats user",
    description: {
      lt: "Show stats for a specific user",
      en: "Show stats for a specific user",
    },
    usage: "/stats user @user",
    example: "!stats user @Jonas",
    adminOnly: true,
  },
  {
    name: "/stats player",
    description: {
      lt: "Show stats for villages owned by a Travian player",
      en: "Show stats for villages owned by a Travian player",
    },
    usage: "/stats player <name>",
    example: "!stats player PlayerName",
    adminOnly: true,
  },
  {
    name: "/stats village",
    description: {
      lt: "Show stats for a specific village",
      en: "Show stats for a specific village",
    },
    usage: "/stats village <coordinates>",
    example: "!stats village 123|456",
    adminOnly: true,
  },
  {
    name: "/stats stacks",
    description: {
      lt: "Show villages ranked by total defense collected",
      en: "Show villages ranked by total defense collected",
    },
    usage: "/stats stacks",
    example: "!stats stacks",
    adminOnly: true,
  },

  // Configuration commands
  {
    name: "/configure server",
    description: {
      lt: "Configure the Travian gameworld for map lookups",
      en: "Configure the Travian gameworld for map lookups",
    },
    usage: "/configure server value:<server key>",
    example: "/configure server value:ts31.x3.europe",
    adminOnly: true,
  },
  {
    name: "/configure channel",
    description: {
      lt: "Configure defense or scout request channels",
      en: "Configure defense or scout request channels",
    },
    usage: "/configure channel type:<Defense|Scout> value:<channel>",
    example: "/configure channel type:Defense value:#defense-channel",
    adminOnly: true,
  },
  {
    name: "/configure scoutrole",
    description: {
      lt: "Set or clear the role to mention for scout requests",
      en: "Set or clear the role to mention for scout requests",
    },
    usage: "/configure scoutrole [role:<role>]",
    example: "/configure scoutrole role:@Scouts",
    adminOnly: true,
  },
];

export function buildDramaEmbed(lang: "lt" | "en"): EmbedBuilder {
  const isLt = lang === "lt";

  const embed = new EmbedBuilder()
    .setTitle("Drama Bot Commands")
    .setColor(Colors.Blue)
    .setDescription(
      isLt
        ? "Drama: Travian defense and scout coordination bot\n\n**All commands work with `/` or `!`** (e.g., `/def` = `!def`)"
        : "Drama: Travian defense and scout coordination bot\n\n**All commands work with `/` or `!`** (e.g., `/def` = `!def`)"
    );

  // Helper to format a command
  const formatCmd = (cmd: CommandDoc) => {
    const adminTag = cmd.adminOnly ? " *(Admin)*" : "";
    return `**${cmd.name}**${adminTag}\n${cmd.description[lang]}\n\`${cmd.example}\``;
  };

  // Group commands by category
  const defenseCommands = commandDocs.filter((c) =>
    ["/def", "/sent", "/stack", "/deletedef", "/updatedef", "/undo", "/stackinfo"].includes(c.name)
  );
  const scoutCommands = commandDocs.filter((c) => c.name === "/scout");
  const utilityCommands = commandDocs.filter((c) => c.name === "/lookup" || c.name === "/addstat");
  const playerCommands = commandDocs.filter((c) =>
    c.name.startsWith("/account") || c.name.startsWith("/sitter") || c.name === "/players"
  );
  const statsCommands = commandDocs.filter((c) => c.name.startsWith("/stats"));
  const configCommands = commandDocs.filter((c) => c.name.startsWith("/configure"));

  // Defense section
  embed.addFields({
    name: "Defense Commands",
    value: defenseCommands.map(formatCmd).join("\n\n"),
  });

  // Scout section
  embed.addFields({
    name: "Scout Commands",
    value: scoutCommands.map(formatCmd).join("\n\n"),
  });

  // Utility section
  embed.addFields({
    name: "Utility Commands",
    value: utilityCommands.map(formatCmd).join("\n\n"),
  });

  // Player/Account section
  embed.addFields({
    name: "Player Commands",
    value: playerCommands.map(formatCmd).join("\n\n"),
  });

  // Stats section
  embed.addFields({
    name: "Stats Commands",
    value: statsCommands.map(formatCmd).join("\n\n"),
  });

  // Configuration section
  embed.addFields({
    name: "Configuration Commands",
    value: configCommands.map(formatCmd).join("\n\n"),
  });

  return embed;
}

export const dramaCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("drama")
    .setDescription("Show bot commands and usage")
    .addStringOption((option) =>
      option
        .setName("lang")
        .setDescription("Language (default: English)")
        .setRequired(false)
        .addChoices(
          { name: "English (legacy)", value: "lt" },
          { name: "English", value: "en" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const langOption = interaction.options.getString("lang");
    const lang: "lt" | "en" = langOption === "lt" ? "lt" : "en";

    const embed = buildDramaEmbed(lang);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
