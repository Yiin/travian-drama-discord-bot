import { Client } from "discord.js";
import {
  DefCallRequest,
  getAllDefCallGuildIds,
  getActiveRequests,
  getRequestById,
  setLanded,
} from "./def-calls";
import { refreshHubChannel, updateDefCallCard } from "./def-calls-message";
import { scheduleAt } from "../utils/time";

/**
 * At landing time a def-call card flips to "Landed". Nothing is posted and nobody
 * is pinged; the card and the hub message are edited in place.
 */

const timers = new Map<string, () => void>();

function key(guildId: string, requestId: number): string {
  return `${guildId}:${requestId}`;
}

export function scheduleLanding(client: Client, guildId: string, request: DefCallRequest): void {
  cancelLanding(guildId, request.id);
  if (request.closed || request.landed) return;

  const cancel = scheduleAt(request.landingAt * 1000, () => {
    timers.delete(key(guildId, request.id));
    void fireLanding(client, guildId, request.id);
  });
  timers.set(key(guildId, request.id), cancel);
}

export function cancelLanding(guildId: string, requestId: number): void {
  const cancel = timers.get(key(guildId, requestId));
  if (cancel) {
    cancel();
    timers.delete(key(guildId, requestId));
  }
}

async function fireLanding(client: Client, guildId: string, requestId: number): Promise<void> {
  const request = getRequestById(guildId, requestId);
  if (!request || request.closed || request.landed) return;
  const landed = setLanded(guildId, requestId, true);
  if (!landed) return;
  try {
    await updateDefCallCard(client, guildId, landed);
    await refreshHubChannel(client, guildId);
  } catch (error) {
    console.error("[LandingScheduler] Failed to mark landed:", error);
  }
}

/** Call once at ClientReady. Overdue calls fire at once. */
export function loadAndScheduleLandings(client: Client): void {
  let count = 0;
  for (const guildId of getAllDefCallGuildIds()) {
    for (const { request } of getActiveRequests(guildId)) {
      if (request.landed) continue;
      scheduleLanding(client, guildId, request);
      count++;
    }
  }
  console.log(`[LandingScheduler] Scheduled ${count} landing timers`);
}
