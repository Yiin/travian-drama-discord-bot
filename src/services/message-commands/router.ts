import { CommandContext } from "./types";
import * as patterns from "./patterns";
import * as handlers from "./handlers";

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
    await handlers.handleConfigureChannelCommand(ctx, match[1] as "defense" | "scout", match[2]);
    return;
  }

  match = content.match(patterns.CONFIGURE_SCOUTROLE_PATTERN);
  if (match) {
    await handlers.handleConfigureScoutRoleCommand(ctx, match[1], match[2]);
    return;
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

  if (!isDefenseChannel && !isScoutChannel) return;

  // Defense channel commands
  if (isDefenseChannel) {
    // Sent/stack command (simple or verbose format)
    match = content.match(patterns.SENT_PATTERN) || content.match(patterns.SENT_VERBOSE_PATTERN);
    if (match) {
      const forUserId = match[3]; // Optional user mention
      await handlers.handleSentCommand(ctx, match[1], parseInt(match[2], 10), forUserId);
      return;
    }

    // Def command
    match = content.match(patterns.DEF_PATTERN);
    if (match) {
      await handlers.handleDefCommand(ctx, match[1], parseInt(match[2], 10), match[3] || "");
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
      await handlers.handleUndoCommand(ctx, parseInt(match[1], 10));
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
