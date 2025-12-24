import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STATS_FILE = path.join(DATA_DIR, "push-stats.json");

export interface PushStatsContribution {
  accountName: string; // In-game account name, NOT Discord userId
  x: number;
  y: number;
  resources: number;
  timestamp: number;
}

export interface GuildPushStats {
  contributions: PushStatsContribution[];
  lastReset: number;
}

type AllStatsData = Record<string, GuildPushStats>;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllData(): AllStatsData {
  ensureDataDir();
  if (!fs.existsSync(STATS_FILE)) {
    return {};
  }
  const data = fs.readFileSync(STATS_FILE, "utf-8");
  return JSON.parse(data);
}

function saveAllData(data: AllStatsData): void {
  ensureDataDir();
  fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
}

function getDefaultGuildStats(): GuildPushStats {
  return {
    contributions: [],
    lastReset: Date.now(),
  };
}

export function getGuildPushStats(guildId: string): GuildPushStats {
  const allData = loadAllData();
  return allData[guildId] || getDefaultGuildStats();
}

function saveGuildStats(guildId: string, stats: GuildPushStats): void {
  const allData = loadAllData();
  allData[guildId] = stats;
  saveAllData(allData);
}

/**
 * Record a push contribution to stats.
 */
export function recordPushContribution(
  guildId: string,
  accountName: string,
  x: number,
  y: number,
  resources: number
): void {
  const stats = getGuildPushStats(guildId);
  stats.contributions.push({
    accountName,
    x,
    y,
    resources,
    timestamp: Date.now(),
  });
  saveGuildStats(guildId, stats);
}

/**
 * Remove a push contribution from stats (for undo support).
 * Removes the most recent matching contribution.
 */
export function removePushContribution(
  guildId: string,
  accountName: string,
  x: number,
  y: number,
  resources: number
): boolean {
  const stats = getGuildPushStats(guildId);

  // Find the most recent matching contribution (search from end)
  for (let i = stats.contributions.length - 1; i >= 0; i--) {
    const c = stats.contributions[i];
    if (c.accountName === accountName && c.x === x && c.y === y && c.resources === resources) {
      stats.contributions.splice(i, 1);
      saveGuildStats(guildId, stats);
      return true;
    }
  }

  return false;
}

export interface PushLeaderboardEntry {
  accountName: string;
  totalResources: number;
  villageCount: number;
}

/**
 * Get push leaderboard: players sorted by total resources sent (descending).
 */
export function getPushLeaderboard(guildId: string): PushLeaderboardEntry[] {
  const stats = getGuildPushStats(guildId);

  // Aggregate by account name
  const byAccount = new Map<string, { totalResources: number; villages: Set<string> }>();

  for (const c of stats.contributions) {
    const entry = byAccount.get(c.accountName) || { totalResources: 0, villages: new Set() };
    entry.totalResources += c.resources;
    entry.villages.add(`${c.x}|${c.y}`);
    byAccount.set(c.accountName, entry);
  }

  // Convert to array and sort
  const result: PushLeaderboardEntry[] = [];
  for (const [accountName, data] of byAccount) {
    result.push({
      accountName,
      totalResources: data.totalResources,
      villageCount: data.villages.size,
    });
  }

  result.sort((a, b) => b.totalResources - a.totalResources);
  return result;
}

export interface PlayerPushVillage {
  x: number;
  y: number;
  resources: number;
}

export interface PlayerPushStats {
  accountName: string;
  totalResources: number;
  villages: PlayerPushVillage[];
}

/**
 * Get push stats for a specific player by account name.
 */
export function getPlayerPushStats(guildId: string, accountName: string): PlayerPushStats | null {
  const stats = getGuildPushStats(guildId);

  // Aggregate by village for this player
  const byVillage = new Map<string, PlayerPushVillage>();
  let totalResources = 0;

  for (const c of stats.contributions) {
    if (c.accountName !== accountName) continue;

    const key = `${c.x}|${c.y}`;
    const entry = byVillage.get(key) || { x: c.x, y: c.y, resources: 0 };
    entry.resources += c.resources;
    totalResources += c.resources;
    byVillage.set(key, entry);
  }

  if (totalResources === 0) {
    return null;
  }

  const villages = Array.from(byVillage.values());
  villages.sort((a, b) => b.resources - a.resources);

  return {
    accountName,
    totalResources,
    villages,
  };
}

export interface VillagePushContributor {
  accountName: string;
  resources: number;
}

export interface VillagePushStats {
  x: number;
  y: number;
  totalResources: number;
  contributors: VillagePushContributor[];
}

/**
 * Get push stats for a specific village.
 */
export function getVillagePushStats(guildId: string, x: number, y: number): VillagePushStats | null {
  const stats = getGuildPushStats(guildId);

  // Aggregate by contributor for this village
  const byContributor = new Map<string, number>();
  let totalResources = 0;

  for (const c of stats.contributions) {
    if (c.x !== x || c.y !== y) continue;

    const current = byContributor.get(c.accountName) || 0;
    byContributor.set(c.accountName, current + c.resources);
    totalResources += c.resources;
  }

  if (totalResources === 0) {
    return null;
  }

  const contributors: VillagePushContributor[] = [];
  for (const [accountName, resources] of byContributor) {
    contributors.push({ accountName, resources });
  }
  contributors.sort((a, b) => b.resources - a.resources);

  return {
    x,
    y,
    totalResources,
    contributors,
  };
}

/**
 * Reset all push stats for a guild.
 */
export function resetPushStats(guildId: string): void {
  const stats: GuildPushStats = {
    contributions: [],
    lastReset: Date.now(),
  };
  saveGuildStats(guildId, stats);
}

/**
 * Get the timestamp of last push stats reset.
 */
export function getPushLastResetTime(guildId: string): number {
  return getGuildPushStats(guildId).lastReset;
}
