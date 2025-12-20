import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} from "discord.js";
import { Command } from "../types";
import { parseCoords } from "../utils/parse-coords";
import { getGuildConfig } from "../config/guild-config";
import {
  getVillageAt,
  getRallyPointLink,
  ensureMapData,
  getMapLink,
} from "../services/map-data";
import { withRetry } from "../utils/retry";
import { SCOUT_GOING_BUTTON_ID } from "../services/button-handlers";

export const scoutCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("scout")
    .setDescription("Send a scouting request")
    .addStringOption((option) =>
      option
        .setName("coords")
        .setDescription("Coordinates (e.g., 123|456, 123 456, (123|456))")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Additional information about the scouting request")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const coordsInput = interaction.options.getString("coords", true);
    const message = interaction.options.getString("message", true);
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

    if (!config.scoutChannelId) {
      await interaction.reply({
        content:
          "Žvalgybos kanalas nesukonfigūruotas. Adminas turi paleisti `/setchannel type:Scout`.",
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

    // Defer reply as map data lookup may take time
    await withRetry(() => interaction.deferReply({ ephemeral: true }));

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
        content: `Kaimas koordinatėse (${coords.x}|${coords.y}) nerastas. Patikrink koordinates ir bandyk dar kartą.`,
      });
      return;
    }

    const channel = (await interaction.client.channels.fetch(
      config.scoutChannelId
    )) as TextChannel | null;

    if (!channel) {
      await interaction.editReply({
        content: "Sukonfigūruotas žvalgybos kanalas nerastas.",
      });
      return;
    }

    const rallyLink = getRallyPointLink(config.serverKey, village.targetMapId, 3);
    const mapLink = getMapLink(config.serverKey, village);

    // Build Components v2 message with larger text
    const container = new ContainerBuilder().setAccentColor(0x3498db); // Blue accent

    // Main info with heading for larger text
    const mainText = new TextDisplayBuilder().setContent(
      `## [(${coords.x}|${coords.y})](${mapLink}) ${village.villageName}\n` +
      `**${village.playerName}** · ${village.population} pop · [**SIŲSTI**](${rallyLink})`
    );

    const messageText = new TextDisplayBuilder().setContent(`>>> ${message}`);

    const separator = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);

    const footerText = new TextDisplayBuilder().setContent(
      `-# Paprašė ${interaction.user.displayName}`
    );

    container.addTextDisplayComponents(mainText, messageText);
    container.addSeparatorComponents(separator);
    container.addTextDisplayComponents(footerText);

    // Add "eina" button
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(SCOUT_GOING_BUTTON_ID)
        .setLabel("Eina")
        .setStyle(ButtonStyle.Primary)
    );

    await channel.send({
      components: [container, buttonRow],
      flags: MessageFlags.IsComponentsV2,
    });

    // Delete the deferred reply since the scout request is posted to the channel
    await interaction.deleteReply();
  },
};
