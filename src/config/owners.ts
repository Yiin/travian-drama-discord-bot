/**
 * Discord user IDs that always pass admin checks, in every guild.
 * Use this for the bot maintainer, who may not hold Administrator everywhere.
 */
export const BOT_OWNER_IDS = ["147144508994224128"];

export function isBotOwner(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return BOT_OWNER_IDS.includes(userId);
}
