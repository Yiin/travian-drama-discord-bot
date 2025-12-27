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
import { scheduleScoutNotification, cancelScoutNotifications } from "../scout-scheduler";

// Scout button/modal IDs
export const SCOUT_GOING_BUTTON_ID = "scout_going_button";
export const SCOUT_GOING_MODAL_ID = "scout_going_modal";
export const SCOUT_TIME_INPUT_ID = "scout_time_input";
export const SCOUT_DONE_BUTTON_ID = "scout_done_button";

// Accent colors for scout status
const ACCENT_PENDING = 0xf39c12;     // Orange
const ACCENT_IN_PROGRESS = 0x3498db; // Blue
const ACCENT_DONE = 0x2ecc71;        // Green

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

  // Rebuild the container with blue (in progress) accent
  const container = new ContainerBuilder().setAccentColor(ACCENT_IN_PROGRESS);

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

  // Keep the buttons
  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SCOUT_GOING_BUTTON_ID)
      .setLabel("Eina")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SCOUT_DONE_BUTTON_ID)
      .setLabel("Atlikta")
      .setStyle(ButtonStyle.Success)
  );

  await message.edit({
    components: [container, buttonRow],
    flags: MessageFlags.IsComponentsV2,
  });

  // Schedule notification and auto-complete if time was parsed successfully
  if (arrivalTimestamp !== null && requesterId && coords && interaction.guildId) {
    scheduleScoutNotification(
      interaction.client,
      {
        messageId: message.id,
        channelId: channel.id,
        guildId: interaction.guildId,
        requesterId,
        goingUserId: interaction.user.id,
        coords,
        arrivalTimestamp,
      },
      markScoutMessageAsDoneById
    );
  }

  // Acknowledge the interaction
  await interaction.deferUpdate();
}

/**
 * Handle "Atlikta" (Done) button click - marks scout request as complete.
 */
export async function handleScoutDoneButton(
  interaction: ButtonInteraction
): Promise<void> {
  const success = await markScoutMessageAsDone(interaction.message);

  if (!success) {
    await interaction.reply({
      content: "Nepavyko atnaujinti žinutės.",
      ephemeral: true,
    });
    return;
  }

  // Cancel any pending notifications for this message
  cancelScoutNotifications(interaction.message.id);

  await interaction.deferUpdate();
}

/**
 * Mark a scout message as done (green accent, strikethrough, no buttons).
 * Returns true if successful, false otherwise.
 */
async function markScoutMessageAsDone(message: { components: readonly any[]; edit: (options: any) => Promise<any> }): Promise<boolean> {
  const existingComponents = message.components;
  if (existingComponents.length < 1) {
    return false;
  }

  const containerData = existingComponents[0];
  if (!("components" in containerData) || !Array.isArray(containerData.components)) {
    return false;
  }

  // Check if already done
  for (const comp of containerData.components) {
    if ("content" in comp && typeof comp.content === "string") {
      if (comp.content.includes("**Atlikta**")) {
        return false; // Already marked as done
      }
    }
  }

  // Parse existing content
  let mainText = "";
  let goingEntries: string[] = [];

  for (const comp of containerData.components) {
    if ("content" in comp && typeof comp.content === "string") {
      const content = comp.content;
      if (content.startsWith("##") || content.startsWith("#")) {
        mainText = content;
      } else if (content.startsWith("**Eina:**")) {
        const entriesMatch = content.match(/\*\*Eina:\*\* (.+)/);
        if (entriesMatch) {
          goingEntries = entriesMatch[1].split(", ").filter((e: string) => e.trim());
        }
      }
    }
  }

  // Apply strikethrough and remove link/mention
  const formattedText = applyDoneFormatting(mainText);

  // Build new container with green accent
  const container = new ContainerBuilder().setAccentColor(ACCENT_DONE);

  if (formattedText) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(formattedText)
    );
  }

  // Add completion marker
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("**Atlikta**")
  );

  // Optionally show who went
  if (goingEntries.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Ėjo: ${goingEntries.join(", ")}`)
    );
  }

  // Edit message without buttons
  await message.edit({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });

  return true;
}

/**
 * Apply done formatting: strikethrough headers, remove link/mention lines.
 */
function applyDoneFormatting(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Skip SIUSTI link line
    if (line.includes("[**SIŲSTI**]") || line.includes("[SIUSTI]")) {
      continue;
    }
    // Skip role mention line (standalone role mention)
    if (line.match(/^<@&\d+>$/)) {
      continue;
    }
    // Apply strikethrough to headers (## or #)
    if (line.startsWith("## ") && !line.includes("~~")) {
      result.push("## ~~" + line.substring(3) + "~~");
    } else if (line.startsWith("# ") && !line.includes("~~")) {
      result.push("# ~~" + line.substring(2) + "~~");
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Mark a scout message as done by message ID and channel ID.
 * Used by the scheduler to mark messages done after notification fires.
 */
export async function markScoutMessageAsDoneById(
  messageId: string,
  channelId: string,
  client?: { channels: { fetch: (id: string) => Promise<any> } }
): Promise<void> {
  if (!client) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !("messages" in channel)) return;

    const message = await channel.messages.fetch(messageId);
    await markScoutMessageAsDone(message);
  } catch {
    // Message may have been deleted or already marked done
  }
}
