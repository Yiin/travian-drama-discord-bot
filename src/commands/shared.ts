import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { errors } from "../actions/messages";

/** Every command runs inside a server, installed on the server. */
export function guildCommand(name: string, description: string): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
}

/** Guild id of the interaction, or an ephemeral error and `null`. */
export async function requireGuild(interaction: ChatInputCommandInteraction): Promise<string | null> {
  if (interaction.guildId) return interaction.guildId;
  await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
  return null;
}
