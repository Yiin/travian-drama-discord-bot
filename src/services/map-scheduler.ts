import { getAllConfiguredServers } from "../config/guild-config";
import { updateMapData, needsRefresh } from "./map-data";

const DAILY_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

let timeoutId: NodeJS.Timeout | null = null;
let intervalId: NodeJS.Timeout | null = null;

const UPDATE_DELAY_MINUTES = 5; // Wait after midnight to avoid race conditions

function getMsUntilNextUpdate(): number {
  const now = new Date();
  const nextUpdate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, UPDATE_DELAY_MINUTES, 0, 0
  ));
  return nextUpdate.getTime() - now.getTime();
}

async function updateAllServers(): Promise<void> {
  const servers = getAllConfiguredServers();
  const uniqueKeys = [...new Set(servers.map((s) => s.serverKey))];

  console.log(`[MapScheduler] Updating ${uniqueKeys.length} server(s)...`);

  for (const serverKey of uniqueKeys) {
    try {
      console.log(`[MapScheduler] Updating ${serverKey}...`);
      await updateMapData(serverKey);
    } catch (error) {
      console.error(`[MapScheduler] Failed to update ${serverKey}:`, error);
    }
  }
}

async function updateStaleServers(): Promise<void> {
  const servers = getAllConfiguredServers();
  const uniqueKeys = [...new Set(servers.map((s) => s.serverKey))];

  for (const serverKey of uniqueKeys) {
    try {
      if (needsRefresh(serverKey)) {
        console.log(`[MapScheduler] ${serverKey} is stale, updating...`);
        await updateMapData(serverKey);
      }
    } catch (error) {
      console.error(`[MapScheduler] Failed to update ${serverKey}:`, error);
    }
  }
}

export function startScheduler(): void {
  if (timeoutId || intervalId) {
    console.log("[MapScheduler] Scheduler already running");
    return;
  }

  console.log("[MapScheduler] Starting scheduler...");

  // Update stale servers on startup
  updateStaleServers().catch(console.error);

  // Schedule first update at 00:05 UTC
  const msUntilUpdate = getMsUntilNextUpdate();
  const hoursUntil = (msUntilUpdate / 1000 / 60 / 60).toFixed(1);
  console.log(`[MapScheduler] Next update at 00:05 UTC (in ${hoursUntil} hours)`);

  timeoutId = setTimeout(() => {
    updateAllServers().catch(console.error);

    // Then run daily at 00:05 UTC
    intervalId = setInterval(() => {
      updateAllServers().catch(console.error);
    }, DAILY_INTERVAL);
  }, msUntilUpdate);
}

export function stopScheduler(): void {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  console.log("[MapScheduler] Scheduler stopped");
}
