import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { Command } from "../types";

interface CommandDoc {
  name: string;
  description: { lt: string; en: string };
  usage: string;
  example: string;
  adminOnly?: boolean;
}

const commandDocs: CommandDoc[] = [
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
      lt: "Ieškoti kaimo informacijos pagal koordinates",
      en: "Look up village information by coordinates",
    },
    usage: "/lookup coords:<koordinatės>",
    example: "/lookup coords:0|0",
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

function buildEmbed(lang: "lt" | "en"): EmbedBuilder {
  const isLt = lang === "lt";

  const embed = new EmbedBuilder()
    .setTitle(isLt ? "Drama Bot Komandos" : "Drama Bot Commands")
    .setColor(Colors.Blue)
    .setDescription(
      isLt
        ? "Drama: Travian gynybos ir žvalgybos koordinavimo botas\n\n**Visos komandos veikia su `/` arba `!`** (pvz., `/def` = `!def`)"
        : "Drama: Travian defense and scout coordination bot\n\n**All commands work with `/` or `!`** (e.g., `/def` = `!def`)"
    );

  // Group commands by category
  const defenseCommands = commandDocs.filter((c) =>
    ["/def", "/sent", "/stack", "/deletedef", "/updatedef", "/undo", "/stackinfo"].includes(c.name)
  );
  const scoutCommands = commandDocs.filter((c) => c.name === "/scout");
  const utilityCommands = commandDocs.filter((c) => c.name === "/lookup");
  const configCommands = commandDocs.filter((c) =>
    c.name.startsWith("/configure")
  );

  // Defense section
  const defenseSection = defenseCommands
    .map((cmd) => {
      const adminTag = cmd.adminOnly ? (isLt ? " *(Admin)*" : " *(Admin)*") : "";
      return `**${cmd.name}**${adminTag}\n${cmd.description[lang]}\n\`${cmd.example}\``;
    })
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Gynybos komandos" : "Defense Commands",
    value: defenseSection,
  });

  // Scout section
  const scoutSection = scoutCommands
    .map((cmd) => `**${cmd.name}**\n${cmd.description[lang]}\n\`${cmd.example}\``)
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Žvalgybos komandos" : "Scout Commands",
    value: scoutSection,
  });

  // Utility section
  const utilitySection = utilityCommands
    .map((cmd) => `**${cmd.name}**\n${cmd.description[lang]}\n\`${cmd.example}\``)
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Pagalbinės komandos" : "Utility Commands",
    value: utilitySection,
  });

  // Configuration section
  const configSection = configCommands
    .map((cmd) => {
      const adminTag = cmd.adminOnly ? (isLt ? " *(Admin)*" : " *(Admin)*") : "";
      return `**${cmd.name}**${adminTag}\n${cmd.description[lang]}\n\`${cmd.example}\``;
    })
    .join("\n\n");

  embed.addFields({
    name: isLt ? "Konfigūracijos komandos" : "Configuration Commands",
    value: configSection,
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

    const embed = buildEmbed(lang);

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  },
};
