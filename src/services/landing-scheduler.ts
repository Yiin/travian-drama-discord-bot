import { Client } from "discord.js";
import {
  DefCallRequest,
  getAllDefCallScopes,
  getActiveRequests,
  getRequestById,
  setLanded,
} from "./def-calls";
import { refreshHubChannel, updateDefCallCard } from "./def-calls-message";
import { scheduleAt } from "../utils/time";
import { Scope, scopeKey } from "../config/scope";

/**
 * At landing time a def-call card flips to "Landed". Nothing is posted and nobody
 * is pinged; the card and the hub message are edited in place.
 */

const timers = new Map<string, () => void>();

function key(scope: Scope, requestId: number): string {
  return `${scopeKey(scope)}:${requestId}`;
}

export function scheduleLanding(client: Client, scope: Scope, request: DefCallRequest): void {
  cancelLanding(scope, request.id);
  if (request.closed || request.landed) return;

  const cancel = scheduleAt(request.landingAt * 1000, () => {
    timers.delete(key(scope, request.id));
    void fireLanding(client, scope, request.id);
  });
  timers.set(key(scope, request.id), cancel);
}

export function cancelLanding(scope: Scope, requestId: number): void {
  const cancel = timers.get(key(scope, requestId));
  if (cancel) {
    cancel();
    timers.delete(key(scope, requestId));
  }
}

async function fireLanding(client: Client, scope: Scope, requestId: number): Promise<void> {
  const request = getRequestById(scope, requestId);
  if (!request || request.closed || request.landed) return;
  const landed = setLanded(scope, requestId, true);
  if (!landed) return;
  try {
    await updateDefCallCard(client, scope, landed);
    await refreshHubChannel(client, scope);
  } catch (error) {
    console.error("[LandingScheduler] Failed to mark landed:", error);
  }
}

/** Call once at ClientReady. Overdue calls fire at once. */
export function loadAndScheduleLandings(client: Client): void {
  let count = 0;
  for (const scope of getAllDefCallScopes()) {
    for (const { request } of getActiveRequests(scope)) {
      if (request.landed) continue;
      scheduleLanding(client, scope, request);
      count++;
    }
  }
  console.log(`[LandingScheduler] Scheduled ${count} landing timers`);
}
