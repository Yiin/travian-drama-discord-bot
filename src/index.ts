import { Client, Events, GatewayIntentBits, Partials, MessageFlags } from "discord.js";
import dotenv from "dotenv";
import { commands } from "./commands";
import { startScheduler } from "./services/map-scheduler";
import { loadAndRescheduleNotifications } from "./services/scout-scheduler";
import { loadAndRescheduleReminders } from "./services/reminder-scheduler";
import { handleTextCommand } from "./services/message-commands";
import { markScoutMessageAsDoneById } from "./services/button-handlers/scout";
import {
  handleSentButton,
  handleSentModal,
  handleRequestDefButton,
  handleRequestDefModal,
  handleScoutGoingButton,
  handleScoutGoingModal,
  handleScoutDoneButton,
  handlePushSentButton,
  handlePushSentModal,
  handlePushDeleteButton,
  handleStackUpButton,
  handleStackDownButton,
  handleStackEditButton,
  handleStackEditModal,
  handleStackDeleteButton,
  handleStackConfirmDelete,
  handleStackCancelDelete,
  handleAccountReminderAddButton,
  handleAccountReminderSkipButton,
  handleAccountReminderModal,
  handleDefCallRequestButton,
  handleDefCallRequestModal,
  handleDefCallSentButton,
  handleDefCallSentModal,
  handleDefCallCloseButton,
  DEFCALL_REQUEST_BUTTON_ID,
  DEFCALL_REQUEST_MODAL_ID,
  DEFCALL_SENT_BUTTON_ID,
  DEFCALL_SENT_MODAL_ID,
  DEFCALL_CLOSE_BUTTON_ID,
  ACCOUNT_REMINDER_ADD_BUTTON_ID,
  ACCOUNT_REMINDER_SKIP_BUTTON_ID,
  ACCOUNT_REMINDER_MODAL_ID,
  SENT_BUTTON_ID,
  SENT_MODAL_ID,
  REQUEST_DEF_BUTTON_ID,
  REQUEST_DEF_MODAL_ID,
  SCOUT_GOING_BUTTON_ID,
  SCOUT_GOING_MODAL_ID,
  SCOUT_DONE_BUTTON_ID,
  PUSH_SENT_BUTTON_ID,
  PUSH_DELETE_BUTTON_ID,
  PUSH_SENT_MODAL_ID,
  STACK_UP_PREFIX,
  STACK_DOWN_PREFIX,
  STACK_EDIT_PREFIX,
  STACK_DELETE_PREFIX,
  STACK_CONFIRM_DELETE_PREFIX,
  STACK_CANCEL_DELETE_PREFIX,
  STACK_EDIT_MODAL_PREFIX,
  handleUndoButton,
  UNDO_BUTTON_PREFIX,
} from "./services/button-handlers/index";
import { cacheCommandIds } from "./actions/messages";
import { handleHelpButton } from "./commands/help";
import { HELP_BUTTON_PREFIX } from "./services/help";
import { errors } from "./actions/messages";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot is ready! Logged in as ${readyClient.user.tag}`);

  // Cache slash command IDs so error messages can link commands
  await cacheCommandIds(readyClient, process.env.DISCORD_GUILD_ID);
// Start the map data scheduler
  startScheduler();

  // Load and reschedule any pending scout notifications
  loadAndRescheduleNotifications(readyClient, markScoutMessageAsDoneById);

  // Load and reschedule repeating reminders
  loadAndRescheduleReminders(readyClient);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleTextCommand(client, message);
  } catch (error) {
    console.error("Error handling message:", error);
  }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  try {
    // Embed resolution and pins also fire this event; only content changes matter
    if (!oldMessage.partial && !newMessage.partial && oldMessage.content === newMessage.content) return;
    // Fetch full message if partial
    const message = newMessage.partial ? await newMessage.fetch() : newMessage;
    await handleTextCommand(client, message);
  } catch (error) {
    console.error("Error handling message edit:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    try {
      if (interaction.customId === SENT_BUTTON_ID) {
        await handleSentButton(interaction);
      } else if (interaction.customId === REQUEST_DEF_BUTTON_ID) {
        await handleRequestDefButton(interaction);
      } else if (interaction.customId === SCOUT_GOING_BUTTON_ID) {
        await handleScoutGoingButton(interaction);
      } else if (interaction.customId === SCOUT_DONE_BUTTON_ID) {
        await handleScoutDoneButton(interaction);
      } else if (interaction.customId === PUSH_SENT_BUTTON_ID) {
        await handlePushSentButton(interaction);
      } else if (interaction.customId === PUSH_DELETE_BUTTON_ID) {
        await handlePushDeleteButton(interaction);
      } else if (interaction.customId.startsWith(STACK_UP_PREFIX)) {
        await handleStackUpButton(interaction);
      } else if (interaction.customId.startsWith(STACK_DOWN_PREFIX)) {
        await handleStackDownButton(interaction);
      } else if (interaction.customId.startsWith(STACK_EDIT_PREFIX + ":")) {
        await handleStackEditButton(interaction);
      } else if (interaction.customId.startsWith(STACK_DELETE_PREFIX)) {
        await handleStackDeleteButton(interaction);
      } else if (interaction.customId.startsWith(STACK_CONFIRM_DELETE_PREFIX)) {
        await handleStackConfirmDelete(interaction);
      } else if (interaction.customId.startsWith(STACK_CANCEL_DELETE_PREFIX)) {
        await handleStackCancelDelete(interaction);
      } else if (interaction.customId.startsWith(UNDO_BUTTON_PREFIX)) {
        await handleUndoButton(interaction);
      } else if (interaction.customId.startsWith(HELP_BUTTON_PREFIX)) {
        await handleHelpButton(interaction);
      } else if (interaction.customId === ACCOUNT_REMINDER_ADD_BUTTON_ID) {
        await handleAccountReminderAddButton(interaction);
      } else if (interaction.customId === ACCOUNT_REMINDER_SKIP_BUTTON_ID) {
        await handleAccountReminderSkipButton(interaction);
      } else if (interaction.customId === DEFCALL_REQUEST_BUTTON_ID) {
        await handleDefCallRequestButton(interaction);
      } else if (interaction.customId === DEFCALL_SENT_BUTTON_ID) {
        await handleDefCallSentButton(interaction);
      } else if (interaction.customId === DEFCALL_CLOSE_BUTTON_ID) {
        await handleDefCallCloseButton(interaction);
      }
    } catch (error) {
      console.error("Error handling button interaction:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: errors.generic(),
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch {
        // Ignore reply errors
      }
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId === SENT_MODAL_ID) {
        await handleSentModal(interaction);
      } else if (interaction.customId === REQUEST_DEF_MODAL_ID) {
        await handleRequestDefModal(interaction);
      } else if (interaction.customId.startsWith(SCOUT_GOING_MODAL_ID)) {
        await handleScoutGoingModal(interaction);
      } else if (interaction.customId === PUSH_SENT_MODAL_ID) {
        await handlePushSentModal(interaction);
      } else if (interaction.customId.startsWith(STACK_EDIT_MODAL_PREFIX)) {
        await handleStackEditModal(interaction);
      } else if (interaction.customId === ACCOUNT_REMINDER_MODAL_ID) {
        await handleAccountReminderModal(interaction);
      } else if (interaction.customId === DEFCALL_REQUEST_MODAL_ID) {
        await handleDefCallRequestModal(interaction);
      } else if (interaction.customId === DEFCALL_SENT_MODAL_ID) {
        await handleDefCallSentModal(interaction);
      }
    } catch (error) {
      console.error("Error handling modal submission:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: errors.generic(),
            flags: MessageFlags.Ephemeral,
          });
        }
      } catch {
        // Ignore reply errors
      }
    }
    return;
  }

  // Handle autocomplete interactions
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);

    try {
      const reply = {
        content: errors.generic(),
        flags: MessageFlags.Ephemeral as const,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      // Interaction may have expired or already been handled
      console.error("Failed to send error reply:", replyError);
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set in environment variables");
  process.exit(1);
}

client.login(token);
