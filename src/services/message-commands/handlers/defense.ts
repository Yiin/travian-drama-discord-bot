import { CommandContext } from "../types";
import {
  validateDefenseConfig,
  executeSentAction,
  executeStackAction,
  executeDeleteDefAction,
  executeMoveAction,
  executeUndoAction,
} from "../../../actions";
import { updateGlobalMessage } from "../../defense-message";
import { errors } from "../../../actions/messages";
import { replyError, rememberAction, reactOk } from "../utils";
import { getLatestUndoableActionId, markMessageNoEdit } from "../../action-history";

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
  await reactOk(ctx);
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
  await reactOk(ctx);
}

export async function handleRemoveCommand(
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
  await reactOk(ctx);
}

export async function handleMoveCommand(
  ctx: CommandContext,
  requestId: number,
  toPosition: number
): Promise<void> {
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    await replyError(ctx, validation.error);
    return;
  }

  const result = await executeMoveAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: ctx.client,
      userId: ctx.message.author.id,
    },
    { requestId, toPosition }
  );

  if (!result.success) {
    await replyError(ctx, result.error);
    return;
  }

  rememberAction(ctx, result.actionId);
  await reactOk(ctx);
}

export async function handleUndoCommand(
  ctx: CommandContext,
  actionId: number | undefined
): Promise<void> {
  if (!ctx.config.serverKey) {
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

  // Success: react and reply with what was undone. Edits of this message are ignored.
  markMessageNoEdit(ctx.guildId, ctx.message.id, ctx.message.content);
  await reactOk(ctx);
  await ctx.message.reply(result.confirmText ?? result.actionText);
}

export async function handleStackListCommand(ctx: CommandContext): Promise<void> {
  if (!ctx.config.serverKey || !ctx.config.defenseChannelId) {
    await replyError(ctx, errors.notSetUp());
    return;
  }

  await updateGlobalMessage(ctx.client, ctx.guildId);

  // React to confirm
  await reactOk(ctx);
}
