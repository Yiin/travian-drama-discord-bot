import { Client } from "discord.js";
import {
  addConfed,
  Confed,
  ConfedSettings,
  getConfed,
  getGuildConfig,
  removeConfed,
  setConfedSetting,
  setServerKey,
  setServerTimezone,
} from "../config/guild-config";
import { categoryOf, Scope, sameScope, scopeOfChannel } from "../config/scope";
import { updateMapData } from "../services/map-data";
import { isValidTimezone } from "../utils/time";
import { normalizeServerKey, isValidServerKey } from "../utils/server-key";
import { ChannelKind, errors } from "./messages";

/**
 * Setup steps shared by `/setup …` and the setup panel.
 * Each returns the user-facing text so every surface says the same thing.
 */

export type SetupResult = { ok: true; text: string } | { ok: false; error: string };

export async function applyServerKey(guildId: string, rawKey: string): Promise<SetupResult> {
  const serverKey = normalizeServerKey(rawKey);
  if (!isValidServerKey(serverKey)) {
    return { ok: false, error: "⚠️ **That is not a Travian server key.** Use the form `ts31.x3.europe`." };
  }

  setServerKey(guildId, serverKey);
  try {
    await updateMapData(serverKey);
    return { ok: true, text: `✅ Travian server set to \`${serverKey}\`. Map data downloaded.` };
  } catch (error) {
    console.error("[Setup] Failed to download map data:", error);
    return {
      ok: true,
      text: `✅ Travian server set to \`${serverKey}\`. ⚠️ Map data could not be downloaded yet; the bot will retry.`,
    };
  }
}

export function applyTimezone(guildId: string, rawValue: string): SetupResult {
  const value = rawValue.trim();
  if (!value || value.toLowerCase() === "clear") {
    setServerTimezone(guildId, null);
    return { ok: true, text: "✅ Timezone cleared. Typed times are read as UTC." };
  }
  if (!isValidTimezone(value)) {
    return {
      ok: false,
      error: `⚠️ **Unknown timezone \`${value}\`.** Use an IANA name, for example \`Europe/Vilnius\`.`,
    };
  }
  setServerTimezone(guildId, value);
  return { ok: true, text: `✅ Timezone set to \`${value}\`. Typed times are read as local time there.` };
}

export const CHANNEL_KIND_LABEL: Record<ChannelKind, string> = {
  defense: "Stack requests",
  defcalls: "Defense calls",
  scout: "Scouting",
  push: "Resource pushes",
};

export const CHANNEL_FIELD: Record<ChannelKind, keyof ConfedSettings> = {
  defense: "defenseChannelId",
  defcalls: "defCallsChannelId",
  scout: "scoutChannelId",
  push: "pushChannelId",
};

/**
 * A confed's channels must sit in its category, and the main confed's channels
 * outside every confed category. Otherwise commands run there would land in
 * another confed.
 */
export async function applyChannel(client: Client, scope: Scope, kind: ChannelKind, channelId: string): Promise<SetupResult> {
  const channelScope = await scopeOfChannel(client, scope.guildId, channelId);
  if (!sameScope(channelScope, scope)) {
    const target = getConfed(scope);
    const owner = getConfed(channelScope);
    if (target) return { ok: false, error: errors.channelOutsideConfed(channelId, target.name, target.categoryId) };
    if (owner) return { ok: false, error: errors.channelInOtherConfed(channelId, owner.name) };
  }
  setConfedSetting(scope, CHANNEL_FIELD[kind], channelId);
  return { ok: true, text: `✅ ${CHANNEL_KIND_LABEL[kind]}${forConfed(scope)} now go to <#${channelId}>.` };
}

export function applyScoutRole(scope: Scope, roleId: string | null): SetupResult {
  setConfedSetting(scope, "scoutRoleId", roleId);
  return {
    ok: true,
    text: roleId ? `✅ Scout requests${forConfed(scope)} now mention <@&${roleId}>.` : `✅ Scout role${forConfed(scope)} cleared.`,
  };
}

/** ` for **BBCTM**` for a confed, empty for the main confed. */
function forConfed(scope: Scope): string {
  const confed = getConfed(scope);
  return confed ? ` for **${confed.name}**` : "";
}

/** Display name of a scope: the confed name, or "main" for the main confed. */
export function scopeName(scope: Scope): string {
  return getConfed(scope)?.name ?? "main";
}

export type AddConfedResult = { ok: true; confed: Confed; text: string } | { ok: false; error: string };

export async function applyAddConfed(client: Client, guildId: string, rawName: string, categoryId: string): Promise<AddConfedResult> {
  const name = rawName.trim();
  const config = getGuildConfig(guildId);
  const confeds = config.confeds ?? [];
  const sameCategory = confeds.find((c) => c.categoryId === categoryId);
  if (sameCategory) return { ok: false, error: errors.categoryTaken(sameCategory.name) };
  if (confeds.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: errors.confedNameTaken(name) };
  }

  // The main confed's channels may not move into the new confed by accident
  const mainChannels = Object.values(CHANNEL_FIELD)
    .map((field) => config[field])
    .filter((id): id is string => !!id);
  const inCategory: string[] = [];
  for (const channelId of mainChannels) {
    if ((await categoryOf(client, channelId)) === categoryId) inCategory.push(channelId);
  }
  if (inCategory.length > 0) return { ok: false, error: errors.categoryHoldsMainChannels(inCategory) };

  const confed = addConfed(guildId, name, categoryId);
  return {
    ok: true,
    confed,
    text: `✅ Confed **${name}** added. Commands in <#${categoryId}> now use its own channels. Pick them below.`,
  };
}

export function applyRemoveConfed(guildId: string, confedId: string): SetupResult {
  const confed = getConfed({ guildId, confedId });
  if (!confed) return { ok: false, error: errors.confedNotFound() };
  removeConfed(guildId, confedId);
  return {
    ok: true,
    text: `✅ Confed **${confed.name}** removed. Commands in <#${confed.categoryId}> now use the main confed. Its requests stay saved. Delete its old panels so nobody presses their buttons.`,
  };
}
