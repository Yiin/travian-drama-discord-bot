import { GuildMember } from "discord.js";
import { CommandContext } from "../types";
import {
  executeDefCallRequestAction,
  executeDefCallSentAction,
  executeDefCallCloseAction,
} from "../../../actions";
import { getRequestByChannelId } from "../../def-calls";
import { isAdmin } from "../../../utils/permissions";

export async function handleDefCommand(
  ctx: CommandContext,
  coords: string,
  landing: string,
  comment: string | undefined
): Promise<void> {
  const result = await executeDefCallRequestAction(
    {
      guildId: ctx.guildId,
      config: ctx.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    { coords, landing, comment }
  );

  if (!result.success) {
    await ctx.message.reply(result.error);
    return;
  }

  await ctx.message.react("✅");
  await ctx.message.reply(result.actionText);
}

export async function handleDefCallSentCommand(
  ctx: CommandContext,
  requestId: number,
  troops: number,
  forUserId: string | undefined
): Promise<void> {
  if (troops < 1) {
    await ctx.message.reply("Troop count must be at least 1.");
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
    await ctx.message.reply(result.error);
    return;
  }

  await ctx.message.react("✅");
}

export async function handleCloseCommand(ctx: CommandContext): Promise<void> {
  const requestData = getRequestByChannelId(ctx.guildId, ctx.channelId);
  if (!requestData) {
    await ctx.message.reply("This channel is not a defense request channel.");
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
    await ctx.message.reply(result.error);
    return;
  }
  // channel is being deleted; nothing else
}
