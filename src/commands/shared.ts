import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { errors } from "../actions/messages";
import { resolveScope, Scope } from "../config/scope";

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

/** Confed of the channel the command ran in, or an ephemeral error and `null`. */
export async function requireScope(interaction: ChatInputCommandInteraction): Promise<Scope | null> {
  const scope = await resolveScope(interaction);
  if (scope) return scope;
  await interaction.reply({ content: errors.guildOnly(), flags: MessageFlags.Ephemeral });
  return null;
}
