import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import { withRetry } from "../utils/retry";
import { executeScoutAction, sendScoutMessage } from "../actions";
import { errors, confirmationEdit, messageUrl } from "../actions/messages";
import { guildCommand, requireGuild } from "./shared";
import { getOpenScoutRequests, getScoutRequest, formatScoutId } from "../services/scout-requests";
import { getVillageAt } from "../services/map-data";
import { completeScout } from "../services/button-handlers/scout";
import { isValidReportLink, normalizeReportLink } from "../utils/report-link";

export const scoutCommand: Command = {
  topic: "scouting",
  summary: "Ask the scouts to check a village, then post the report link",
  data: guildCommand("scout", "Scouting requests")
    .addSubcommand((sub) =>
      sub
        .setName("request")
        .setDescription("Ask the scouts to check a village")
        .addStringOption((opt) =>
          opt.setName("coords").setDescription("Village coordinates, for example 123|456").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("What to look for, for example: WWK or fake?").setRequired(true).setMaxLength(200)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("result")
        .setDescription("Post the in-game report link for an open scout request")
        .addStringOption((opt) =>
          opt.setName("target").setDescription("Which scout request").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt.setName("link").setDescription("The in-game report URL").setRequired(true).setMaxLength(500)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    const config = getGuildConfig(guildId);
    if (!config.serverKey) {
      await interaction.reply({ content: errors.notSetUp(), flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.options.getSubcommand() === "result") {
      await handleResult(interaction, guildId, config.serverKey);
      return;
    }

    if (!config.scoutChannelId) {
      await interaction.reply({ content: errors.channelMissing("scout"), flags: MessageFlags.Ephemeral });
      return;
    }

    const coordsInput = interaction.options.getString("coords", true);
    const note = interaction.options.getString("note", true);

    await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));

    const result = await executeScoutAction(
      { guildId, config, client: interaction.client, userId: interaction.user.id },
      { coords: coordsInput, message: note, requesterId: interaction.user.id, scoutRoleId: config.scoutRoleId }
    );

    if (!result.success) {
      await interaction.editReply({ content: result.error });
      return;
    }

    const request = await sendScoutMessage(interaction.client, guildId, config.scoutChannelId, {
      ...result,
      message: note,
      requesterId: interaction.user.id,
      scoutRoleId: config.scoutRoleId,
    });

    if (!request) {
      await interaction.editReply({ content: errors.channelGone("scout") });
      return;
    }

    await interaction.editReply(
      confirmationEdit(`✅ Scout request #${formatScoutId(request.id)} posted for ${result.villageDisplay}.`, {
        panelUrl: request.messageId ? messageUrl(guildId, config.scoutChannelId, request.messageId) : undefined,
        panelLabel: "Open card",
      })
    );
  },

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }
    const config = getGuildConfig(guildId);
    const typed = interaction.options.getFocused().toLowerCase();
    const open = getOpenScoutRequests(guildId).slice(-25).reverse();
    const choices = [];
    for (const request of open) {
      const village = config.serverKey ? await getVillageAt(config.serverKey, request.x, request.y) : null;
      const name = `#${formatScoutId(request.id)} · ${village?.villageName ?? "Unknown"} (${request.x}|${request.y}) · ${request.note}`.slice(0, 100);
      if (!typed || name.toLowerCase().includes(typed)) {
        choices.push({ name, value: String(request.id) });
      }
    }
    await interaction.respond(choices.slice(0, 25));
  },
};

async function handleResult(interaction: ChatInputCommandInteraction, guildId: string, serverKey: string): Promise<void> {
  const id = parseInt(interaction.options.getString("target", true).replace(/^#?S/i, ""), 10);
  const request = Number.isFinite(id) ? getScoutRequest(guildId, id) : undefined;
  if (!request) {
    await interaction.reply({ content: errors.notFound("scout request"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (request.status === "done") {
    await interaction.reply({ content: "⚠️ **This scout request is already done.**", flags: MessageFlags.Ephemeral });
    return;
  }
  const link = interaction.options.getString("link", true);
  if (!isValidReportLink(link, serverKey)) {
    await interaction.reply({
      content: "⚠️ **That is not a Travian report link.** Open the report in game, copy the address bar, and paste it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
  const done = await completeScout(interaction.client, guildId, request, normalizeReportLink(link));
  await interaction.editReply({
    content: done ? `✅ Result saved for #${formatScoutId(request.id)}. The card now links to the report.` : errors.generic(),
  });
}
