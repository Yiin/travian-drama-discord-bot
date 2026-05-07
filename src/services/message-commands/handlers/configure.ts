import { CommandContext } from "../types";
import { requireAdminMiddleware } from "../middleware";
import { normalizeServerKey, isValidServerKey } from "../utils";
import { getGuildConfig, setServerKey, setDefenseChannel, setScoutChannel, setScoutRole, setDefCallsChannelId, setDefCallsCategoryId, setPushCategory, setServerTimezone } from "../../../config/guild-config";
import { updateMapData } from "../../map-data";
import { isValidTimezone } from "../../../utils/time";

async function handleConfigureServerCommandInner(
  ctx: CommandContext,
  serverInput: string
): Promise<void> {
  const serverKey = normalizeServerKey(serverInput);

  if (!isValidServerKey(serverKey)) {
    await ctx.message.reply("Neteisingas serveris. Naudok formatą: ts31.x3.europe");
    return;
  }

  try {
    // Save the server key (short form)
    setServerKey(ctx.guildId, serverKey);

    // Download map data
    await updateMapData(serverKey);

    await ctx.message.reply(`Travian serveris nustatytas: \`${serverKey}\`\nŽemėlapio duomenys atsisiųsti sėkmingai!`);
    await ctx.message.react("✅");
  } catch (error) {
    console.error("[Configure] Failed to download map data:", error);
    await ctx.message.reply(`Serveris išsaugotas kaip \`${serverKey}\`, bet nepavyko atsisiųsti žemėlapio duomenų. Botas bandys vėliau.`);
  }
}

async function handleConfigureChannelCommandInner(
  ctx: CommandContext,
  type: "defense" | "scout" | "defcalls",
  channelId: string
): Promise<void> {
  if (type === "defense") {
    setDefenseChannel(ctx.guildId, channelId);
    await ctx.message.reply(`Gynybos prašymai bus siunčiami į <#${channelId}>`);
  } else if (type === "scout") {
    setScoutChannel(ctx.guildId, channelId);
    await ctx.message.reply(`Žvalgybos prašymai bus siunčiami į <#${channelId}>`);
  } else {
    setDefCallsChannelId(ctx.guildId, channelId);
    await ctx.message.reply(`Def-call hub kanalas: <#${channelId}>`);
  }

  await ctx.message.react("✅");
}

async function handleConfigureDefCallsCategoryCommandInner(
  ctx: CommandContext,
  categoryId: string
): Promise<void> {
  setDefCallsCategoryId(ctx.guildId, categoryId);
  await ctx.message.reply(`Def-call kategorija nustatyta: <#${categoryId}>`);
  await ctx.message.react("✅");
}

async function handleConfigurePushCategoryCommandInner(
  ctx: CommandContext,
  categoryId: string
): Promise<void> {
  setPushCategory(ctx.guildId, categoryId);
  await ctx.message.reply(`Push kategorija nustatyta: <#${categoryId}>`);
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
      await ctx.message.reply("Žvalgybos rolės paminėjimas pašalintas.");
    } else {
      await ctx.message.reply("Žvalgybos rolė nėra sukonfigūruota.");
    }
  } else if (roleId) {
    setScoutRole(ctx.guildId, roleId);
    await ctx.message.reply(`Žvalgybos prašymai dabar paminės <@&${roleId}>`);
  } else {
    const config = getGuildConfig(ctx.guildId);
    if (config.scoutRoleId) {
      setScoutRole(ctx.guildId, null);
      await ctx.message.reply("Žvalgybos rolės paminėjimas pašalintas.");
    } else {
      await ctx.message.reply("Žvalgybos rolė nėra sukonfigūruota.");
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
    await ctx.message.reply("Serverio laiko juosta išvalyta. Įvedami laikai bus traktuojami kaip UTC.");
    await ctx.message.react("✅");
    return;
  }

  if (!isValidTimezone(trimmed)) {
    await ctx.message.reply(`Neatpažinta laiko juosta: \`${value}\`. Naudok IANA pavadinimą, pvz. \`Europe/Vilnius\`.`);
    return;
  }

  setServerTimezone(ctx.guildId, trimmed);
  await ctx.message.reply(`Serverio laiko juosta nustatyta: \`${trimmed}\`. Įvedami laikai bus traktuojami šios juostos vietine reikšme.`);
  await ctx.message.react("✅");
}

// Wrap with admin checks
export const handleConfigureServerCommand = requireAdminMiddleware(handleConfigureServerCommandInner);
export const handleConfigureChannelCommand = requireAdminMiddleware(handleConfigureChannelCommandInner);
export const handleConfigureScoutRoleCommand = requireAdminMiddleware(handleConfigureScoutRoleCommandInner);
export const handleConfigureDefCallsCategoryCommand = requireAdminMiddleware(handleConfigureDefCallsCategoryCommandInner);
export const handleConfigurePushCategoryCommand = requireAdminMiddleware(handleConfigurePushCategoryCommandInner);
export const handleConfigureTimezoneCommand = requireAdminMiddleware(handleConfigureTimezoneCommandInner);
