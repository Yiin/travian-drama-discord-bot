import { CommandContext } from "../types";
import {
  validateDefenseConfig,
  executeSentAction,
  executeStackAction,
  executeDeleteDefAction,
  executeUpdateDefAction,
  executeUndoAction,
} from "../../../actions";
import { updateGlobalMessage } from "../../defense-message";
import { errors } from "../../../actions/messages";
import { replyError, rememberAction } from "../utils";
import { getLatestUndoableActionId } from "../../action-history";

export async function handleSentCommand(
  ctx: CommandContext,
  targetInput: string,
  troops: number,
  forUserId?: string
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    await replyError(ctx, validation.error);
    return;
  }

  // 2. Validate troops
  if (troops < 1) {
    await replyError(ctx, errors.invalidCount("troops"));
    return;
  }

  // 3. Execute action
  const creditUserId = forUserId || ctx.message.author.id;
  const result = await executeSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    {
      target: targetInput,
      troops,
      creditUserId,
    }
  );

  // 4. Handle response
  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  // Success: react with checkmark (the panel posts the audit line)
  rememberAction(ctx, result.actionId);
  await ctx.message.react("✅");
}

export async function handleStackCommand(
  ctx: CommandContext,
  coordsInput: string,
  troops: number,
  defMessage: string
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    await replyError(ctx, validation.error);
    return;
  }

  // 2. Validate troops
  if (troops < 1) {
    await replyError(ctx, errors.invalidCount("troops"));
    return;
  }

  // 3. Execute action
  const result = await executeStackAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    {
      coords: coordsInput,
      troopsNeeded: troops,
      message: defMessage,
    }
  );

  // 4. Handle response
  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  // Success: react (the panel posts the audit line)
  rememberAction(ctx, result.actionId);
  await ctx.message.react("✅");
}

export async function handleDeleteDefCommand(
  ctx: CommandContext,
  requestId: number
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    await replyError(ctx, validation.error);
    return;
  }

  // 2. Execute action
  const result = await executeDeleteDefAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    { requestId }
  );

  // 3. Handle response
  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  // Success: react (the panel posts the audit line)
  rememberAction(ctx, result.actionId);
  await ctx.message.react("✅");
}

export async function handleUpdateDefCommand(
  ctx: CommandContext,
  requestId: number,
  paramsStr: string
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    await replyError(ctx, validation.error);
    return;
  }

  // 2. Parse parameters: troops_sent: 500 troops_needed: 2000 message: some text
  let troopsSent: number | undefined;
  let troopsNeeded: number | undefined;
  let updateMessage: string | undefined;

  const troopsSentMatch = paramsStr.match(/troops_sent:\s*(\d+)/i);
  if (troopsSentMatch) {
    troopsSent = parseInt(troopsSentMatch[1], 10);
  }

  const troopsNeededMatch = paramsStr.match(/troops_needed:\s*(\d+)/i);
  if (troopsNeededMatch) {
    troopsNeeded = parseInt(troopsNeededMatch[1], 10);
  }

  const messageMatch = paramsStr.match(/message:\s*(.+?)(?:\s+(?:troops_sent|troops_needed):|$)/i);
  if (messageMatch) {
    updateMessage = messageMatch[1].trim();
  }

  if (troopsSent === undefined && troopsNeeded === undefined && updateMessage === undefined) {
    await replyError(ctx, "⚠️ **Nothing to update.** Give at least one of `troops_sent: X`, `troops_needed: X`, or `message: text`.");
    return;
  }

  // 3. Execute action
  const result = await executeUpdateDefAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    {
      requestId,
      troopsSent,
      troopsNeeded,
      message: updateMessage,
    }
  );

  // 4. Handle response
  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  // Success: react (the panel posts the audit line)
  rememberAction(ctx, result.actionId);
  await ctx.message.react("✅");
}

export async function handleUndoCommand(
  ctx: CommandContext,
  actionId: number | undefined
): Promise<void> {
  if (!ctx.config.defenseChannelId) {
    await replyError(ctx, errors.notSetUp());
    return;
  }
  actionId ??= getLatestUndoableActionId(ctx.guildId);
  if (!actionId) {
    await replyError(ctx, errors.notFound("undoable action"));
    return;
  }

  // Execute action
  const result = await executeUndoAction(
    {
      guildId: ctx.guildId,
      config: ctx.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    { actionId }
  );

  // Handle response
  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  // Success: react and reply with what was undone (this reply is not itself undoable)
  await ctx.message.react("✅");
  await ctx.message.reply(result.confirmText ?? result.actionText);
}

export async function handleStackinfoCommand(ctx: CommandContext): Promise<void> {
  if (!ctx.config.serverKey || !ctx.config.defenseChannelId) {
    await replyError(ctx, errors.notSetUp());
    return;
  }

  await updateGlobalMessage(ctx.client, ctx.guildId);

  // React to confirm
  await ctx.message.react("✅");
}
