import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "guilds.json");

export interface GuildConfig {
  defenseChannelId?: string;
  scoutChannelId?: string;
  scoutRoleId?: string;
  pushChannelId?: string;
  serverKey?: string;
}

type GuildConfigs = Record<string, GuildConfig>;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadConfigs(): GuildConfigs {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }
  const data = fs.readFileSync(CONFIG_FILE, "utf-8");
  return JSON.parse(data);
}

function saveConfigs(configs: GuildConfigs): void {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2));
}

export function getGuildConfig(guildId: string): GuildConfig {
  const configs = loadConfigs();
  return configs[guildId] || {};
}

export function setDefenseChannel(
  guildId: string,
  channelId: string
): void {
  const configs = loadConfigs();
  configs[guildId] = { ...configs[guildId], defenseChannelId: channelId };
  saveConfigs(configs);
}

export function setScoutChannel(
  guildId: string,
  channelId: string
): void {
  const configs = loadConfigs();
  configs[guildId] = { ...configs[guildId], scoutChannelId: channelId };
  saveConfigs(configs);
}

export function setPushChannel(
  guildId: string,
  channelId: string
): void {
  const configs = loadConfigs();
  configs[guildId] = { ...configs[guildId], pushChannelId: channelId };
  saveConfigs(configs);
}

export function setScoutRole(guildId: string, roleId: string | null): void {
  const configs = loadConfigs();
  if (roleId === null) {
    const { scoutRoleId, ...rest } = configs[guildId] || {};
    configs[guildId] = rest;
  } else {
    configs[guildId] = { ...configs[guildId], scoutRoleId: roleId };
  }
  saveConfigs(configs);
}

export function setServerKey(guildId: string, serverKey: string): void {
  const configs = loadConfigs();
  configs[guildId] = { ...configs[guildId], serverKey };
  saveConfigs(configs);
}

export function getAllConfiguredServers(): { guildId: string; serverKey: string }[] {
  const configs = loadConfigs();
  const servers: { guildId: string; serverKey: string }[] = [];
  for (const [guildId, config] of Object.entries(configs)) {
    if (config.serverKey) {
      servers.push({ guildId, serverKey: config.serverKey });
    }
  }
  return servers;
}
