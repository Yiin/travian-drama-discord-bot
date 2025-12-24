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
      lt: "Sukurti arba atnaujinti gynybos prašymą",
      en: "Create or update a defense request",
    },
    usage: "/def coords:<koordinatės> troops:<skaičius> [message:<žinutė>]",
    example: "/def coords:123|456 troops:5000 message:Ateina hammeris",
  },
  {
    name: "/sent",
    description: {
      lt: "Pranešti apie išsiųstus karius į gynybos prašymą",
      en: "Report troops sent to a defense request",
    },
    usage: "/sent target:<ID arba koordinatės> troops:<skaičius> [user:<vartotojas>]",
    example: "/sent target:1 troops:2000",
  },
  {
    name: "/stack",
    description: {
      lt: "Tas pats kaip /sent - pranešti apie išsiųstus karius",
      en: "Same as /sent - report troops sent to a defense request",
    },
    usage: "/stack target:<ID arba koordinatės> troops:<skaičius> [user:<vartotojas>]",
    example: "/stack target:123|456 troops:1500",
  },
  {
    name: "/deletedef",
    description: {
      lt: "Ištrinti gynybos prašymą",
      en: "Delete a defense request",
    },
    usage: "/deletedef id:<numeris>",
    example: "/deletedef id:3",
  },
  {
    name: "/updatedef",
    description: {
      lt: "Atnaujinti gynybos prašymą",
      en: "Update a defense request",
    },
    usage: "/updatedef id:<numeris> [troops_sent:<skaičius>] [troops_needed:<skaičius>] [message:<žinutė>]",
    example: "/updatedef id:1 troops_sent:3000 troops_needed:6000",
  },
  {
    name: "/undo",
    description: {
      lt: "Atšaukti ankstesnį veiksmą",
      en: "Undo a previous action",
    },
    usage: "/undo id:<veiksmo ID>",
    example: "/undo id:5",
  },
  {
    name: "/stackinfo",
    description: {
      lt: "Iš naujo paskelbti gynybos užklausų sąrašą",
      en: "Re-post the defense request list",
    },
    usage: "/stackinfo",
    example: "/stackinfo",
  },

  // Scout commands
  {
    name: "/scout",
    description: {
      lt: "Išsiųsti žvalgybos prašymą",
      en: "Send a scouting request",
    },
    usage: "/scout coords:<koordinatės> message:<žinutė>",
    example: "/scout coords:-50|120 message:WWK ar fake?",
  },

  // Lookup command
  {
    name: "/lookup",
    description: {
      lt: "Ieškoti kaimo arba žaidėjo informacijos",
      en: "Look up village or player information",
    },
    usage: "/lookup query:<koordinatės arba vardas>",
    example: "/lookup query:PlayerName",
  },

  // Addstat command
  {
    name: "/addstat",
    description: {
      lt: "Pridėti karių siuntimą į statistiką (be gynybos prašymo)",
      en: "Add troops sent to stats (without defense request)",
    },
    usage: "/addstat coords:<koordinatės> troops:<skaičius>",
    example: "!addstat 123|456 5000",
  },

  // Account/Sitter commands
  {
    name: "/account set",
    description: {
      lt: "Priskirti save prie žaidimo paskyros",
      en: "Associate yourself with an in-game account",
    },
    usage: "/account set <vardas>",
    example: "!account set MyPlayerName",
  },
  {
    name: "/account del",
    description: {
      lt: "Pašalinti savo žaidimo paskyros priskyrimą",
      en: "Remove your in-game account association",
    },
    usage: "/account del",
    example: "!account del",
  },
  {
    name: "/sitter set",
    description: {
      lt: "Pažymėti save kaip siterį vienam ar keliems žaidėjams",
      en: "Mark yourself as a sitter for one or more players",
    },
    usage: "/sitter set <vardai, atskirti kableliais>",
    example: "!sitter set Player1, Player2",
  },
  {
    name: "/sitter del",
    description: {
      lt: "Pašalinti save kaip siterį vienam ar keliems žaidėjams",
      en: "Remove yourself as a sitter for one or more players",
    },
    usage: "/sitter del <vardai, atskirti kableliais>",
    example: "!sitter del Player1",
  },
  {
    name: "/players",
    description: {
      lt: "Rodyti visus žaidėjus su jų Discord vartotojais ir siteriais",
      en: "List all players with their Discord users and sitters",
    },
    usage: "/players",
    example: "!players",
  },

  // Stats commands
  {
    name: "/stats leaderboard",
    description: {
      lt: "Rodyti vartotojų reitingą pagal išsiųstus karius",
      en: "Show users ranked by total troops sent",
    },
    usage: "/stats leaderboard",
    example: "/stats leaderboard",
    adminOnly: true,
  },
  {
    name: "/stats user",
    description: {
      lt: "Rodyti konkretaus vartotojo statistiką",
      en: "Show stats for a specific user",
    },
    usage: "/stats user @vartotojas",
    example: "!stats user @Jonas",
    adminOnly: true,
  },
  {
    name: "/stats player",
    description: {
      lt: "Rodyti Travian žaidėjo kaimų statistiką",
      en: "Show stats for villages owned by a Travian player",
    },
    usage: "/stats player <vardas>",
    example: "!stats player PlayerName",
    adminOnly: true,
  },
  {
    name: "/stats village",
    description: {
      lt: "Rodyti konkretaus kaimo statistiką",
      en: "Show stats for a specific village",
    },
    usage: "/stats village <koordinatės>",
    example: "!stats village 123|456",
    adminOnly: true,
  },
  {
    name: "/stats stacks",
    description: {
      lt: "Rodyti kaimus pagal surinktą gynybą",
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
      lt: "Nustatyti Travian serverį žemėlapio paieškai",
      en: "Configure the Travian gameworld for map lookups",
    },
    usage: "/configure server value:<serverio raktas>",
    example: "/configure server value:ts31.x3.europe",
    adminOnly: true,
  },
  {
    name: "/configure channel",
    description: {
      lt: "Nustatyti gynybos arba žvalgybos kanalą",
      en: "Configure defense or scout request channels",
    },
    usage: "/configure channel type:<Defense|Scout> value:<kanalas>",
    example: "/configure channel type:Defense value:#gynybos-kanalas",
    adminOnly: true,
  },
  {
    name: "/configure scoutrole",
    description: {
      lt: "Nustatyti arba išvalyti rolę, kuri bus paminėta žvalgybos prašymuose",
      en: "Set or clear the role to mention for scout requests",
    },
    usage: "/configure scoutrole [role:<rolė>]",
    example: "/configure scoutrole role:@Žvalgai",
    adminOnly: true,
  },
];

export function buildDramaEmbed(lang: "lt" | "en"): EmbedBuilder {
  const isLt = lang === "lt";

  const embed = new EmbedBuilder()
    .setTitle(isLt ? "Drama Bot Komandos" : "Drama Bot Commands")
    .setColor(Colors.Blue)
    .setDescription(
      isLt
        ? "Drama: Travian gynybos ir žvalgybos koordinavimo botas\n\n**Visos komandos veikia su `/` arba `!`** (pvz., `/def` = `!def`)"
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
    name: isLt ? "Gynybos komandos" : "Defense Commands",
    value: defenseCommands.map(formatCmd).join("\n\n"),
  });

  // Scout section
  embed.addFields({
    name: isLt ? "Žvalgybos komandos" : "Scout Commands",
    value: scoutCommands.map(formatCmd).join("\n\n"),
  });

  // Utility section
  embed.addFields({
    name: isLt ? "Pagalbinės komandos" : "Utility Commands",
    value: utilityCommands.map(formatCmd).join("\n\n"),
  });

  // Player/Account section
  embed.addFields({
    name: isLt ? "Žaidėjų komandos" : "Player Commands",
    value: playerCommands.map(formatCmd).join("\n\n"),
  });

  // Stats section
  embed.addFields({
    name: isLt ? "Statistikos komandos" : "Stats Commands",
    value: statsCommands.map(formatCmd).join("\n\n"),
  });

  // Configuration section
  embed.addFields({
    name: isLt ? "Konfigūracijos komandos" : "Configuration Commands",
    value: configCommands.map(formatCmd).join("\n\n"),
  });

  // Footer with language hint
  if (isLt) {
    embed.setFooter({
      text: "For English version: /drama en"
    });
  }

  return embed;
}

export const dramaCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("drama")
    .setDescription("Show bot commands and usage")
    .addStringOption((option) =>
      option
        .setName("lang")
        .setDescription("Language (default: Lithuanian)")
        .setRequired(false)
        .addChoices(
          { name: "Lietuvių", value: "lt" },
          { name: "English", value: "en" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const langOption = interaction.options.getString("lang");
    const lang: "lt" | "en" = langOption === "en" ? "en" : "lt";

    const embed = buildDramaEmbed(lang);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
