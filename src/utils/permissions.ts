import {
  GuildMember,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

export const ADMIN_ONLY_MESSAGE = "Tik administratoriai gali naudoti šią komandą.";

/**
 * Check if a member has admin permissions (Administrator or ManageChannels).
 */
export function isAdmin(member: GuildMember | null | undefined): boolean {
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels)
  );
}

type RepliableInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;

/**
 * Check if user has admin permissions. If not, replies with error message.
 * Returns true if user is admin, false if not (and reply was sent).
 */
export async function requireAdmin(interaction: RepliableInteraction): Promise<boolean> {
  if (isAdmin(interaction.member as GuildMember)) {
    return true;
  }

  await interaction.reply({
    content: ADMIN_ONLY_MESSAGE,
    ephemeral: true,
  });
  return false;
}
