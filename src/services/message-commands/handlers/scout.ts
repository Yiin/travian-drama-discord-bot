import { CommandContext } from "../types";
import { executeScoutAction, sendScoutMessage } from "../../../actions";
import { replyError, rememberAction } from "../utils";
import { errors } from "../../../actions/messages";

export async function handleScoutCommand(
  ctx: CommandContext,
  coordsInput: string,
  scoutMessage: string
): Promise<void> {
  if (!ctx.config.serverKey) {
    await replyError(ctx, errors.notSetUp());
    return;
  }
  if (!ctx.config.scoutChannelId) {
    await replyError(ctx, errors.channelMissing("scout"));
    return;
  }

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
    await replyError(ctx, result.error);
    return;
  }

  // Send the scout message to the channel
  const sent = await sendScoutMessage(ctx.client, ctx.guildId, ctx.config.scoutChannelId, {
    ...result,
    message: scoutMessage,
    requesterId: ctx.message.author.id,
    scoutRoleId: ctx.config.scoutRoleId,
  });

  if (!sent) {
    await replyError(ctx, errors.channelGone("scout"));
    return;
  }

  // React to confirm
  await ctx.message.react("✅");
}
