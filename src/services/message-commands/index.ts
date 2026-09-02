import { Client, Message } from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { processSingleCommand } from "./router";
import { getMessageActions, getAction, setMessageContent } from "../action-history";
import { executeUndoAction } from "../../actions/undo.action";
import { replyError, clearOwnReactions } from "./utils";

/**
 * Handle text commands typed as plain messages (e.g. "!sent 41 200").
 * Runs for new messages and for edits. Each message owns the actions it produced:
 * an edit first undoes those actions, then runs the new content. Two messages
 * "!sent 41 100" total 200; editing the second to "!sent 41 200" totals 300.
 * Supports several commands per message, one per line.
 */
export async function handleTextCommand(
  client: Client,
  message: Message
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // Must be in a guild
  const guildId = message.guildId;
  if (!guildId) return;

  const config = getGuildConfig(guildId);
  const channelId = message.channelId;
  const ctx = { client, message, guildId, config, channelId };

  const previous = getMessageActions(guildId, message.id);
  if (previous) {
    // Discord also fires MessageUpdate for embed resolution; same content means nothing to do
    if (previous.content === message.content) return;
    if (previous.noEdit) {
      await replyError(ctx, "⚠️ **Edit of an undo is ignored.** Run the command again instead.");
      return;
    }
    if (previous.expired) {
      await replyError(ctx, "⚠️ **Too old to edit.** Its actions left the history; use `/undo` instead.");
      return;
    }
    await clearOwnReactions(message);
    await undoPreviousActions(client, message, previous.actionIds);
    // Remember the new content even when it produces no action, so editing back re-runs it
    setMessageContent(guildId, message.id, message.content);
  }

  for (const content of commandLines(message.content)) {
    // Process each line as a separate command
    await processSingleCommand(ctx, content);
  }
}

/** Non-empty trimmed lines outside ``` fences. */
export function commandLines(content: string): string[] {
  const lines: string[] = [];
  let inFence = false;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.length === 0) continue;
    lines.push(line);
  }
  return lines;
}

async function undoPreviousActions(client: Client, message: Message, actionIds: number[]): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);
  for (const actionId of actionIds) {
    const action = getAction(guildId, actionId);
    if (!action || action.undone) continue;
    try {
      const result = await executeUndoAction(
        { guildId, config, client, userId: message.author.id },
        { actionId }
      );
      if (!result.success) {
        console.warn(`[TextCommand] Could not undo action #${actionId} for edited message ${message.id}: ${result.error}`);
      }
    } catch (error) {
      // One failed undo (Discord hiccup) must not block the rest or the re-run
      console.error(`[TextCommand] Undo of action #${actionId} threw for edited message ${message.id}:`, error);
    }
  }
}
