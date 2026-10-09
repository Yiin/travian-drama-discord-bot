import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { Command } from "../types";
import { getGuildConfig, Permission } from "../config/guild-config";
import { buildActionContext } from "../actions/context";
import { executePermissionChangeAction } from "../actions/permissions.action";
import { buildPermissionSummary } from "../actions/permissions";
import { guildCommand, requireGuild } from "./shared";

const PERMISSION_CHOICES: { name: string; value: Permission }[] = [
  { name: "request: create stack, defense, push and scout requests", value: "request" },
  { name: "manage: change, close or delete any request, undo anyone", value: "manage" },
];

/**
 * No default member permission on purpose: Discord would hide the command from
 * a bot owner without Administrator, and `show` is useful to everyone. The
 * change itself is gated in `executePermissionChangeAction`.
 */
export const permissionsCommand: Command = {
  topic: "admin",
  summary: "Pick which roles can create requests and manage any request",
  data: guildCommand("permissions", "Which roles can create and manage requests")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Give a role a permission (Administrator only)")
        .addStringOption((opt) =>
          opt.setName("permission").setDescription("Which permission").setRequired(true).addChoices(...PERMISSION_CHOICES)
        )
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to add").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Take a permission from a role (Administrator only)")
        .addStringOption((opt) =>
          opt.setName("permission").setDescription("Which permission").setRequired(true).addChoices(...PERMISSION_CHOICES)
        )
        .addRoleOption((opt) => opt.setName("role").setDescription("Role to remove").setRequired(true))
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Show which roles have each permission")),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;
    const config = getGuildConfig(guildId);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "show") {
      await interaction.reply({
        content: buildPermissionSummary(config),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const permission = interaction.options.getString("permission", true) as Permission;
    const roleId = interaction.options.getRole("role", true).id;
    const result = executePermissionChangeAction(
      buildActionContext(interaction, guildId, config),
      subcommand === "add" ? { permission, add: roleId } : { permission, remove: roleId }
    );
    await interaction.reply({
      content: result.success ? result.confirmText : result.error,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
