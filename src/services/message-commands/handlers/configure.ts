import { CommandContext } from "../types";
import { requireAdmin } from "../middleware";
import { normalizeServerKey, isValidServerKey } from "../utils";
import { getGuildConfig, setServerKey, setDefenseChannel, setScoutChannel, setScoutRole } from "../../../config/guild-config";
import { updateMapData } from "../../map-data";

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
  type: "defense" | "scout",
  channelId: string
): Promise<void> {
  if (type === "defense") {
    setDefenseChannel(ctx.guildId, channelId);
    await ctx.message.reply(`Gynybos prašymai bus siunčiami į <#${channelId}>`);
  } else {
    setScoutChannel(ctx.guildId, channelId);
    await ctx.message.reply(`Žvalgybos prašymai bus siunčiami į <#${channelId}>`);
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

// Wrap with admin checks
export const handleConfigureServerCommand = requireAdmin(handleConfigureServerCommandInner);
export const handleConfigureChannelCommand = requireAdmin(handleConfigureChannelCommandInner);
export const handleConfigureScoutRoleCommand = requireAdmin(handleConfigureScoutRoleCommandInner);
