import { CommandContext } from "./types";
import { linkActionToMessage } from "../action-history";
/**
 * Parse comma-separated names into an array
 */
export function parseNames(input: string): string[] {
  return input
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * Normalize a server key by removing protocol, domain suffix, and trailing slashes
 */
export function normalizeServerKey(input: string): string {
  let key = input.trim().toLowerCase();

  // Remove protocol if present
  key = key.replace(/^https?:\/\//, "");

  // Remove .travian.com suffix if present
  key = key.replace(/\.travian\.com\/?$/, "");

  // Remove trailing slash
  key = key.replace(/\/+$/, "");

  return key;
}

/**
 * Validate a server key format
 * Should be like: ts31.x3.europe or ts5.x1.international
 */
export function isValidServerKey(key: string): boolean {
  return /^[a-z0-9]+(\.[a-z0-9]+)+$/.test(key);
}

/**
 * Text-command failure: ❌ reaction plus a short reply that removes itself after 30 seconds.
 */
export async function replyError(ctx: CommandContext, text: string): Promise<void> {
  try {
    await ctx.message.react("❌");
  } catch {
    // missing reaction permission; the reply still goes out
  }
  const reply = await ctx.message.reply(text);
  setTimeout(() => {
    reply.delete().catch(() => undefined);
  }, ERROR_REPLY_TTL_MS);
}

const ERROR_REPLY_TTL_MS = 30_000;

/** Success reaction; a missing Add Reactions permission must not abort the command. */
export async function reactOk(ctx: CommandContext): Promise<void> {
  try {
    await ctx.message.react("✅");
  } catch {
    // ignore: the action already happened
  }
}

/** Remove the bot's own ✅/❌ reactions before an edited message is re-run. */
export async function clearOwnReactions(message: { reactions: { cache: Map<string, any> }; client: { user: { id: string } | null } }): Promise<void> {
  const botId = message.client.user?.id;
  if (!botId) return;
  for (const emoji of ["✅", "❌"]) {
    const reaction = message.reactions.cache.get(emoji);
    if (!reaction) continue;
    try {
      await reaction.users.remove(botId);
    } catch {
      // ignore
    }
  }
}

/**
 * Link an action to the message that produced it, so editing the message can undo it first.
 */
export function rememberAction(ctx: CommandContext, actionId: number): void {
  if (!actionId) return;
  linkActionToMessage(ctx.guildId, ctx.message.id, ctx.message.content, actionId);
}
