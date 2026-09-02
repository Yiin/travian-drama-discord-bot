import { Client, Message } from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { processSingleCommand } from "./router";
import { getMessageActions, getAction } from "../action-history";
import { executeUndoAction } from "../../actions/undo.action";

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

  const previous = getMessageActions(guildId, message.id);
  if (previous) {
    // Discord also fires MessageUpdate for embed resolution; same content means nothing to do
    if (previous.content === message.content) return;
    await undoPreviousActions(client, message, previous.actionIds);
  }

  // Split message into lines and process each as a potential command
  const lines = message.content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  for (const content of lines) {
    // Process each line as a separate command
    await processSingleCommand({ client, message, guildId, config, channelId }, content);
  }
}

async function undoPreviousActions(client: Client, message: Message, actionIds: number[]): Promise<void> {
  const guildId = message.guildId!;
  const config = getGuildConfig(guildId);
  for (const actionId of actionIds) {
    const action = getAction(guildId, actionId);
    if (!action || action.undone) continue;
    const result = await executeUndoAction(
      { guildId, config, client, userId: message.author.id },
      { actionId }
    );
    if (!result.success) {
      console.warn(`[TextCommand] Could not undo action #${actionId} for edited message ${message.id}: ${result.error}`);
    }
  }
}
