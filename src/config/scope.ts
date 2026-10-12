import { BaseInteraction, Client } from "discord.js";
import { getGuildConfig } from "./guild-config";

/**
 * Where a request lives: a guild, and inside it one confed.
 *
 * A guild without confeds has one scope, `{ guildId }` (the main confed). An
 * admin can bind more confeds to Discord categories; every channel in such a
 * category, and every thread in those channels, belongs to that confed. All
 * other channels belong to the main confed.
 *
 * Stack, def-call, push and scout requests, undo history and stats are stored
 * per scope. Accounts, permissions, server key and timezone stay guild-wide.
 */
export interface Scope {
  guildId: string;
  /** Undefined for the main confed. */
  confedId?: string;
}

export function mainScope(guildId: string): Scope {
  return { guildId };
}

/** The key a data file stores this scope under. The main confed keeps the plain guild ID. */
export function scopeKey(scope: Scope): string {
  return scope.confedId ? `${scope.guildId}:${scope.confedId}` : scope.guildId;
}

export function parseScopeKey(key: string): Scope {
  const [guildId, confedId] = key.split(":");
  return confedId ? { guildId, confedId } : { guildId };
}

/** The main confed and every configured confed of a guild. */
export function guildScopes(guildId: string): Scope[] {
  const confeds = getGuildConfig(guildId).confeds ?? [];
  return [mainScope(guildId), ...confeds.map((c) => ({ guildId, confedId: c.id }))];
}

export function sameScope(a: Scope, b: Scope): boolean {
  return scopeKey(a) === scopeKey(b);
}

/** The scope of the channel an interaction came from. Null outside a guild. */
export async function resolveScope(interaction: BaseInteraction): Promise<Scope | null> {
  if (!interaction.guildId) return null;
  return scopeOfChannel(interaction.client, interaction.guildId, interaction.channelId);
}

/** The confed whose category holds this channel (or this thread's parent), else the main confed. */
export async function scopeOfChannel(client: Client, guildId: string, channelId: string | null): Promise<Scope> {
  const confeds = getGuildConfig(guildId).confeds ?? [];
  if (confeds.length === 0 || !channelId) return mainScope(guildId);
  const categoryId = await categoryOf(client, channelId);
  const confed = confeds.find((c) => c.categoryId === categoryId);
  return confed ? { guildId, confedId: confed.id } : mainScope(guildId);
}

async function fetchChannel(client: Client, channelId: string) {
  return client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
}

/** Category ID of a channel; for a thread, the category of its parent channel. */
export async function categoryOf(client: Client, channelId: string): Promise<string | null> {
  const channel = await fetchChannel(client, channelId);
  if (!channel || channel.isDMBased()) return null;
  if (channel.isThread()) {
    if (!channel.parentId) return null;
    const parent = await fetchChannel(client, channel.parentId);
    return parent && !parent.isDMBased() ? parent.parentId : null;
  }
  return channel.parentId;
}
