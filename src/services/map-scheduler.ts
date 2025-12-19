import { getAllConfiguredServers } from "../config/guild-config";
import { updateMapData, needsRefresh } from "./map-data";

const UPDATE_INTERVAL = 60 * 60 * 1000; // Check every hour

let intervalId: NodeJS.Timeout | null = null;

async function updateAllServers(): Promise<void> {
  const servers = getAllConfiguredServers();
  const uniqueKeys = [...new Set(servers.map((s) => s.serverKey))];

  console.log(`[MapScheduler] Checking ${uniqueKeys.length} server(s) for updates...`);

  for (const serverKey of uniqueKeys) {
    try {
      if (needsRefresh(serverKey)) {
        console.log(`[MapScheduler] Updating ${serverKey}...`);
        await updateMapData(serverKey);
      } else {
        console.log(`[MapScheduler] ${serverKey} is up to date`);
      }
    } catch (error) {
      console.error(`[MapScheduler] Failed to update ${serverKey}:`, error);
    }
  }
}

export function startScheduler(): void {
  if (intervalId) {
    console.log("[MapScheduler] Scheduler already running");
    return;
  }

  console.log("[MapScheduler] Starting scheduler...");

  // Run immediately on startup
  updateAllServers().catch(console.error);

  // Then run periodically
  intervalId = setInterval(() => {
    updateAllServers().catch(console.error);
  }, UPDATE_INTERVAL);

  console.log(`[MapScheduler] Scheduler started, checking every ${UPDATE_INTERVAL / 1000 / 60} minutes`);
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[MapScheduler] Scheduler stopped");
  }
}
