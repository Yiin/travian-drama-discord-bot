import { CommandContext } from "../types";
import { requireAdminMiddleware } from "../middleware";
import { normalizeServerKey, isValidServerKey } from "../utils";
import { getGuildConfig, setServerKey, setDefenseChannel, setScoutChannel, setScoutRole, setDefCallsChannelId, setPushChannelId, setServerTimezone } from "../../../config/guild-config";
import { updateMapData } from "../../map-data";
import { isValidTimezone } from "../../../utils/time";

async function handleConfigureServerCommandInner(
  ctx: CommandContext,
  serverInput: string
): Promise<void> {
  const serverKey = normalizeServerKey(serverInput);

  if (!isValidServerKey(serverKey)) {
    await ctx.message.reply("Invalid server. Use this format: ts31.x3.europe");
    return;
  }

  try {
    // Save the server key (short form)
    setServerKey(ctx.guildId, serverKey);

    // Download map data
    await updateMapData(serverKey);

    await ctx.message.reply(`Travian server set: \`${serverKey}\`\nMap data downloaded successfully!`);
    await ctx.message.react("✅");
  } catch (error) {
    console.error("[Configure] Failed to download map data:", error);
    await ctx.message.reply(`Server saved as \`${serverKey}\`, but map data could not be downloaded. The bot will retry later.`);
  }
}

async function handleConfigureChannelCommandInner(
  ctx: CommandContext,
  type: "defense" | "scout" | "defcalls" | "push",
  channelId: string
): Promise<void> {
  if (type === "defense") {
    setDefenseChannel(ctx.guildId, channelId);
    await ctx.message.reply(`Defense requests will be sent to <#${channelId}>`);
  } else if (type === "scout") {
    setScoutChannel(ctx.guildId, channelId);
    await ctx.message.reply(`Scout requests will be sent to <#${channelId}>`);
  } else if (type === "defcalls") {
    setDefCallsChannelId(ctx.guildId, channelId);
    await ctx.message.reply(`Def-call hub channel: <#${channelId}>`);
  } else {
    setPushChannelId(ctx.guildId, channelId);
    await ctx.message.reply(`Push request threads will be created in <#${channelId}>`);
  }

  await ctx.message.react("✅");
}

async function handleConfigureScoutRoleCommandInner(
  ctx: CommandContext,
  roleId?: string,
  clearKeyword?: string
): Promise<void> {
  if (clearKeyword === "clear") {
    const config = getGuildConfig(ctx.guildId);
    if (config.scoutRoleId) {
      setScoutRole(ctx.guildId, null);
      await ctx.message.reply("Scout role mention has been cleared.");
    } else {
      await ctx.message.reply("Scout role is not configured.");
    }
  } else if (roleId) {
    setScoutRole(ctx.guildId, roleId);
    await ctx.message.reply(`Scout requests will now mention <@&${roleId}>`);
  } else {
    const config = getGuildConfig(ctx.guildId);
    if (config.scoutRoleId) {
      setScoutRole(ctx.guildId, null);
      await ctx.message.reply("Scout role mention has been cleared.");
    } else {
      await ctx.message.reply("Scout role is not configured.");
    }
  }

  await ctx.message.react("✅");
}

async function handleConfigureTimezoneCommandInner(
  ctx: CommandContext,
  value: string
): Promise<void> {
  const trimmed = value.trim();

  if (trimmed.toLowerCase() === "clear") {
    setServerTimezone(ctx.guildId, null);
    await ctx.message.reply("Server timezone cleared. Entered times will be treated as UTC.");
    await ctx.message.react("✅");
    return;
  }

  if (!isValidTimezone(trimmed)) {
    await ctx.message.reply(`Unrecognized timezone: \`${value}\`. Use an IANA name, for example \`Europe/Vilnius\`.`);
    return;
  }

  setServerTimezone(ctx.guildId, trimmed);
  await ctx.message.reply(`Server timezone set: \`${trimmed}\`. Entered times will be treated as local time in this timezone.`);
  await ctx.message.react("✅");
}

// Wrap with admin checks
export const handleConfigureServerCommand = requireAdminMiddleware(handleConfigureServerCommandInner);
export const handleConfigureChannelCommand = requireAdminMiddleware(handleConfigureChannelCommandInner);
export const handleConfigureScoutRoleCommand = requireAdminMiddleware(handleConfigureScoutRoleCommandInner);
export const handleConfigureTimezoneCommand = requireAdminMiddleware(handleConfigureTimezoneCommandInner);
