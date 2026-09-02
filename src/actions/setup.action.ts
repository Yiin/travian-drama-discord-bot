import {
  setServerKey,
  setServerTimezone,
  setDefenseChannel,
  setScoutChannel,
  setPushChannelId,
  setDefCallsChannelId,
} from "../config/guild-config";
import { updateMapData } from "../services/map-data";
import { isValidTimezone } from "../utils/time";
import { normalizeServerKey, isValidServerKey } from "../services/message-commands/utils";
import { ChannelKind } from "./messages";

/**
 * Setup steps shared by `/setup …`, `!setup …` and the setup panel.
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

const CHANNEL_SETTERS: Record<ChannelKind, (guildId: string, channelId: string) => void> = {
  defense: setDefenseChannel,
  scout: setScoutChannel,
  defcalls: setDefCallsChannelId,
  push: setPushChannelId,
};

export function applyChannel(guildId: string, kind: ChannelKind, channelId: string): SetupResult {
  CHANNEL_SETTERS[kind](guildId, channelId);
  return { ok: true, text: `✅ ${CHANNEL_KIND_LABEL[kind]} now go to <#${channelId}>.` };
}
