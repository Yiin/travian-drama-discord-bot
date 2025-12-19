import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import dotenv from "dotenv";
import { commands } from "./commands";
import { startScheduler } from "./services/map-scheduler";
import { handleTextCommand } from "./services/message-commands";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
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

try {
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
      // Fetch full message if partial
      const message = newMessage.partial ? await newMessage.fetch() : newMessage;
      await handleTextCommand(client, message);
    } catch (error) {
      console.error("Error handling message edit:", error);
    }
  });
} catch {
  console.error('Missing permissions for MessageUpdate')
}

client.on(Events.InteractionCreate, async (interaction) => {
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
