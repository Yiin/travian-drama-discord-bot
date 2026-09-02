import { CommandContext } from "../types";
import { requireAdminMiddleware } from "../middleware";
import { normalizeServerKey, isValidServerKey, replyError } from "../utils";
import { getGuildConfig, setServerKey, setDefenseChannel, setScoutChannel, setScoutRole, setDefCallsChannelId, setPushChannelId, setServerTimezone } from "../../../config/guild-config";
import { updateMapData } from "../../map-data";
import { buildSetupSummary } from "../../../commands/setup";
import { isValidTimezone } from "../../../utils/time";

async function handleSetupServerCommandInner(
  ctx: CommandContext,
  serverInput: string
): Promise<void> {
  const serverKey = normalizeServerKey(serverInput);

  if (!isValidServerKey(serverKey)) {
    await replyError(ctx, "⚠️ **That is not a Travian server key.** Use the form `ts31.x3.europe`.");
    return;
  }

  try {
    // Save the server key (short form)
    setServerKey(ctx.guildId, serverKey);

    // Download map data
    await updateMapData(serverKey);

    await ctx.message.reply(`✅ Travian server set to \`${serverKey}\`. Map data downloaded.`);
    await ctx.message.react("✅");
  } catch (error) {
    console.error("[Setup] Failed to download map data:", error);
    await ctx.message.reply(`✅ Travian server set to \`${serverKey}\`. ⚠️ Map data could not be downloaded yet; the bot will retry.`);
  }
}

async function handleSetupChannelCommandInner(
  ctx: CommandContext,
  type: "defense" | "scout" | "defcalls" | "push",
  channelId: string
): Promise<void> {
  if (type === "defense") {
    setDefenseChannel(ctx.guildId, channelId);
    await ctx.message.reply(`✅ Stack requests now go to <#${channelId}>.`);
  } else if (type === "scout") {
    setScoutChannel(ctx.guildId, channelId);
    await ctx.message.reply(`✅ Scouting now goes to <#${channelId}>.`);
  } else if (type === "defcalls") {
    setDefCallsChannelId(ctx.guildId, channelId);
    await ctx.message.reply(`✅ Defense calls now go to <#${channelId}>.`);
  } else {
    setPushChannelId(ctx.guildId, channelId);
    await ctx.message.reply(`✅ Resource pushes now go to <#${channelId}>.`);
  }

  await ctx.message.react("✅");
}

async function handleSetupScoutRoleCommandInner(
  ctx: CommandContext,
  roleId?: string,
  clearKeyword?: string
): Promise<void> {
  if (clearKeyword === "clear") {
    const config = getGuildConfig(ctx.guildId);
    if (config.scoutRoleId) {
      setScoutRole(ctx.guildId, null);
      await ctx.message.reply("✅ Scout role cleared.");
    } else {
      await ctx.message.reply("⚠️ **No scout role is set.**");
    }
  } else if (roleId) {
    setScoutRole(ctx.guildId, roleId);
    await ctx.message.reply(`✅ Scout requests now mention <@&${roleId}>.`);
  } else {
    const config = getGuildConfig(ctx.guildId);
    if (config.scoutRoleId) {
      setScoutRole(ctx.guildId, null);
      await ctx.message.reply("✅ Scout role cleared.");
    } else {
      await ctx.message.reply("⚠️ **No scout role is set.**");
    }
  }

  await ctx.message.react("✅");
}

async function handleSetupTimezoneCommandInner(
  ctx: CommandContext,
  value: string
): Promise<void> {
  const trimmed = value.trim();

  if (trimmed.toLowerCase() === "clear") {
    setServerTimezone(ctx.guildId, null);
    await ctx.message.reply("✅ Timezone cleared. Typed times are read as UTC.");
    await ctx.message.react("✅");
    return;
  }

  if (!isValidTimezone(trimmed)) {
    await replyError(ctx, `⚠️ **Unrecognized timezone \`${value}\`.** Use an IANA name, for example \`Europe/Vilnius\`.`);
    return;
  }

  setServerTimezone(ctx.guildId, trimmed);
  await ctx.message.reply(`✅ Timezone set to \`${trimmed}\`. Typed times are read as local time there.`);
  await ctx.message.react("✅");
}

async function handleSetupShowCommandInner(ctx: CommandContext): Promise<void> {
  await ctx.message.reply({ content: buildSetupSummary(getGuildConfig(ctx.guildId)), allowedMentions: { parse: [] } });
}

// Wrap with admin checks
export const handleSetupServerCommand = requireAdminMiddleware(handleSetupServerCommandInner);
export const handleSetupChannelCommand = requireAdminMiddleware(handleSetupChannelCommandInner);
export const handleSetupScoutRoleCommand = requireAdminMiddleware(handleSetupScoutRoleCommandInner);
export const handleSetupTimezoneCommand = requireAdminMiddleware(handleSetupTimezoneCommandInner);
export const handleSetupShowCommand = requireAdminMiddleware(handleSetupShowCommandInner);
