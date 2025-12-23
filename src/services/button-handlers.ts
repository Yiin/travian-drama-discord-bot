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
import { getVillageAt, formatVillageDisplay } from "./map-data";
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

// Scout going button/modal IDs
export const SCOUT_GOING_BUTTON_ID = "scout_going_button";
export const SCOUT_GOING_MODAL_ID = "scout_going_modal";
export const SCOUT_TIME_INPUT_ID = "scout_time_input";

/**
 * Parse time input and return Unix timestamp (seconds) if valid.
 *
 * Supported formats:
 * - "hh:mm" or "hh:mm:ss" - treats as next occurrence in future (UTC)
 * - "in HH:MM:SS hrs.at HH:MM:SS" - Travian format, uses travel time to calculate arrival
 *
 * Returns Unix timestamp or null if unparseable.
 */
function parseTimeToTimestamp(input: string): number | null {
  const trimmed = input.trim();

  // Try Travian format: "in  34:43:31  hrs.at  05:05:31"
  const travianMatch = trimmed.match(/^in\s+(\d+):(\d{2}):(\d{2})\s+hrs\.?\s*at\s+(\d{1,2}):(\d{2}):(\d{2})$/i);
  if (travianMatch) {
    const travelHours = parseInt(travianMatch[1], 10);
    const travelMinutes = parseInt(travianMatch[2], 10);
    const travelSeconds = parseInt(travianMatch[3], 10);

    // Validate travel time parts
    if (travelMinutes > 59 || travelSeconds > 59) {
      return null;
    }

    // Calculate arrival by adding travel time to now
    const now = Date.now();
    const travelMs = ((travelHours * 60 + travelMinutes) * 60 + travelSeconds) * 1000;
    const arrivalMs = now + travelMs;

    return Math.floor(arrivalMs / 1000);
  }

  // Try simple format: hh:mm or hh:mm:ss
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) {
    return null;
  }

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  // Default to :59 seconds if not provided (ensures it's "next occurrence")
  const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 59;

  // Validate ranges
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }

  // Build UTC timestamp for today
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    seconds
  ));

  // If the time has already passed today, assume it's tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return Math.floor(target.getTime() / 1000);
}

/**
 * Format time input as Discord timestamp or raw string.
 */
function formatTimeDisplay(input: string): string {
  const timestamp = parseTimeToTimestamp(input);
  if (timestamp !== null) {
    return `<t:${timestamp}:R>`;
  }
  return `(${input.trim()})`;
}

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

    // Build description: progress + message (truncated if needed)
    let description = `${request.troopsSent}/${request.troopsNeeded}`;
    if (request.message) {
      const maxMsgLen = 100 - description.length - 3; // Discord limit is 100 chars
      const truncatedMsg = request.message.length > maxMsgLen
        ? request.message.substring(0, maxMsgLen - 3) + "..."
        : request.message;
      description += ` - ${truncatedMsg}`;
    }

    options.push(
      new StringSelectMenuOptionBuilder()
        .setDefault(i === 0)
        .setLabel(`${prefix}(${request.x}|${request.y}) ${villageName} (${playerName})`)
        .setDescription(description)
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
  // Show modal to ask for landing time
  const modal = new ModalBuilder()
    .setCustomId(`${SCOUT_GOING_MODAL_ID}:${interaction.message.id}`)
    .setTitle("Žvalgyba");

  const timeInput = new TextInputBuilder()
    .setCustomId(SCOUT_TIME_INPUT_ID)
    .setPlaceholder("12:30")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const timeLabel = new LabelBuilder()
    .setLabel("Kada leidžiasi?")
    .setTextInputComponent(timeInput);

  modal.addLabelComponents(timeLabel);

  await interaction.showModal(modal);
}

export async function handleScoutGoingModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  // Extract message ID from custom ID
  const [, messageId] = interaction.customId.split(":");
  if (!messageId) {
    await interaction.reply({
      content: "Nepavyko atnaujinti žinutės.",
      ephemeral: true,
    });
    return;
  }

  const timeInput = interaction.fields.getTextInputValue(SCOUT_TIME_INPUT_ID);

  // Fetch the original message
  const channel = interaction.channel;
  if (!channel) {
    await interaction.reply({
      content: "Nepavyko rasti kanalo.",
      ephemeral: true,
    });
    return;
  }

  let message;
  try {
    message = await channel.messages.fetch(messageId);
  } catch {
    await interaction.reply({
      content: "Nepavyko rasti žinutės.",
      ephemeral: true,
    });
    return;
  }

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
  const containerData = existingComponents[0];

  if (!("components" in containerData) || !Array.isArray(containerData.components)) {
    await interaction.reply({
      content: "Nepavyko atnaujinti žinutės.",
      ephemeral: true,
    });
    return;
  }

  const containerComponents = containerData.components;
  const timeDisplay = formatTimeDisplay(timeInput);
  const userEntry = `<@${interaction.user.id}> ${timeDisplay}`;

  // Parse timestamp for notification scheduling
  const arrivalTimestamp = parseTimeToTimestamp(timeInput);

  // Parse the existing content to find the structure
  let mainText = "";
  let requesterId: string | null = null;
  let coords: { x: number; y: number } | null = null;
  let goingEntries: string[] = [];

  for (const comp of containerComponents) {
    if ("content" in comp && typeof comp.content === "string") {
      const content = comp.content;
      if (content.startsWith("##") || content.startsWith("#")) {
        // Main heading - preserve all of it
        mainText = content;
        // Extract coordinates from [(x|y)] format
        const coordsMatch = content.match(/\[\((-?\d+)\|(-?\d+)\)\]/);
        if (coordsMatch) {
          coords = { x: parseInt(coordsMatch[1], 10), y: parseInt(coordsMatch[2], 10) };
        }
        // Extract requester ID from footer line (> -# Paprašė <@userId>)
        // This is in the same content block, not a separate component
        const requesterMatch = content.match(/Paprašė <@(\d+)>/);
        if (requesterMatch) {
          requesterId = requesterMatch[1];
        }
      } else if (content.startsWith("**Eina:**")) {
        // Extract existing entries (user + time pairs)
        const entriesMatch = content.match(/\*\*Eina:\*\* (.+)/);
        if (entriesMatch) {
          goingEntries = entriesMatch[1].split(", ").filter((e: string) => e.trim());
        }
      }
    }
  }

  // Check if user already has an entry (by user ID)
  const userId = interaction.user.id;
  const existingIndex = goingEntries.findIndex((entry) =>
    entry.includes(`<@${userId}>`)
  );

  if (existingIndex !== -1) {
    // Update existing entry with new time
    goingEntries[existingIndex] = userEntry;
  } else {
    // Add new entry
    goingEntries.push(userEntry);
  }

  // Rebuild the container
  const container = new ContainerBuilder().setAccentColor(0x3498db);

  if (mainText) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(mainText)
    );
  }

  // Add "Eina:" section
  if (goingEntries.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Eina:** ${goingEntries.join(", ")}`)
    );
  }

  // Keep the button
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SCOUT_GOING_BUTTON_ID)
      .setLabel("Eina")
      .setStyle(ButtonStyle.Primary)
  );

  await message.edit({
    components: [container, buttonRow],
    flags: MessageFlags.IsComponentsV2,
  });

  // Schedule notification if time was parsed successfully
  if (arrivalTimestamp !== null && requesterId && coords && "send" in channel) {
    const guildId = interaction.guildId;
    const config = guildId ? getGuildConfig(guildId) : null;

    if (config?.serverKey) {
      const now = Math.floor(Date.now() / 1000);
      const delayMs = (arrivalTimestamp - now) * 1000;
      const notifyChannel = channel;
      const goingUserId = interaction.user.id;
      const serverKey = config.serverKey;
      const targetCoords = coords;

      if (delayMs > 0) {
        setTimeout(async () => {
          try {
            const village = await getVillageAt(serverKey, targetCoords.x, targetCoords.y);
            const targetDisplay = village
              ? formatVillageDisplay(serverKey, village)
              : `(${targetCoords.x}|${targetCoords.y})`;

            await notifyChannel.send({
              content: `<@${requesterId}> žvalgai nuo <@${goingUserId}> į ${targetDisplay} turėtų būti jau vietoje!`,
            });
          } catch (error) {
            console.error("Failed to send scout notification:", error);
          }
        }, delayMs);
      }
    }
  }

  // Acknowledge the interaction
  await interaction.deferUpdate();
}
