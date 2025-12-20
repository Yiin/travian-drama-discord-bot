import {
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  LabelBuilder,
} from "discord.js";
import { getGuildConfig } from "../config/guild-config";
import {
  getGuildDefenseData,
  reportTroopsSent,
  getRequestById,
  addOrUpdateRequest,
  DefenseRequest,
} from "./defense-requests";
import { parseCoords } from "../utils/parse-coords"; // Still used in handleRequestDefModal
import { updateGlobalMessage, LastActionInfo } from "./defense-message";
import { getVillageAt, ensureMapData } from "./map-data";
import { recordAction } from "./action-history";

// Sent troops button/modal IDs
export const SENT_BUTTON_ID = "sent_troops_button";
export const SENT_MODAL_ID = "sent_troops_modal";
export const TARGET_SELECT_ID = "target_select";
export const TROOPS_INPUT_ID = "troops_input";

// Request def button/modal IDs
export const REQUEST_DEF_BUTTON_ID = "request_def_button";
export const REQUEST_DEF_MODAL_ID = "request_def_modal";
export const COORDS_INPUT_ID = "coords_input";
export const TROOPS_NEEDED_INPUT_ID = "troops_needed_input";
export const MESSAGE_INPUT_ID = "message_input";

// Scout going button ID
export const SCOUT_GOING_BUTTON_ID = "scout_going_button";

export async function handleSentButton(
  interaction: ButtonInteraction
): Promise<void> {
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
      content: "Travian serveris nesukonfigūruotas.",
      ephemeral: true,
    });
    return;
  }

  const data = getGuildDefenseData(guildId);
  if (data.requests.length === 0) {
    await interaction.reply({
      content: "Nėra aktyvių gynybos užklausų.",
      ephemeral: true,
    });
    return;
  }

  // Build options from active requests
  const options: StringSelectMenuOptionBuilder[] = [];
  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    const village = await getVillageAt(config.serverKey, request.x, request.y);
    const villageName = village?.villageName || "Nežinomas";
    const playerName = village?.playerName || "Nežinomas";

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`(${request.x}|${request.y}) ${villageName}`)
        .setDescription(`${playerName} - ${request.troopsSent}/${request.troopsNeeded}`)
        .setValue(`${i + 1}`) // 1-based request ID
    );
  }

  // Build modal with target dropdown and troop input
  const modal = new ModalBuilder()
    .setCustomId(SENT_MODAL_ID)
    .setTitle("Išsiunčiau karius");

  const targetSelect = new StringSelectMenuBuilder()
    .setCustomId(TARGET_SELECT_ID)
    .setPlaceholder("Pasirink tikslą...")
    .setRequired(true)
    .addOptions(options);

  const targetLabel = new LabelBuilder()
    .setLabel("Tikslas")
    .setStringSelectMenuComponent(targetSelect);

  const troopsInput = new TextInputBuilder()
    .setCustomId(TROOPS_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("500")
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("Kiek karių išsiunčiau?")
    .setDescription("Karių skaičius")
    .setTextInputComponent(troopsInput);

  modal.addLabelComponents(targetLabel, troopsLabel);

  await interaction.showModal(modal);
}

export async function handleSentModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
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
      content: "Travian serveris nesukonfigūruotas.",
      ephemeral: true,
    });
    return;
  }

  // Extract target from select menu and troops from text input
  const selectedValues = interaction.fields.getStringSelectValues(TARGET_SELECT_ID);
  if (!selectedValues || selectedValues.length === 0) {
    await interaction.reply({
      content: "Klaida: nepavyko nustatyti tikslo.",
      ephemeral: true,
    });
    return;
  }

  const requestId = parseInt(selectedValues[0], 10);
  if (isNaN(requestId) || requestId < 1) {
    await interaction.reply({
      content: "Klaida: neteisingas tikslo ID.",
      ephemeral: true,
    });
    return;
  }

  const troopsInput = interaction.fields.getTextInputValue(TROOPS_INPUT_ID);

  // Parse troops
  const troops = parseInt(troopsInput, 10);
  if (isNaN(troops) || troops < 1) {
    await interaction.reply({
      content: "Neteisingas karių skaičius. Įvesk teigiamą skaičių.",
      ephemeral: true,
    });
    return;
  }

  // Defer reply
  await interaction.deferReply();

  // Snapshot the request before modification for undo support
  const requestBefore = getRequestById(guildId, requestId);
  if (!requestBefore) {
    await interaction.editReply({ content: `Užklausa #${requestId} nerasta.` });
    return;
  }
  const snapshot: DefenseRequest = {
    ...requestBefore,
    contributors: requestBefore.contributors.map((c) => ({ ...c })),
  };

  // Report the troops sent
  const result = reportTroopsSent(
    guildId,
    requestId,
    interaction.user.id,
    troops
  );

  if ("error" in result) {
    await interaction.editReply({ content: result.error });
    return;
  }

  // Record the action for undo support
  const actionId = recordAction(guildId, {
    type: "TROOPS_SENT",
    userId: interaction.user.id,
    coords: { x: snapshot.x, y: snapshot.y },
    previousState: snapshot,
    data: {
      troops,
      contributorId: interaction.user.id,
      didComplete: result.isComplete,
    },
  });

  // Get village info for the action message
  const village = await getVillageAt(
    config.serverKey,
    result.request.x,
    result.request.y
  );
  const villageName = village?.villageName || "Nežinomas";

  // Build last action info for global message
  let actionText: string;
  if (result.isComplete) {
    actionText = `<@${interaction.user.id}> užbaigė **${villageName}** - **${result.request.troopsSent}/${result.request.troopsNeeded}**`;
  } else {
    actionText = `<@${interaction.user.id}> išsiuntė **${troops}** į **${villageName}** - **${result.request.troopsSent}/${result.request.troopsNeeded}**`;
  }

  const lastAction: LastActionInfo = {
    text: actionText,
    undoId: actionId,
  };

  // Update the global message with last action info
  await updateGlobalMessage(interaction.client, guildId, lastAction);

  // Delete the deferred reply since info is in global message
  await interaction.deleteReply();
}

export async function handleRequestDefButton(
  interaction: ButtonInteraction
): Promise<void> {
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
      content: "Travian serveris nesukonfigūruotas.",
      ephemeral: true,
    });
    return;
  }

  // Build modal with text inputs
  const modal = new ModalBuilder()
    .setCustomId(REQUEST_DEF_MODAL_ID)
    .setTitle("Naujas gynybos prašymas");

  const coordsInput = new TextInputBuilder()
    .setCustomId(COORDS_INPUT_ID)
    .setLabel("Koordinatės")
    .setPlaceholder("123|456")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  const troopsInput = new TextInputBuilder()
    .setCustomId(TROOPS_NEEDED_INPUT_ID)
    .setLabel("Kiek karių reikia?")
    .setPlaceholder("1000")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const messageInput = new TextInputBuilder()
    .setCustomId(MESSAGE_INPUT_ID)
    .setLabel("Papildoma informacija (nebūtina)")
    .setPlaceholder("Pvz.: Smūgis 12:34")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const coordsRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    coordsInput
  );
  const troopsRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    troopsInput
  );
  const messageRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    messageInput
  );

  modal.addComponents(coordsRow, troopsRow, messageRow);

  await interaction.showModal(modal);
}

export async function handleRequestDefModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
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
      content: "Travian serveris nesukonfigūruotas.",
      ephemeral: true,
    });
    return;
  }

  if (!config.defenseChannelId) {
    await interaction.reply({
      content: "Gynybos kanalas nesukonfigūruotas.",
      ephemeral: true,
    });
    return;
  }

  const coordsInput = interaction.fields.getTextInputValue(COORDS_INPUT_ID);
  const troopsInput = interaction.fields.getTextInputValue(TROOPS_NEEDED_INPUT_ID);
  const message = interaction.fields.getTextInputValue(MESSAGE_INPUT_ID) || "";

  // Parse coordinates
  const coords = parseCoords(coordsInput);
  if (!coords) {
    await interaction.reply({
      content: "Neteisingos koordinatės. Įvesk du skaičius (pvz., 123|456).",
      ephemeral: true,
    });
    return;
  }

  // Parse troops
  const troopsNeeded = parseInt(troopsInput, 10);
  if (isNaN(troopsNeeded) || troopsNeeded < 1) {
    await interaction.reply({
      content: "Neteisingas karių skaičius. Įvesk teigiamą skaičių.",
      ephemeral: true,
    });
    return;
  }

  // Defer reply
  await interaction.deferReply();

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
}

export async function handleScoutGoingButton(
  interaction: ButtonInteraction
): Promise<void> {
  const message = interaction.message;

  // Get existing components - the container should be the first component
  const existingComponents = message.components;
  if (existingComponents.length < 2) {
    await interaction.reply({
      content: "Nepavyko atnaujinti žinutės.",
      ephemeral: true,
    });
    return;
  }

  // Extract existing text from the container
  // The container is the first component, button row is the second
  const containerData = existingComponents[0];

  // Check if container has components property (it's a Container component)
  if (!("components" in containerData) || !Array.isArray(containerData.components)) {
    await interaction.reply({
      content: "Nepavyko atnaujinti žinutės.",
      ephemeral: true,
    });
    return;
  }

  const containerComponents = containerData.components;
  const userMention = `<@${interaction.user.id}>`;

  // Parse the existing content to find the structure
  let mainText = "";
  let messageText = "";
  let footerText = "";
  let goingUsers: string[] = [];

  for (const comp of containerComponents) {
    if ("content" in comp && typeof comp.content === "string") {
      const content = comp.content;
      if (content.startsWith("##")) {
        // Main heading
        mainText = content;
      } else if (content.startsWith(">>>")) {
        // Quote block - message
        messageText = content;
      } else if (content.startsWith("-#")) {
        // Small text - footer
        footerText = content;
      } else if (content.startsWith("**Eina:**")) {
        // Extract existing users
        const usersMatch = content.match(/\*\*Eina:\*\* (.+)/);
        if (usersMatch) {
          goingUsers = usersMatch[1].split(", ").filter((u: string) => u.trim());
        }
      }
    }
  }

  // Toggle: if user is already in list, remove them; otherwise add them
  const userIndex = goingUsers.indexOf(userMention);
  if (userIndex !== -1) {
    goingUsers.splice(userIndex, 1);
  } else {
    goingUsers.push(userMention);
  }

  // Rebuild the container
  const container = new ContainerBuilder().setAccentColor(0x3498db);

  if (mainText) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(mainText)
    );
  }
  if (messageText) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(messageText)
    );
  }

  // Add "Eina:" section only if there are users
  if (goingUsers.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Eina:** ${goingUsers.join(", ")}`)
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
  );

  if (footerText) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(footerText)
    );
  }

  // Keep the button
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SCOUT_GOING_BUTTON_ID)
      .setLabel("Eina")
      .setStyle(ButtonStyle.Primary)
  );

  await interaction.update({
    components: [container, buttonRow],
    flags: MessageFlags.IsComponentsV2,
  });
}
