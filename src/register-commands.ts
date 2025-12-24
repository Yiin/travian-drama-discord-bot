import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import { commands } from "./commands";

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("DISCORD_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID must be set");
  process.exit(1);
}

const rest = new REST().setToken(token);

async function registerCommands() {
  try {
    console.log(`Registering ${commands.size} slash commands to guild ${guildId}...`);

    const commandData = commands.map((cmd) => cmd.data.toJSON());

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandData,
    });

    console.log("Successfully registered commands");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

registerCommands();
