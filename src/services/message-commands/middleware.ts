import { GuildMember } from "discord.js";
import { CommandContext } from "./types";
import { isAdmin, ADMIN_ONLY_MESSAGE } from "../../utils/permissions";

/**
 * Wraps a command handler with an admin permission check.
 * Returns early with an error message if the user is not an administrator.
 */
export function requireAdminMiddleware<T extends unknown[]>(
  handler: (ctx: CommandContext, ...args: T) => Promise<void>
): (ctx: CommandContext, ...args: T) => Promise<void> {
  return async (ctx: CommandContext, ...args: T) => {
    if (!isAdmin(ctx.message.member as GuildMember)) {
      await ctx.message.reply(ADMIN_ONLY_MESSAGE);
      return;
    }
    return handler(ctx, ...args);
  };
}
