import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import { commands } from "./commands";

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID must be set");
  process.exit(1);
}

const rest = new REST().setToken(token);

async function registerCommands() {
  try {
    console.log(`Registering ${commands.size} slash commands...`);

    const commandData = commands.map((cmd) => cmd.data.toJSON());

    if (guildId) {
      // Register to specific guild (instant, good for development)
      await rest.put(Routes.applicationGuildCommands(clientId!, guildId), {
        body: commandData,
      });
      console.log(`Successfully registered commands to guild ${guildId}`);
    } else {
      // Register globally (can take up to an hour to propagate)
      await rest.put(Routes.applicationCommands(clientId!), {
        body: commandData,
      });
      console.log("Successfully registered commands globally");
    }
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

registerCommands();
