import fs from "fs";
import path from "path";
import { Client, TextChannel } from "discord.js";
import { getVillageAt, formatVillageDisplay } from "./map-data";
import { getGuildConfig } from "../config/guild-config";

const DATA_DIR = path.join(process.cwd(), "data");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "scout-notifications.json");

export interface ScoutNotification {
  messageId: string;
  channelId: string;
  guildId: string;
  requesterId: string;
  goingUserId: string;
  coords: { x: number; y: number };
  arrivalTimestamp: number; // Unix timestamp in seconds
}

type AllNotifications = ScoutNotification[];

// In-memory map of active timeouts by messageId
const activeTimeouts = new Map<string, NodeJS.Timeout>();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadNotifications(): AllNotifications {
  ensureDataDir();
  if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(NOTIFICATIONS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveNotifications(notifications: AllNotifications): void {
  ensureDataDir();
  fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

/**
 * Schedule a scout notification. Persists to disk and sets up in-memory timeout.
 */
export function scheduleScoutNotification(
  client: Client,
  notification: ScoutNotification,
  markAsDone: (messageId: string, channelId: string, client: Client) => Promise<void>
): void {
  console.log(`[ScoutScheduler] Scheduling notification for message ${notification.messageId}, arrival: ${new Date(notification.arrivalTimestamp * 1000).toISOString()}`);

  // Save to persistent storage
  const notifications = loadNotifications();

  // Remove any existing notification for this message (user updating their time)
  const filtered = notifications.filter(n =>
    !(n.messageId === notification.messageId && n.goingUserId === notification.goingUserId)
  );
  filtered.push(notification);
  saveNotifications(filtered);
  console.log(`[ScoutScheduler] Saved ${filtered.length} notifications to disk`);

  // Clear any existing timeout for this user+message combo
  const timeoutKey = `${notification.messageId}:${notification.goingUserId}`;
  const existingTimeout = activeTimeouts.get(timeoutKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Schedule the notification
  const now = Math.floor(Date.now() / 1000);
  const delayMs = (notification.arrivalTimestamp - now) * 1000;

  if (delayMs > 0) {
    console.log(`[ScoutScheduler] Setting timeout for ${delayMs}ms (${Math.round(delayMs / 1000 / 60)} minutes)`);
    const timeout = setTimeout(async () => {
      console.log(`[ScoutScheduler] Timeout fired for message ${notification.messageId}`);
      await fireNotification(client, notification, markAsDone);
    }, delayMs);
    activeTimeouts.set(timeoutKey, timeout);
  } else {
    console.log(`[ScoutScheduler] Delay is ${delayMs}ms, not scheduling (time already passed)`);
  }
}

/**
 * Cancel all pending notifications for a scout message (when manually marked done).
 */
export function cancelScoutNotifications(messageId: string): void {
  // Remove from persistent storage
  const notifications = loadNotifications();
  const filtered = notifications.filter(n => n.messageId !== messageId);
  saveNotifications(filtered);

  // Clear in-memory timeouts for this message
  for (const [key, timeout] of activeTimeouts.entries()) {
    if (key.startsWith(`${messageId}:`)) {
      clearTimeout(timeout);
      activeTimeouts.delete(key);
    }
  }
}

/**
 * Fire a notification and mark the scout request as done.
 */
async function fireNotification(
  client: Client,
  notification: ScoutNotification,
  markAsDone: (messageId: string, channelId: string, client: Client) => Promise<void>
): Promise<void> {
  console.log(`[ScoutScheduler] Firing notification for message ${notification.messageId}`);
  const { messageId, channelId, guildId, requesterId, goingUserId, coords } = notification;

  // Remove from persistent storage
  const notifications = loadNotifications();
  const filtered = notifications.filter(n =>
    !(n.messageId === messageId && n.goingUserId === goingUserId)
  );
  saveNotifications(filtered);

  // Clear from active timeouts
  const timeoutKey = `${messageId}:${goingUserId}`;
  activeTimeouts.delete(timeoutKey);

  try {
    const channel = await client.channels.fetch(channelId) as TextChannel | null;
    if (!channel || !("send" in channel)) {
      return;
    }

    const config = getGuildConfig(guildId);
    const serverKey = config?.serverKey;

    let targetDisplay = `(${coords.x}|${coords.y})`;
    if (serverKey) {
      const village = await getVillageAt(serverKey, coords.x, coords.y);
      if (village) {
        targetDisplay = formatVillageDisplay(serverKey, village);
      }
    }

    // Send notification
    await channel.send({
      content: `<@${requesterId}> žvalgai nuo <@${goingUserId}> į ${targetDisplay} turėtų būti jau vietoje!`,
    });

    // Mark as done
    await markAsDone(messageId, channelId, client);
  } catch (error) {
    console.error("Failed to send scout notification:", error);
  }
}

/**
 * Load all pending notifications from disk and reschedule them.
 * Call this on bot startup.
 */
export function loadAndRescheduleNotifications(
  client: Client,
  markAsDone: (messageId: string, channelId: string, client: Client) => Promise<void>
): void {
  const notifications = loadNotifications();
  const now = Math.floor(Date.now() / 1000);

  // Filter out expired notifications and schedule valid ones
  const validNotifications: ScoutNotification[] = [];

  for (const notification of notifications) {
    if (notification.arrivalTimestamp <= now) {
      // Already expired - fire immediately
      fireNotification(client, notification, markAsDone);
    } else {
      validNotifications.push(notification);

      const timeoutKey = `${notification.messageId}:${notification.goingUserId}`;
      const delayMs = (notification.arrivalTimestamp - now) * 1000;

      const timeout = setTimeout(async () => {
        await fireNotification(client, notification, markAsDone);
      }, delayMs);
      activeTimeouts.set(timeoutKey, timeout);
    }
  }

  // Save only valid notifications (expired ones were handled)
  saveNotifications(validNotifications);

  console.log(`Loaded ${validNotifications.length} pending scout notifications`);
}
