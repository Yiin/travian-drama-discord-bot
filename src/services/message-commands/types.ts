import { Client, Message } from "discord.js";
import { GuildConfig } from "../../config/guild-config";

export interface CommandContext {
  client: Client;
  message: Message;
  guildId: string;
  config: GuildConfig;
  channelId: string;
}

export type CommandHandler<T extends unknown[] = unknown[]> = (
  ctx: CommandContext,
  ...args: T
) => Promise<void>;
