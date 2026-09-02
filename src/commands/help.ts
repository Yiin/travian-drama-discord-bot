import { ButtonInteraction, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { Command, HelpTopic } from "../types";
import { commands } from "./index";
import { buildHelpButtons, buildHelpEmbed, HELP_BUTTON_PREFIX, HELP_TOPICS, isHelpTopic } from "../services/help";
import { guildCommand } from "./shared";

export const helpCommand: Command = {
  topic: "info",
  summary: "This list",
  data: guildCommand("help", "How to use the bot")
    .addStringOption((opt) =>
      opt
        .setName("topic")
        .setDescription("Show one topic in full")
        .addChoices(...HELP_TOPICS.map((t) => ({ name: t.label, value: t.id })))
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const topic = (interaction.options.getString("topic") ?? undefined) as HelpTopic | undefined;
    await interaction.reply({
      embeds: [buildHelpEmbed(commands, topic)],
      components: buildHelpButtons(commands, topic),
      flags: MessageFlags.Ephemeral,
    });
  },
};

/** Topic buttons swap the help message in place. */
export async function handleHelpButton(interaction: ButtonInteraction): Promise<void> {
  const value = interaction.customId.slice(HELP_BUTTON_PREFIX.length);
  const topic = isHelpTopic(value) ? value : undefined;
  await interaction.update({
    embeds: [buildHelpEmbed(commands, topic)],
    components: buildHelpButtons(commands, topic),
  });
}
