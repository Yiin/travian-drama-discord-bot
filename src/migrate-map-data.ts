/**
 * CLI script to migrate map data.
 * Re-downloads map.sql for all configured servers to fix the playerId/villageId schema.
 *
 * Usage: npm run migrate
 */

import { getAllConfiguredServers } from "./config/guild-config";
import { updateMapData } from "./services/map-data";

async function migrate(): Promise<void> {
  console.log("=== Map Data Migration ===\n");

  const servers = getAllConfiguredServers();

  if (servers.length === 0) {
    console.log("No servers configured. Nothing to migrate.");
    return;
  }

  console.log(`Found ${servers.length} configured server(s):\n`);

  for (const { guildId, serverKey } of servers) {
    console.log(`- ${serverKey} (guild: ${guildId})`);
  }

  console.log("\nStarting migration...\n");

  // Get unique server keys (multiple guilds might use the same server)
  const uniqueServers = [...new Set(servers.map((s) => s.serverKey))];

  for (const serverKey of uniqueServers) {
    console.log(`[${serverKey}] Downloading fresh map data...`);
    try {
      await updateMapData(serverKey);
      console.log(`[${serverKey}] ✓ Migration complete\n`);
    } catch (error) {
      console.error(`[${serverKey}] ✗ Failed:`, error);
    }
  }

  console.log("=== Migration finished ===");
}

migrate().catch(console.error);
