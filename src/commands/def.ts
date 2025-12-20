import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import { addOrUpdateRequest } from "../services/defense-requests";
import { updateGlobalMessage } from "../services/defense-message";
import { getVillageAt, ensureMapData } from "../services/map-data";
import { withRetry } from "../utils/retry";
import { recordAction } from "../services/action-history";

export const defCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("def")
    .setDescription("Create or update a defense request")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Coordinates (e.g., 123|456, 123 456, (123|456))")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("troops")
        .setDescription("Number of troops needed")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Additional information about the defense request")
        .setRequired(false) // optional
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const coordsInput = interaction.options.getString("coords", true);
    const troopsNeeded = interaction.options.getInteger("troops", true);
    const message = interaction.options.getString("message") || "";
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: "Ši komanda veikia tik serveryje.",
        ephemeral: true,
      });
      return;
    }

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({
        content:
          "Travian serveris nesukonfigūruotas. Adminas turi paleisti `/setserver`.",
        ephemeral: true,
      });
      return;
    }

    if (!config.defenseChannelId) {
      await interaction.reply({
        content:
          "Gynybos kanalas nesukonfigūruotas. Adminas turi paleisti `/setchannel type:Defense`.",
        ephemeral: true,
      });
      return;
    }

    const coords = parseCoords(coordsInput);
    if (!coords) {
      await interaction.reply({
        content:
          "Neteisingos koordinatės. Įvesk du skaičius (pvz., 123|456, 123 456).",
        ephemeral: true,
      });
      return;
    }

    // Defer reply as map data lookup may take time (with retry for transient errors)
    await withRetry(() => interaction.deferReply());

    // Ensure map data is available
    const dataReady = await ensureMapData(config.serverKey);
    if (!dataReady) {
      await interaction.editReply({
        content: "Nepavyko užkrauti žemėlapio duomenų. Bandyk vėliau.",
      });
      return;
    }

    // Validate village exists at coordinates
    const village = await getVillageAt(config.serverKey, coords.x, coords.y);
    if (!village) {
      await interaction.editReply({
        content: `Arba to kaimo nėra arba jis ką tik įkurtas (${coords.x}|${coords.y}).`,
      });
      return;
    }

    // Add or update the request
    const result = addOrUpdateRequest(
      guildId,
      coords.x,
      coords.y,
      troopsNeeded,
      message,
      interaction.user.id
    );

    if ("error" in result) {
      await interaction.editReply({ content: result.error });
      return;
    }

    // Record the action for undo support
    const actionId = recordAction(guildId, {
      type: result.isUpdate ? "DEF_UPDATE" : "DEF_ADD",
      userId: interaction.user.id,
      coords: { x: coords.x, y: coords.y },
      previousState: result.previousRequest,
      data: {
        troopsNeeded,
        message,
      },
    });

    // Update the global message
    await updateGlobalMessage(interaction.client, guildId);

    const actionText = result.isUpdate ? "atnaujino" : "sukūrė";
    const playerInfo = village.allianceName
      ? `${village.playerName} [${village.allianceName}]`
      : village.playerName;
    await interaction.editReply({
      content: `<@${interaction.user.id}> ${actionText} užklausą #${result.requestId}: **${village.villageName}** (${coords.x}|${coords.y}) - ${playerInfo} - reikia ${troopsNeeded} karių. (\`/undo ${actionId}\`)`,
    });
  },
};
