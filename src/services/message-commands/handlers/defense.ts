import { CommandContext } from "../types";
import { requireAdmin } from "../middleware";
import {
  validateDefenseConfig,
  executeSentAction,
  executeDefAction,
  executeDeleteDefAction,
  executeUpdateDefAction,
  executeUndoAction,
} from "../../../actions";
import { updateGlobalMessage } from "../../defense-message";

export async function handleSentCommand(
  ctx: CommandContext,
  targetInput: string,
  troops: number,
  forUserId?: string
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
    return;
  }

  // 2. Validate troops
  if (troops < 1) {
    await ctx.message.reply("Karių skaičius turi būti bent 1.");
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
    await ctx.message.reply(result.error);
    return;
  }

  // Success: react with checkmark
  await ctx.message.react("✅");
}

export async function handleDefCommand(
  ctx: CommandContext,
  coordsInput: string,
  troops: number,
  defMessage: string
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
    return;
  }

  // 2. Validate troops
  if (troops < 1) {
    await ctx.message.reply("Karių skaičius turi būti bent 1.");
    return;
  }

  // 3. Execute action
  const result = await executeDefAction(
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
    await ctx.message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await ctx.message.react("✅");
  await ctx.message.reply(result.actionText);
}

export async function handleDeleteDefCommand(
  ctx: CommandContext,
  requestId: number
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
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
    await ctx.message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await ctx.message.react("✅");
  await ctx.message.reply(result.actionText);
}

async function handleUpdateDefCommandInner(
  ctx: CommandContext,
  requestId: number,
  paramsStr: string
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(ctx.guildId);
  if (!validation.valid) {
    // For text commands, silently ignore if config is missing
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
    await ctx.message.reply("Nurodyk bent vieną lauką atnaujinti (troops_sent: X, troops_needed: X arba message: tekstas).");
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
    await ctx.message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await ctx.message.react("✅");
  await ctx.message.reply(result.actionText);
}

// Wrap with admin check
export const handleUpdateDefCommand = requireAdmin(handleUpdateDefCommandInner);

export async function handleUndoCommand(
  ctx: CommandContext,
  actionId: number
): Promise<void> {
  // Undo only needs defenseChannelId
  if (!ctx.config.defenseChannelId) return;

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
    await ctx.message.reply(result.error);
    return;
  }

  // Success: react and reply with confirmation
  await ctx.message.react("✅");
  await ctx.message.reply(result.actionText);
}

export async function handleStackinfoCommand(ctx: CommandContext): Promise<void> {
  if (!ctx.config.serverKey || !ctx.config.defenseChannelId) return;

  await updateGlobalMessage(ctx.client, ctx.guildId);

  // React to confirm
  await ctx.message.react("✅");
}
