import { BaseInteraction, GuildMember } from "discord.js";
import { GuildConfig } from "../config/guild-config";
import { isAdministratorOrOwner } from "../utils/permissions";
import { ActionContext } from "./types";

/** The one way every surface builds an `ActionContext` from an interaction. */
export function buildActionContext(interaction: BaseInteraction, guildId: string, config: GuildConfig): ActionContext {
  return {
    guildId,
    config,
    client: interaction.client,
    userId: interaction.user.id,
    roleIds: memberRoleIds(interaction.member, guildId),
    isAdministrator: isAdministratorOrOwner(interaction),
  };
}

/**
 * Role IDs of an interaction member. A cached member has a role manager, an
 * uncached one a plain ID list. Every member has the @everyone role, whose ID is
 * the guild ID, so a permission list can name @everyone too.
 */
function memberRoleIds(member: BaseInteraction["member"], guildId: string): string[] {
  const roles = member instanceof GuildMember ? [...member.roles.cache.keys()] : member?.roles ?? [];
  return roles.includes(guildId) ? roles : [...roles, guildId];
}
