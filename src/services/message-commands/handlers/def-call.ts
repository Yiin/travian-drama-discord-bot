import { GuildMember } from "discord.js";
import { CommandContext } from "../types";
import {
  executeDefCallRequestAction,
  executeDefCallSentAction,
  executeDefCallCloseAction,
} from "../../../actions";
import { getRequestByChannelId } from "../../def-calls";
import { isAdmin } from "../../../utils/permissions";
import { errors } from "../../../actions/messages";
import { replyError, rememberAction } from "../utils";

export async function handleDefCommand(
  ctx: CommandContext,
  coords: string,
  landing: string,
  comment: string | undefined,
  troopsNeeded?: number
): Promise<void> {
  const result = await executeDefCallRequestAction(
    {
      guildId: ctx.guildId,
      config: ctx.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    { coords, landing, comment, troopsNeeded }
  );

  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  rememberAction(ctx, result.actionId);
  await ctx.message.react("✅");
  await ctx.message.reply(result.confirmText ?? result.actionText);
}

export async function handleDefCallSentCommand(
  ctx: CommandContext,
  requestId: number,
  troops: number,
  forUserId: string | undefined
): Promise<void> {
  if (troops < 1) {
    await replyError(ctx, errors.invalidCount("troops"));
    return;
  }

  const result = await executeDefCallSentAction(
    {
      guildId: ctx.guildId,
      config: ctx.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    { requestId, troops, creditUserId: forUserId }
  );

  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  rememberAction(ctx, result.actionId);
  await ctx.message.react("✅");
}

export async function handleCloseCommand(ctx: CommandContext): Promise<void> {
  const requestData = getRequestByChannelId(ctx.guildId, ctx.channelId);
  if (!requestData) {
    await replyError(ctx, errors.notInThread("defense request"));
    return;
  }

  const userIsAdmin = isAdmin(ctx.message.member as GuildMember | null);

  const result = await executeDefCallCloseAction(
    {
      guildId: ctx.guildId,
      config: ctx.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    { requestId: requestData.requestId },
    { isAdmin: userIsAdmin }
  );

  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }
  // channel is being deleted; nothing else
}
