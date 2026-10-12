import fs from "fs";
import path from "path";
import type { Scope } from "./scope";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_FILE = path.join(DATA_DIR, "guilds.json");

/** Settings each confed has on its own. The main confed keeps them at the top of `GuildConfig`. */
export interface ConfedSettings {
  defenseChannelId?: string;
  scoutChannelId?: string;
  scoutRoleId?: string;
  pushChannelId?: string;
  defCallsChannelId?: string;
}

const CONFED_SETTING_KEYS: (keyof ConfedSettings)[] = [
  "defenseChannelId",
  "scoutChannelId",
  "scoutRoleId",
  "pushChannelId",
  "defCallsChannelId",
];

/** A confed besides the main one, bound to a Discord category. See `src/config/scope.ts`. */
export interface Confed extends ConfedSettings {
  id: string;
  name: string;
  categoryId: string;
}

export interface GuildConfig extends ConfedSettings {
  serverKey?: string;
  serverTimezone?: string;
  accountReminderChannelId?: string;
  accountReminderMessageId?: string;
  /** Role IDs per permission. See `src/actions/permissions.ts` for what an empty list means. */
  permissions?: GuildPermissions;
  confeds?: Confed[];
  nextConfedId?: number;
}

export type Permission = "request" | "manage";

export type GuildPermissions = Record<Permission, string[]>;

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

/**
 * Config as seen from one confed: the guild-wide settings plus that confed's
 * channels and scout role. A confed never inherits the main confed's channels.
 */
export function getScopeConfig(scope: Scope): GuildConfig {
  const config = getGuildConfig(scope.guildId);
  if (!scope.confedId) return config;
  const confed = config.confeds?.find((c) => c.id === scope.confedId);
  const scoped: GuildConfig = { ...config };
  for (const key of CONFED_SETTING_KEYS) scoped[key] = confed?.[key];
  return scoped;
}

export function getConfed(scope: Scope): Confed | undefined {
  if (!scope.confedId) return undefined;
  return getGuildConfig(scope.guildId).confeds?.find((c) => c.id === scope.confedId);
}

export function setConfedSetting(scope: Scope, key: keyof ConfedSettings, value: string | null): void {
  const configs = loadConfigs();
  const config = configs[scope.guildId] ?? {};
  const apply = <T extends ConfedSettings>(target: T): T => {
    const next = { ...target };
    if (value === null) delete next[key];
    else next[key] = value;
    return next;
  };
  if (!scope.confedId) {
    configs[scope.guildId] = apply(config);
  } else {
    configs[scope.guildId] = {
      ...config,
      confeds: (config.confeds ?? []).map((c) => (c.id === scope.confedId ? apply(c) : c)),
    };
  }
  saveConfigs(configs);
}

export function addConfed(guildId: string, name: string, categoryId: string): Confed {
  const configs = loadConfigs();
  const config = configs[guildId] ?? {};
  const nextId = config.nextConfedId ?? 1;
  const confed: Confed = { id: `c${nextId}`, name, categoryId };
  configs[guildId] = { ...config, confeds: [...(config.confeds ?? []), confed], nextConfedId: nextId + 1 };
  saveConfigs(configs);
  return confed;
}

/** Unbinds a confed from its category. Its requests and stats stay on disk. */
export function removeConfed(guildId: string, confedId: string): void {
  const configs = loadConfigs();
  const config = configs[guildId] ?? {};
  configs[guildId] = { ...config, confeds: (config.confeds ?? []).filter((c) => c.id !== confedId) };
  saveConfigs(configs);
}

export function setServerTimezone(
  guildId: string,
  timezone: string | null
): void {
  const configs = loadConfigs();
  if (timezone === null) {
    const { serverTimezone, ...rest } = configs[guildId] || {};
    configs[guildId] = rest;
  } else {
    configs[guildId] = { ...configs[guildId], serverTimezone: timezone };
  }
  saveConfigs(configs);
}

export function setServerKey(guildId: string, serverKey: string): void {
  const configs = loadConfigs();
  configs[guildId] = { ...configs[guildId], serverKey };
  saveConfigs(configs);
}

export function setPermissionRoles(guildId: string, permission: Permission, roleIds: string[]): void {
  const configs = loadConfigs();
  const current = configs[guildId]?.permissions ?? { request: [], manage: [] };
  configs[guildId] = { ...configs[guildId], permissions: { ...current, [permission]: roleIds } };
  saveConfigs(configs);
}

export function setAccountReminderMessage(
  guildId: string,
  channelId: string,
  messageId: string
): void {
  const configs = loadConfigs();
  configs[guildId] = {
    ...configs[guildId],
    accountReminderChannelId: channelId,
    accountReminderMessageId: messageId,
  };
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
