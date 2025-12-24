import { CommandContext } from "../types";
import { executeScoutAction, sendScoutMessage } from "../../../actions";

export async function handleScoutCommand(
  ctx: CommandContext,
  coordsInput: string,
  scoutMessage: string
): Promise<void> {
  if (!ctx.config.serverKey || !ctx.config.scoutChannelId) return;

  // Execute the scout action
  const result = await executeScoutAction(
    {
      guildId: ctx.guildId,
      config: ctx.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    {
      coords: coordsInput,
      message: scoutMessage,
      requesterId: ctx.message.author.id,
      scoutRoleId: ctx.config.scoutRoleId,
    }
  );

  if (!result.success) {
    await ctx.message.reply(result.error);
    return;
  }

  // Send the scout message to the channel
  const sent = await sendScoutMessage(ctx.client, ctx.config.scoutChannelId, {
    ...result,
    message: scoutMessage,
    requesterName: ctx.message.author.displayName,
    scoutRoleId: ctx.config.scoutRoleId,
  });

  if (!sent) {
    await ctx.message.reply("Sukonfigūruotas žvalgybos kanalas nerastas.");
    return;
  }

  // React to confirm
  await ctx.message.react("✅");
}
