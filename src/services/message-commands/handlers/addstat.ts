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
    await ctx.message.reply("Neteisingos koordinatės. Naudok formatą `123|456` arba `-45|89`.");
    return;
  }

  if (troops === 0) {
    await ctx.message.reply("Karių skaičius negali būti 0.");
    return;
  }

  // Record the contribution for the specified user or the message author
  const targetUserId = forUserId || ctx.message.author.id;
  recordContribution(ctx.guildId, targetUserId, coords.x, coords.y, troops);

  await ctx.message.react("✅");
  const userMention = forUserId ? ` (<@${forUserId}>)` : "";
  const action = troops > 0 ? "Pridėta" : "Atimta";
  await ctx.message.reply(`${action}: **${Math.abs(troops).toLocaleString()}** karių ${troops > 0 ? "į" : "iš"} (${coords.x}|${coords.y}) statistikos${userMention}.`);
}
