import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const HISTORY_FILE = path.join(DATA_DIR, "action-history.json");

/**
 * Mark every not-yet-undone action of a guild as undone with a reason.
 * Used when request IDs change meaning (position → stable id), because the
 * stored `requestId` of older actions can no longer be trusted.
 *
 * Works on the JSON file directly so request services can call it without
 * importing action-history (which imports them).
 */
export function expireActionHistory(guildId: string, reason: string): number {
  if (!fs.existsSync(HISTORY_FILE)) return 0;
  const all = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  const history = all[guildId];
  if (!history || !Array.isArray(history.actions)) return 0;

  let expired = 0;
  for (const action of history.actions) {
    if (action.undone) continue;
    action.undone = true;
    action.expiredReason = reason;
    expired++;
  }
  if (expired > 0) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(all, null, 2));
  }
  return expired;
}
