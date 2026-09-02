import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  TextChannel,
} from "discord.js";
import { getGuildConfig, setAccountReminderMessage } from "../config/guild-config";
import {
  ACCOUNT_REMINDER_ADD_BUTTON_ID,
  ACCOUNT_REMINDER_SKIP_BUTTON_ID,
} from "./button-handlers/account-reminder";

/**
 * The one account-link reminder message per guild. Posting a new one deletes the old one.
 * Used by `/account reminder` and the setup panel.
 */
export async function postAccountReminder(
  client: Client,
  guildId: string,
  channel: TextChannel,
): Promise<void> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ACCOUNT_REMINDER_ADD_BUTTON_ID).setLabel("Add").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(ACCOUNT_REMINDER_SKIP_BUTTON_ID).setLabel("Not playing").setStyle(ButtonStyle.Secondary),
  );

  const content =
    "**Link your Discord account to your in-game account**\n" +
    "Press **Add** to enter your player name.\n" +
    "Press **Not playing** if you are not playing this server.";

  const config = getGuildConfig(guildId);
  if (config.accountReminderChannelId && config.accountReminderMessageId) {
    try {
      const oldChannel = (await client.channels.fetch(config.accountReminderChannelId)) as TextChannel | null;
      const oldMessage = await oldChannel?.messages.fetch(config.accountReminderMessageId);
      await oldMessage?.delete();
    } catch {
      // Old message already gone
    }
  }

  const message = await channel.send({ content, components: [row] });
  setAccountReminderMessage(guildId, channel.id, message.id);
}
