import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
import { commands } from "./commands";
import { startScheduler } from "./services/map-scheduler";
import { handleTextCommand } from "./services/message-commands";
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
} from "./services/button-handlers/index";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot is ready! Logged in as ${readyClient.user.tag}`);

  // Start the map data scheduler
  startScheduler();
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
      }
    } catch (error) {
      console.error("Error handling button interaction:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Įvyko klaida!",
            ephemeral: true,
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
      }
    } catch (error) {
      console.error("Error handling modal submission:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Įvyko klaida!",
            ephemeral: true,
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
        content: "There was an error while executing this command!",
        ephemeral: true,
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
