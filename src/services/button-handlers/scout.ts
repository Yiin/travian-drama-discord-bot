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
  MessageFlags,
  LabelBuilder,
} from "discord.js";
import { getGuildConfig } from "../../config/guild-config";
import { getVillageAt, formatVillageDisplay } from "../map-data";

// Scout button/modal IDs
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
