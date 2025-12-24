import { CommandContext } from "../types";
import { buildDramaEmbed } from "../../../commands/drama";

export async function handleDramaCommand(
  ctx: CommandContext,
  lang?: string
): Promise<void> {
  const embed = buildDramaEmbed((lang as "lt" | "en") || "lt");
  await ctx.message.reply({ embeds: [embed] });
}
