import { Client, Message } from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { processSingleCommand } from "./router";

/**
 * Handle text messages that look like slash commands (e.g., "/sent id: 1 troops: 200")
 * Works for both new messages and edited messages
 * Supports multiple commands per message, one per line
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

  // Split message into lines and process each as a potential command
  const lines = message.content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  for (const content of lines) {
    // Process each line as a separate command
    await processSingleCommand({ client, message, guildId, config, channelId }, content);
  }
}

/**
 * @deprecated Use handleTextCommand instead
 */
export async function handleMessageEdit(
  client: Client,
  _oldMessage: Message | null,
  newMessage: Message
): Promise<void> {
  await handleTextCommand(client, newMessage);
}
