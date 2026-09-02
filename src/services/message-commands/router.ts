import { CommandContext } from "./types";
import * as patterns from "./patterns";
import * as handlers from "./handlers";
import { getRequestByChannelId } from "../def-calls";
import { parseTroopCount } from "../../utils/parse-number";
import { errors } from "../../actions/messages";
import { replyError } from "./utils";

/** Slash command to suggest when a stack-queue text command is typed outside the defense channel. */
function stackCommandTypedElsewhere(content: string): string | undefined {
  if (patterns.SENT_PATTERN.test(content) || patterns.SENT_VERBOSE_PATTERN.test(content)) return "sent";
  if (patterns.STACK_PATTERN.test(content)) return "stack";
  if (patterns.DELETEDEF_PATTERN.test(content)) return "deletedef";
  if (patterns.STACKINFO_PATTERN.test(content)) return "stackinfo";
  if (patterns.UPDATEDEF_PATTERN.test(content)) return "updatedef";
  if (patterns.UNDO_PATTERN.test(content)) return "undo";
  return undefined;
}

/**
 * Process a single command line
 */
export async function processSingleCommand(
  ctx: CommandContext,
  content: string
): Promise<void> {
  // ============================================
  // Global commands (work in any channel)
  // ============================================

  // Lookup command
  let match = content.match(patterns.LOOKUP_PATTERN);
  if (match) {
    await handlers.handleLookupCommand(ctx, match[1]);
    return;
  }

  // Drama command
  match = content.match(patterns.DRAMA_PATTERN);
  if (match) {
    await handlers.handleDramaCommand(ctx, match[1]);
    return;
  }

  // Configure commands
  match = content.match(patterns.CONFIGURE_SERVER_PATTERN);
  if (match) {
    await handlers.handleConfigureServerCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.CONFIGURE_CHANNEL_PATTERN);
  if (match) {
    await handlers.handleConfigureChannelCommand(ctx, match[1] as "defense" | "scout" | "defcalls" | "push", match[2]);
    return;
  }

  match = content.match(patterns.CONFIGURE_SCOUTROLE_PATTERN);
  if (match) {
    await handlers.handleConfigureScoutRoleCommand(ctx, match[1], match[2]);
    return;
  }

  match = content.match(patterns.CONFIGURE_TIMEZONE_PATTERN);
  if (match) {
    await handlers.handleConfigureTimezoneCommand(ctx, match[1]);
    return;
  }

  // Def commands - work in any channel
  match = content.match(patterns.DEF_PATTERN);
  if (match) {
    const troopsNeeded = parseTroopCount(match[4]) ?? undefined;
    await handlers.handleDefCommand(
      ctx,
      match[1],
      match[2],
      match[3] || undefined,
      troopsNeeded
    );
    return;
  }

  match = content.match(patterns.CLOSE_PATTERN);
  if (match) {
    await handlers.handleCloseCommand(ctx);
    return;
  }

  // Def-call thread /sent — only inside a def-call request channel
  match = content.match(patterns.DEFCALL_SENT_PATTERN);
  if (match) {
    const defCallRequestData = getRequestByChannelId(
      ctx.guildId,
      ctx.channelId
    );
    if (defCallRequestData) {
      const troops = parseInt(match[1], 10);
      const forUserId = match[2];
      await handlers.handleDefCallSentCommand(
        ctx,
        defCallRequestData.requestId,
        troops,
        forUserId
      );
      return;
    }
  }

  // Stats commands
  match = content.match(patterns.STATS_LEADERBOARD_PATTERN);
  if (match) {
    await handlers.handleStatsLeaderboardCommand(ctx);
    return;
  }

  match = content.match(patterns.STATS_USER_PATTERN);
  if (match) {
    await handlers.handleStatsUserCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.STATS_PLAYER_PATTERN);
  if (match) {
    await handlers.handleStatsPlayerCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.STATS_VILLAGE_PATTERN);
  if (match) {
    await handlers.handleStatsVillageCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.STATS_STACKS_PATTERN);
  if (match) {
    await handlers.handleStatsStacksCommand(ctx);
    return;
  }

  match = content.match(patterns.STATS_RESET_PATTERN);
  if (match) {
    await handlers.handleStatsResetCommand(ctx);
    return;
  }

  // Addstat command
  match = content.match(patterns.ADDSTAT_PATTERN);
  if (match) {
    const forUserId = match[3]; // Optional user mention
    await handlers.handleAddstatCommand(ctx, match[1], parseInt(match[2], 10), forUserId);
    return;
  }

  // Account commands
  match = content.match(patterns.ACCOUNT_SET_USER_PATTERN);
  if (match) {
    await handlers.handleAccountSetCommand(ctx, match[1], match[2]);
    return;
  }

  match = content.match(patterns.ACCOUNT_SET_PATTERN);
  if (match) {
    await handlers.handleAccountSetCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.ACCOUNT_DEL_PATTERN);
  if (match) {
    await handlers.handleAccountDelCommand(ctx);
    return;
  }

  // Sitter commands
  match = content.match(patterns.SITTER_SET_PATTERN);
  if (match) {
    await handlers.handleSitterSetCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.SITTER_DEL_PATTERN);
  if (match) {
    await handlers.handleSitterDelCommand(ctx, match[1]);
    return;
  }

  // Players command
  match = content.match(patterns.PLAYERS_PATTERN);
  if (match) {
    await handlers.handlePlayersCommand(ctx);
    return;
  }

  // ============================================
  // Channel-specific commands
  // ============================================

  const isDefenseChannel = ctx.channelId === ctx.config.defenseChannelId;
  const isScoutChannel = ctx.channelId === ctx.config.scoutChannelId;

  if (!isDefenseChannel) {
    const slash = stackCommandTypedElsewhere(content);
    if (slash) {
      await replyError(ctx, errors.wrongChannel("defense", ctx.config.defenseChannelId, slash));
      return;
    }
  }
  if (!isScoutChannel) {
    if (patterns.SCOUT_PATTERN.test(content) || patterns.SCOUT_VERBOSE_PATTERN.test(content)) {
      await replyError(ctx, errors.wrongChannel("scout", ctx.config.scoutChannelId, "scout"));
      return;
    }
  }

  if (!isDefenseChannel && !isScoutChannel) return;

  // Defense channel commands
  if (isDefenseChannel) {
    // Sent command (simple or verbose format)
    match = content.match(patterns.SENT_PATTERN) || content.match(patterns.SENT_VERBOSE_PATTERN);
    if (match) {
      const forUserId = match[3]; // Optional user mention
      await handlers.handleSentCommand(ctx, match[1], parseInt(match[2], 10), forUserId);
      return;
    }

    // Stack command
    match = content.match(patterns.STACK_PATTERN);
    if (match) {
      await handlers.handleStackCommand(ctx, match[1], parseInt(match[2], 10), match[3] || "");
      return;
    }

    // Deletedef command
    match = content.match(patterns.DELETEDEF_PATTERN);
    if (match) {
      await handlers.handleDeleteDefCommand(ctx, parseInt(match[1], 10));
      return;
    }

    // Stackinfo command
    match = content.match(patterns.STACKINFO_PATTERN);
    if (match) {
      await handlers.handleStackinfoCommand(ctx);
      return;
    }

    // Updatedef command (admin only)
    match = content.match(patterns.UPDATEDEF_PATTERN);
    if (match) {
      await handlers.handleUpdateDefCommand(ctx, parseInt(match[1], 10), match[2] || "");
      return;
    }

    // Undo command
    match = content.match(patterns.UNDO_PATTERN);
    if (match) {
      await handlers.handleUndoCommand(ctx, match[1] ? parseInt(match[1], 10) : undefined);
      return;
    }
  }

  // Scout channel commands
  if (isScoutChannel) {
    // Scout command (simple or verbose format)
    match = content.match(patterns.SCOUT_PATTERN) || content.match(patterns.SCOUT_VERBOSE_PATTERN);
    if (match) {
      await handlers.handleScoutCommand(ctx, match[1], match[2]);
      return;
    }
  }
}
