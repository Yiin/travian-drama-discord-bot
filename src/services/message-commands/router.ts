import { CommandContext } from "./types";
import * as patterns from "./patterns";
import * as handlers from "./handlers";
import { getRequestByChannelId } from "../def-calls";
import { parseTroopCount } from "../../utils/parse-number";
import { errors } from "../../actions/messages";
import { replyError } from "./utils";

type ChannelKindInput = "defense" | "stack" | "scout" | "defcalls" | "push";

/** Slash command to suggest when a stack-queue text command is typed outside the stack channel. */
function stackCommandTypedElsewhere(content: string): string | undefined {
  if (patterns.SENT_PATTERN.test(content) || patterns.SENT_VERBOSE_PATTERN.test(content)) return "stack sent";
  if (patterns.STACK_PATTERN.test(content)) return "stack request";
  if (patterns.REMOVE_PATTERN.test(content)) return "stack remove";
  if (patterns.MOVE_PATTERN.test(content)) return "stack move";
  if (patterns.STACK_LIST_PATTERN.test(content)) return "stack list";
  return undefined;
}

/**
 * Route one line of a message to its handler.
 */
export async function processSingleCommand(
  ctx: CommandContext,
  content: string
): Promise<void> {
  // ============================================
  // Global commands (work in any channel)
  // ============================================

  let match = content.match(patterns.LOOKUP_PATTERN);
  if (match) {
    await handlers.handleLookupCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.HELP_PATTERN);
  if (match) {
    await handlers.handleHelpCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.SETUP_SERVER_PATTERN);
  if (match) {
    await handlers.handleSetupServerCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.SETUP_CHANNEL_PATTERN);
  if (match) {
    const kind = match[1].toLowerCase() as ChannelKindInput;
    await handlers.handleSetupChannelCommand(ctx, kind === "stack" ? "defense" : kind, match[2]);
    return;
  }

  match = content.match(patterns.SETUP_SCOUTROLE_PATTERN);
  if (match) {
    await handlers.handleSetupScoutRoleCommand(ctx, match[1], match[2]);
    return;
  }

  match = content.match(patterns.SETUP_TIMEZONE_PATTERN);
  if (match) {
    await handlers.handleSetupTimezoneCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.SETUP_SHOW_PATTERN);
  if (match) {
    await handlers.handleSetupShowCommand(ctx);
    return;
  }

  // Defense calls work in any channel; the thread identifies the request for !sent / !close
  match = content.match(patterns.DEF_PATTERN);
  if (match) {
    const limit = parseTroopCount(match[4]) ?? undefined;
    await handlers.handleDefCommand(ctx, match[1], match[2], match[3] || undefined, limit);
    return;
  }

  match = content.match(patterns.CLOSE_PATTERN);
  if (match) {
    await handlers.handleCloseCommand(ctx);
    return;
  }

  match = content.match(patterns.DEFCALL_SENT_PATTERN);
  if (match) {
    const defCall = getRequestByChannelId(ctx.guildId, ctx.channelId);
    if (defCall) {
      await handlers.handleDefCallSentCommand(ctx, defCall.requestId, parseInt(match[1], 10), match[2]);
      return;
    }
  }

  // Undo works anywhere
  match = content.match(patterns.UNDO_PATTERN);
  if (match) {
    await handlers.handleUndoCommand(ctx, match[1] ? parseInt(match[1], 10) : undefined);
    return;
  }

  // Stats
  match = content.match(patterns.STATS_LEADERBOARD_PATTERN);
  if (match) {
    await handlers.handleStatsLeaderboardCommand(ctx);
    return;
  }

  match = content.match(patterns.STATS_ME_PATTERN);
  if (match) {
    await handlers.handleStatsUserCommand(ctx, ctx.message.author.id);
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

  match = content.match(patterns.STATS_PLAYERS_PATTERN);
  if (match) {
    await handlers.handlePlayersCommand(ctx);
    return;
  }

  match = content.match(patterns.STATS_ADD_PATTERN);
  if (match) {
    await handlers.handleStatsAddCommand(ctx, match[1], parseInt(match[2], 10), match[3]);
    return;
  }

  match = content.match(patterns.STATS_RESET_PATTERN);
  if (match) {
    await handlers.handleStatsResetCommand(ctx);
    return;
  }

  // Account and sitter
  match = content.match(patterns.ACCOUNT_LINK_USER_PATTERN);
  if (match) {
    await handlers.handleAccountLinkCommand(ctx, match[1], match[2]);
    return;
  }

  match = content.match(patterns.ACCOUNT_LINK_PATTERN);
  if (match) {
    await handlers.handleAccountLinkCommand(ctx, match[1]);
    return;
  }

  match = content.match(patterns.ACCOUNT_UNLINK_PATTERN);
  if (match) {
    await handlers.handleAccountUnlinkCommand(ctx, match[1]);
    return;
  }

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

  // ============================================
  // Channel-specific commands
  // ============================================

  const isStackChannel = ctx.channelId === ctx.config.defenseChannelId;
  const isScoutChannel = ctx.channelId === ctx.config.scoutChannelId;

  if (!isStackChannel) {
    const slash = stackCommandTypedElsewhere(content);
    if (slash) {
      await replyError(ctx, errors.wrongChannel("defense", ctx.config.defenseChannelId, slash));
      return;
    }
  }
  if (!isScoutChannel) {
    if (patterns.SCOUT_PATTERN.test(content) || patterns.SCOUT_VERBOSE_PATTERN.test(content)) {
      await replyError(ctx, errors.wrongChannel("scout", ctx.config.scoutChannelId, "scout request"));
      return;
    }
  }

  if (isStackChannel) {
    match = content.match(patterns.SENT_PATTERN) || content.match(patterns.SENT_VERBOSE_PATTERN);
    if (match) {
      await handlers.handleSentCommand(ctx, match[1], parseInt(match[2], 10), match[3]);
      return;
    }

    match = content.match(patterns.STACK_PATTERN);
    if (match) {
      await handlers.handleStackCommand(ctx, match[1], parseInt(match[2], 10), match[3] || "");
      return;
    }

    match = content.match(patterns.REMOVE_PATTERN);
    if (match) {
      await handlers.handleRemoveCommand(ctx, parseInt(match[1], 10));
      return;
    }

    match = content.match(patterns.MOVE_PATTERN);
    if (match) {
      await handlers.handleMoveCommand(ctx, parseInt(match[1], 10), parseInt(match[2], 10));
      return;
    }

    match = content.match(patterns.STACK_LIST_PATTERN);
    if (match) {
      await handlers.handleStackListCommand(ctx);
      return;
    }
  }

  if (isScoutChannel) {
    match = content.match(patterns.SCOUT_PATTERN) || content.match(patterns.SCOUT_VERBOSE_PATTERN);
    if (match) {
      await handlers.handleScoutCommand(ctx, match[1], match[2]);
      return;
    }
  }
}
