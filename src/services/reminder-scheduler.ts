import fs from "fs";
import path from "path";
import { Client, TextChannel } from "discord.js";

const DATA_DIR = path.join(process.cwd(), "data");
const REMINDERS_FILE = path.join(DATA_DIR, "reminders.json");

export interface Reminder {
  id: number;
  guildId: string;
  channelId: string;
  creatorId: string;
  text: string;
  intervalMinutes: number;
  fromTime: string; // "HH:MM" format
  toTime: string; // "HH:MM" format
  createdAt: number;
  lastFiredAt?: number;
}

interface RemindersData {
  nextId: number;
  reminders: Reminder[];
}

// In-memory map of active timeouts by reminder ID
const activeTimeouts = new Map<number, NodeJS.Timeout>();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadRemindersData(): RemindersData {
  ensureDataDir();
  if (!fs.existsSync(REMINDERS_FILE)) {
    return { nextId: 1, reminders: [] };
  }
  try {
    const data = fs.readFileSync(REMINDERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { nextId: 1, reminders: [] };
  }
}

function saveRemindersData(data: RemindersData): void {
  ensureDataDir();
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Parse "HH:MM" time string to minutes since midnight.
 * Returns null if invalid format.
 */
export function parseTime(timeStr: string): number | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Check if a time (in minutes since midnight) is within the from-to window.
 * Handles overnight windows (e.g., from 22:00 to 06:00).
 */
function isWithinWindow(
  timeMinutes: number,
  fromMinutes: number,
  toMinutes: number
): boolean {
  if (toMinutes > fromMinutes) {
    // Normal window (e.g., 10:00-23:00)
    return timeMinutes >= fromMinutes && timeMinutes <= toMinutes;
  } else {
    // Overnight window (e.g., 22:00-06:00)
    return timeMinutes >= fromMinutes || timeMinutes <= toMinutes;
  }
}

/**
 * Calculate the next fire timestamp for a reminder.
 * Returns Unix timestamp in milliseconds.
 */
function calculateNextFireTime(reminder: Reminder): number {
  const fromMinutes = parseTime(reminder.fromTime)!;
  const toMinutes = parseTime(reminder.toTime)!;

  const now = new Date();
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  let nextMinutes: number;
  let daysToAdd = 0;

  if (reminder.lastFiredAt) {
    // Calculate based on last fire time + interval
    const lastFire = new Date(reminder.lastFiredAt);
    const lastFireMinutes =
      lastFire.getUTCHours() * 60 + lastFire.getUTCMinutes();
    nextMinutes = lastFireMinutes + reminder.intervalMinutes;

    // Normalize to 0-1440 range
    while (nextMinutes >= 1440) {
      nextMinutes -= 1440;
      daysToAdd++;
    }
  } else {
    // First fire: start at fromTime
    nextMinutes = fromMinutes;
  }

  // Check if next time is within window
  if (!isWithinWindow(nextMinutes, fromMinutes, toMinutes)) {
    // Move to start of next window
    nextMinutes = fromMinutes;
    if (toMinutes > fromMinutes) {
      // Normal window: if we're past toTime today, schedule for tomorrow
      if (currentMinutes > toMinutes) {
        daysToAdd = 1;
      }
    } else {
      // Overnight window: if we're between end and start, schedule for today's start
      if (currentMinutes > toMinutes && currentMinutes < fromMinutes) {
        daysToAdd = 0;
      }
    }
  }

  // Build the target date
  const targetDate = new Date(now);
  targetDate.setUTCDate(targetDate.getUTCDate() + daysToAdd);
  targetDate.setUTCHours(Math.floor(nextMinutes / 60));
  targetDate.setUTCMinutes(nextMinutes % 60);
  targetDate.setUTCSeconds(0);
  targetDate.setUTCMilliseconds(0);

  // If the calculated time is in the past, move to next occurrence
  if (targetDate.getTime() <= now.getTime()) {
    // Try adding the interval
    const nextAttempt = nextMinutes + reminder.intervalMinutes;
    if (nextAttempt < 1440 && isWithinWindow(nextAttempt, fromMinutes, toMinutes)) {
      targetDate.setUTCHours(Math.floor(nextAttempt / 60));
      targetDate.setUTCMinutes(nextAttempt % 60);
    } else {
      // Move to next day's window start
      targetDate.setUTCDate(targetDate.getUTCDate() + 1);
      targetDate.setUTCHours(Math.floor(fromMinutes / 60));
      targetDate.setUTCMinutes(fromMinutes % 60);
    }
  }

  return targetDate.getTime();
}

/**
 * Schedule the next firing of a reminder.
 */
function scheduleNextFire(client: Client, reminder: Reminder): void {
  // Clear any existing timeout
  const existingTimeout = activeTimeouts.get(reminder.id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const nextFireTime = calculateNextFireTime(reminder);
  const delayMs = nextFireTime - Date.now();

  if (delayMs > 0) {
    console.log(
      `[ReminderScheduler] Reminder #${reminder.id} scheduled for ${new Date(nextFireTime).toISOString()} (in ${Math.round(delayMs / 1000 / 60)} minutes)`
    );
    const timeout = setTimeout(async () => {
      await fireReminder(client, reminder);
    }, delayMs);
    activeTimeouts.set(reminder.id, timeout);
  }
}

/**
 * Fire a reminder: send the message and reschedule.
 */
async function fireReminder(client: Client, reminder: Reminder): Promise<void> {
  console.log(`[ReminderScheduler] Firing reminder #${reminder.id}`);

  // Update lastFiredAt
  const data = loadRemindersData();
  const idx = data.reminders.findIndex((r) => r.id === reminder.id);
  if (idx === -1) {
    // Reminder was deleted
    activeTimeouts.delete(reminder.id);
    return;
  }

  data.reminders[idx].lastFiredAt = Date.now();
  saveRemindersData(data);

  try {
    const channel = (await client.channels.fetch(
      reminder.channelId
    )) as TextChannel | null;
    if (!channel || !("send" in channel)) {
      console.error(
        `[ReminderScheduler] Channel ${reminder.channelId} not found or not a text channel`
      );
      return;
    }

    await channel.send({ content: reminder.text });
  } catch (error) {
    console.error(`[ReminderScheduler] Failed to send reminder:`, error);
  }

  // Reschedule for next occurrence
  scheduleNextFire(client, data.reminders[idx]);
}

/**
 * Add a new reminder and schedule it.
 */
export function addReminder(
  client: Client,
  reminder: Omit<Reminder, "id" | "createdAt">
): Reminder {
  const data = loadRemindersData();

  const newReminder: Reminder = {
    ...reminder,
    id: data.nextId++,
    createdAt: Date.now(),
  };

  data.reminders.push(newReminder);
  saveRemindersData(data);

  scheduleNextFire(client, newReminder);

  return newReminder;
}

/**
 * Delete a reminder by ID.
 * Returns true if found and deleted, false otherwise.
 */
export function deleteReminder(id: number): boolean {
  const data = loadRemindersData();
  const idx = data.reminders.findIndex((r) => r.id === id);

  if (idx === -1) {
    return false;
  }

  data.reminders.splice(idx, 1);
  saveRemindersData(data);

  // Cancel any pending timeout
  const timeout = activeTimeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    activeTimeouts.delete(id);
  }

  return true;
}

/**
 * Get all reminders for a guild.
 */
export function getRemindersForGuild(guildId: string): Reminder[] {
  const data = loadRemindersData();
  return data.reminders.filter((r) => r.guildId === guildId);
}

/**
 * Get next fire time for a reminder (for display purposes).
 */
export function getNextFireTime(reminder: Reminder): number {
  return calculateNextFireTime(reminder);
}

/**
 * Load all reminders and reschedule them.
 * Call this on bot startup.
 */
export function loadAndRescheduleReminders(client: Client): void {
  const data = loadRemindersData();

  for (const reminder of data.reminders) {
    scheduleNextFire(client, reminder);
  }

  console.log(
    `[ReminderScheduler] Loaded and scheduled ${data.reminders.length} reminders`
  );
}
