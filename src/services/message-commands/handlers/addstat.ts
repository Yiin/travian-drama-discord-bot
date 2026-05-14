import { CommandContext } from "../types";
import { parseCoords } from "../../../utils/parse-coords";
import { recordContribution } from "../../stats";

export async function handleAddstatCommand(
  ctx: CommandContext,
  coordsInput: string,
  troops: number,
  forUserId?: string
): Promise<void> {
  const coords = parseCoords(coordsInput);
  if (!coords) {
    await ctx.message.reply("Invalid coordinates. Use `123|456` or `-45|89`.");
    return;
  }

  if (troops === 0) {
    await ctx.message.reply("Troop count cannot be 0.");
    return;
  }

  // Record the contribution for the specified user or the message author
  const targetUserId = forUserId || ctx.message.author.id;
  recordContribution(ctx.guildId, targetUserId, coords.x, coords.y, troops);

  await ctx.message.react("✅");
  const userMention = forUserId ? ` (<@${forUserId}>)` : "";
  const action = troops > 0 ? "Added" : "Subtracted";
  await ctx.message.reply(`${action}: **${Math.abs(troops).toLocaleString()}** troops ${troops > 0 ? "to" : "from"} (${coords.x}|${coords.y}) stats${userMention}.`);
}
