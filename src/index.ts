import { Client, Events, GatewayIntentBits, Partials, MessageFlags } from "discord.js";
import dotenv from "dotenv";
import { commands } from "./commands";
import { startScheduler } from "./services/map-scheduler";
import { loadAndRescheduleNotifications } from "./services/scout-scheduler";
import { loadAndRescheduleReminders } from "./services/reminder-scheduler";
import { loadAndScheduleLandings } from "./services/landing-scheduler";
import { handleTextCommand } from "./services/message-commands";
import { markScoutMessageAsDoneById } from "./services/button-handlers/scout";
import {
  handleSentButton,
  handleSentModal,
  handleRequestDefButton,
  handleRequestDefModal,
  handleScoutGoingButton,
  handleScoutGoingModal,
  handleScoutResultButton,
  handleScoutResultModal,
  handlePushSentButton,
  handlePushSentModal,
  handlePushCloseButton,
  handlePushEditButton,
  handlePushEditModal,
  handlePushAllSendersButton,
  handleStackPanelEditButton,
  handleStackPickSelect,
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
  DEFCALL_SENT_FOR_BUTTON_ID,
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
  SCOUT_RESULT_BUTTON_ID,
  SCOUT_RESULT_MODAL_ID,
  PUSH_SENT_BUTTON_ID,
  PUSH_CLOSE_BUTTON_ID,
  PUSH_EDIT_BUTTON_ID,
  PUSH_ALL_SENDERS_BUTTON_ID,
  PUSH_SENT_MODAL_ID,
  PUSH_EDIT_MODAL_ID,
  STACK_PANEL_EDIT_BUTTON_ID,
  STACK_PICK_SELECT_ID,
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
import { LOOKUP_PLAYER_SELECT_ID, isLookupPickerActive } from "./commands/lookup";
import { STATS_RESET_CONFIRM_ID, STATS_RESET_CANCEL_ID, isStatsResetActive } from "./commands/stats";
import { ensureMigrated as ensureStackMigrated } from "./services/defense-requests";
import { ensureMigrated as ensurePushMigrated } from "./services/push-requests";
import { ensureMigrated as ensureDefCallsMigrated } from "./services/def-calls";
import { handleHelpButton } from "./commands/help";
import { HELP_BUTTON_PREFIX } from "./services/help";
import { errors, ACCOUNT_LINK_BUTTON_PREFIX, SETUP_OPEN_BUTTON_ID, SETUP_PING_ADMIN_BUTTON_ID } from "./actions/messages";
import {
  postWelcomePanel,
  warnIfCommandsMissing,
  handleSetupOpenButton,
  handleSetupPingAdminButton,
  handleSetupServerButton,
  handleSetupServerModal,
  handleSetupChannelSelect,
  handleSetupRoleSelect,
  handleSetupTimezoneButton,
  handleSetupTimezoneModal,
  handleSetupReminderButton,
  handleSetupFinishButton,
  SETUP_SERVER_BUTTON_ID,
  SETUP_SERVER_MODAL_ID,
  SETUP_TIMEZONE_BUTTON_ID,
  SETUP_TIMEZONE_MODAL_ID,
  SETUP_CHANNEL_SELECT_PREFIX,
  SETUP_ROLE_SELECT_ID,
  SETUP_FINISH_BUTTON_ID,
  SETUP_REMINDER_BUTTON_ID,
} from "./services/setup-panel";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message],
});

/**
 * Pickers handled by a collector (lookup select, stats reset) get no reply here
 * while the collector lives. Someone else's click, or a click after a restart or
 * timeout, would otherwise show "This interaction failed".
 */
async function replyIfPickerStale(
  interaction: import("discord.js").MessageComponentInteraction,
  active: boolean,
): Promise<void> {
  const owner = interaction.message.interactionMetadata?.user.id;
  if (owner && owner !== interaction.user.id) {
    await interaction.reply({ content: "⚠️ **This picker belongs to someone else.** Run the command yourself.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!active) {
    await interaction.reply({ content: "⚠️ **This picker expired.** Run the command again.", flags: MessageFlags.Ephemeral });
  }
}

/** Ephemeral generic error; follows up when the handler already replied or deferred. */
async function replyGenericError(interaction: import("discord.js").RepliableInteraction): Promise<void> {
  const reply = { content: errors.generic(), flags: MessageFlags.Ephemeral as const };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  } catch {
    // Interaction may have expired or already been handled
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot is ready! Logged in as ${readyClient.user.tag}`);

  // Run id migrations for every store now, before any command can touch them
  ensureStackMigrated();
  ensurePushMigrated();
  ensureDefCallsMigrated();

  // Cache slash command IDs so error messages can link commands
  await cacheCommandIds(readyClient, process.env.DISCORD_GUILD_ID);
// Start the map data scheduler
  startScheduler();

  // Load and reschedule any pending scout notifications
  loadAndRescheduleNotifications(readyClient, markScoutMessageAsDoneById);

  // Load and reschedule repeating reminders
  loadAndRescheduleReminders(readyClient);

  // Flip def-call cards to "Landed" at landing time
  loadAndScheduleLandings(readyClient);
});

// Onboarding: greet a new server with the setup panel
client.on(Events.GuildCreate, async (guild) => {
  try {
    await warnIfCommandsMissing(guild);
    await postWelcomePanel(client, guild);
  } catch (error) {
    console.error(`Error onboarding guild ${guild.id}:`, error);
  }
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
    // Pins and embed resolution fire this event too; only a real edit has a timestamp
    if (message.editedTimestamp === null) return;
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
      } else if (interaction.customId.startsWith(SCOUT_GOING_BUTTON_ID)) {
        await handleScoutGoingButton(interaction);
      } else if (interaction.customId.startsWith(SCOUT_RESULT_BUTTON_ID)) {
        await handleScoutResultButton(interaction);
      } else if (interaction.customId === PUSH_SENT_BUTTON_ID) {
        await handlePushSentButton(interaction);
      } else if (interaction.customId === PUSH_CLOSE_BUTTON_ID) {
        await handlePushCloseButton(interaction);
      } else if (interaction.customId === PUSH_EDIT_BUTTON_ID) {
        await handlePushEditButton(interaction);
      } else if (interaction.customId === PUSH_ALL_SENDERS_BUTTON_ID) {
        await handlePushAllSendersButton(interaction);
      } else if (interaction.customId === STACK_PANEL_EDIT_BUTTON_ID) {
        await handleStackPanelEditButton(interaction);
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
      } else if (
        interaction.customId === ACCOUNT_REMINDER_ADD_BUTTON_ID ||
        interaction.customId.startsWith(ACCOUNT_LINK_BUTTON_PREFIX)
      ) {
        await handleAccountReminderAddButton(interaction);
      } else if (interaction.customId === SETUP_OPEN_BUTTON_ID) {
        await handleSetupOpenButton(interaction);
      } else if (interaction.customId === SETUP_PING_ADMIN_BUTTON_ID) {
        await handleSetupPingAdminButton(interaction);
      } else if (interaction.customId === SETUP_SERVER_BUTTON_ID) {
        await handleSetupServerButton(interaction);
      } else if (interaction.customId === SETUP_TIMEZONE_BUTTON_ID) {
        await handleSetupTimezoneButton(interaction);
      } else if (interaction.customId === SETUP_FINISH_BUTTON_ID) {
        await handleSetupFinishButton(interaction);
      } else if (interaction.customId === SETUP_REMINDER_BUTTON_ID) {
        await handleSetupReminderButton(interaction);
      } else if (interaction.customId === ACCOUNT_REMINDER_SKIP_BUTTON_ID) {
        await handleAccountReminderSkipButton(interaction);
      } else if (interaction.customId === DEFCALL_REQUEST_BUTTON_ID) {
        await handleDefCallRequestButton(interaction);
      } else if (interaction.customId === DEFCALL_SENT_BUTTON_ID || interaction.customId === DEFCALL_SENT_FOR_BUTTON_ID) {
        await handleDefCallSentButton(interaction);
      } else if (interaction.customId === DEFCALL_CLOSE_BUTTON_ID) {
        await handleDefCallCloseButton(interaction);
      } else if (interaction.customId === STATS_RESET_CONFIRM_ID || interaction.customId === STATS_RESET_CANCEL_ID) {
        await replyIfPickerStale(interaction, isStatsResetActive(interaction.message.id));
      }
    } catch (error) {
      console.error("Error handling button interaction:", error);
      await replyGenericError(interaction);
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
      } else if (interaction.customId.startsWith(SCOUT_RESULT_MODAL_ID)) {
        await handleScoutResultModal(interaction);
      } else if (interaction.customId === PUSH_SENT_MODAL_ID) {
        await handlePushSentModal(interaction);
      } else if (interaction.customId === PUSH_EDIT_MODAL_ID) {
        await handlePushEditModal(interaction);
      } else if (interaction.customId.startsWith(STACK_EDIT_MODAL_PREFIX)) {
        await handleStackEditModal(interaction);
      } else if (interaction.customId.startsWith(ACCOUNT_REMINDER_MODAL_ID)) {
        await handleAccountReminderModal(interaction);
      } else if (interaction.customId === SETUP_SERVER_MODAL_ID) {
        await handleSetupServerModal(interaction);
      } else if (interaction.customId === SETUP_TIMEZONE_MODAL_ID) {
        await handleSetupTimezoneModal(interaction);
      } else if (interaction.customId === DEFCALL_REQUEST_MODAL_ID) {
        await handleDefCallRequestModal(interaction);
      } else if (interaction.customId === DEFCALL_SENT_MODAL_ID) {
        await handleDefCallSentModal(interaction);
      }
    } catch (error) {
      console.error("Error handling modal submission:", error);
      await replyGenericError(interaction);
    }
    return;
  }

  // Handle select menus
  if (interaction.isStringSelectMenu()) {
    try {
      if (interaction.customId === STACK_PICK_SELECT_ID) {
        await handleStackPickSelect(interaction);
      } else if (interaction.customId === LOOKUP_PLAYER_SELECT_ID) {
        await replyIfPickerStale(interaction, isLookupPickerActive(interaction.message.id));
      }
    } catch (error) {
      console.error("Error handling select menu:", error);
      await replyGenericError(interaction);
    }
    return;
  }

  // Setup panel pickers
  if (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) {
    try {
      if (interaction.isChannelSelectMenu() && interaction.customId.startsWith(SETUP_CHANNEL_SELECT_PREFIX)) {
        await handleSetupChannelSelect(interaction);
      } else if (interaction.isRoleSelectMenu() && interaction.customId === SETUP_ROLE_SELECT_ID) {
        await handleSetupRoleSelect(interaction);
      }
    } catch (error) {
      console.error("Error handling setup picker:", error);
      await replyGenericError(interaction);
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

    await replyGenericError(interaction);
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set in environment variables");
  process.exit(1);
}

client.login(token);
