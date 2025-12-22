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
import { getGuildDefenseData } from "./defense-requests";
import { getVillageAt } from "./map-data";
import {
  validateDefenseConfig,
  executeSentAction,
  executeDefAction,
} from "../actions";

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
    const prefix = i === 0 ? "➡️ " : "";
    const request = data.requests[i];
    const village = await getVillageAt(config.serverKey, request.x, request.y);
    const villageName = village?.villageName || "Nežinomas";
    const playerName = village?.playerName || "Nežinomas";

    options.push(
      new StringSelectMenuOptionBuilder()
        .setDefault(i === 0)
        .setLabel(`${prefix}(${request.x}|${request.y}) ${villageName} (${playerName})`)
        .setDescription(`${request.troopsSent}/${request.troopsNeeded}`)
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
  // 1. Validate configuration
  const validation = validateDefenseConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Extract target from select menu
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

  // 3. Extract troops from text input
  const troopsInput = interaction.fields.getTextInputValue(TROOPS_INPUT_ID);
  const troops = parseInt(troopsInput, 10);
  if (isNaN(troops) || troops < 1) {
    await interaction.reply({
      content: "Neteisingas karių skaičius. Įvesk teigiamą skaičių.",
      ephemeral: true,
    });
    return;
  }

  // 4. Defer reply
  await interaction.deferReply();

  // 5. Execute action
  const result = await executeSentAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      target: requestId.toString(),
      troops,
      creditUserId: interaction.user.id,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  // Success: delete reply (info is in global message)
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

  // Build modal with text inputs using LabelBuilder
  const modal = new ModalBuilder()
    .setCustomId(REQUEST_DEF_MODAL_ID)
    .setTitle("Naujas gynybos prašymas");

  const coordsInput = new TextInputBuilder()
    .setCustomId(COORDS_INPUT_ID)
    .setPlaceholder("123|456")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20);

  const coordsLabel = new LabelBuilder()
    .setLabel("Koordinatės")
    .setTextInputComponent(coordsInput);

  const troopsInput = new TextInputBuilder()
    .setCustomId(TROOPS_NEEDED_INPUT_ID)
    .setPlaceholder("1000")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const troopsLabel = new LabelBuilder()
    .setLabel("Kiek karių reikia?")
    .setTextInputComponent(troopsInput);

  const messageInput = new TextInputBuilder()
    .setCustomId(MESSAGE_INPUT_ID)
    .setPlaceholder("Pvz.: anti cav")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const messageLabel = new LabelBuilder()
    .setLabel("Papildoma informacija (nebūtina)")
    .setTextInputComponent(messageInput);

  modal.addLabelComponents(coordsLabel, troopsLabel, messageLabel);

  await interaction.showModal(modal);
}

export async function handleRequestDefModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // 1. Validate configuration
  const validation = validateDefenseConfig(interaction.guildId);
  if (!validation.valid) {
    await interaction.reply({ content: validation.error, ephemeral: true });
    return;
  }

  // 2. Extract inputs from modal
  const coordsInput = interaction.fields.getTextInputValue(COORDS_INPUT_ID);
  const troopsInput = interaction.fields.getTextInputValue(TROOPS_NEEDED_INPUT_ID);
  const message = interaction.fields.getTextInputValue(MESSAGE_INPUT_ID) || "";

  // 3. Parse troops (coords validation is done in action)
  const troopsNeeded = parseInt(troopsInput, 10);
  if (isNaN(troopsNeeded) || troopsNeeded < 1) {
    await interaction.reply({
      content: "Neteisingas karių skaičius. Įvesk teigiamą skaičių.",
      ephemeral: true,
    });
    return;
  }

  // 4. Defer reply
  await interaction.deferReply();

  // 5. Execute action
  const result = await executeDefAction(
    {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    },
    {
      coords: coordsInput,
      troopsNeeded,
      message,
    }
  );

  // 6. Handle response
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }

  await interaction.editReply({ content: result.actionText });
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
