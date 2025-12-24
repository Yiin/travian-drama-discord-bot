import { PermissionFlagsBits } from "discord.js";
import { CommandContext } from "./types";

/**
 * Wraps a command handler with an admin permission check.
 * Returns early with an error message if the user is not an administrator.
 */
export function requireAdmin<T extends unknown[]>(
  handler: (ctx: CommandContext, ...args: T) => Promise<void>
): (ctx: CommandContext, ...args: T) => Promise<void> {
  return async (ctx: CommandContext, ...args: T) => {
    const member = ctx.message.member;
    if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
      await ctx.message.reply("Tik administratoriai gali naudoti šią komandą.");
      return;
    }
    return handler(ctx, ...args);
  };
}
