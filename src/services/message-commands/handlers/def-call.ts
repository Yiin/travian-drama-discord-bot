import { GuildMember } from "discord.js";
import { CommandContext } from "../types";
import {
  executeDefCallRequestAction,
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

export async function handleCloseCommand(ctx: CommandContext): Promise<void> {
  const requestData = getRequestByChannelId(ctx.guildId, ctx.channelId);
  if (!requestData) {
    await ctx.message.reply("Šis kanalas nėra gynybos prašymo kanalas.");
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
