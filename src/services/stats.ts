import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STATS_FILE = path.join(DATA_DIR, "stats.json");

export interface StatsContribution {
  userId: string;
  x: number;
  y: number;
  troops: number;
  timestamp: number;
}

export interface GuildStats {
  contributions: StatsContribution[];
  lastReset: number;
}

type AllStatsData = Record<string, GuildStats>;

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

function getDefaultGuildStats(): GuildStats {
  return {
    contributions: [],
    lastReset: Date.now(),
  };
}

export function getGuildStats(guildId: string): GuildStats {
  const allData = loadAllData();
  return allData[guildId] || getDefaultGuildStats();
}

function saveGuildStats(guildId: string, stats: GuildStats): void {
  const allData = loadAllData();
  allData[guildId] = stats;
  saveAllData(allData);
}

/**
 * Record a contribution to stats.
 */
export function recordContribution(
  guildId: string,
  userId: string,
  x: number,
  y: number,
  troops: number
): void {
  const stats = getGuildStats(guildId);
  stats.contributions.push({
    userId,
    x,
    y,
    troops,
    timestamp: Date.now(),
  });
  saveGuildStats(guildId, stats);
}

/**
 * Remove a contribution from stats (for undo support).
 * Removes the most recent matching contribution.
 */
export function removeContribution(
  guildId: string,
  userId: string,
  x: number,
  y: number,
  troops: number
): boolean {
  const stats = getGuildStats(guildId);

  // Find the most recent matching contribution (search from end)
  for (let i = stats.contributions.length - 1; i >= 0; i--) {
    const c = stats.contributions[i];
    if (c.userId === userId && c.x === x && c.y === y && c.troops === troops) {
      stats.contributions.splice(i, 1);
      saveGuildStats(guildId, stats);
      return true;
    }
  }

  return false;
}

export interface LeaderboardEntry {
  userId: string;
  totalTroops: number;
  villageCount: number;
}

/**
 * Get leaderboard: users sorted by total troops sent (descending).
 */
export function getLeaderboard(guildId: string): LeaderboardEntry[] {
  const stats = getGuildStats(guildId);

  // Aggregate by user
  const byUser = new Map<string, { totalTroops: number; villages: Set<string> }>();

  for (const c of stats.contributions) {
    const entry = byUser.get(c.userId) || { totalTroops: 0, villages: new Set() };
    entry.totalTroops += c.troops;
    entry.villages.add(`${c.x}|${c.y}`);
    byUser.set(c.userId, entry);
  }

  // Convert to array and sort
  const result: LeaderboardEntry[] = [];
  for (const [userId, data] of byUser) {
    result.push({
      userId,
      totalTroops: data.totalTroops,
      villageCount: data.villages.size,
    });
  }

  result.sort((a, b) => b.totalTroops - a.totalTroops);
  return result;
}

export interface UserStatsVillage {
  x: number;
  y: number;
  troops: number;
}

export interface UserStats {
  userId: string;
  totalTroops: number;
  villages: UserStatsVillage[];
}

/**
 * Get stats for a specific user.
 */
export function getUserStats(guildId: string, userId: string): UserStats | null {
  const stats = getGuildStats(guildId);

  // Aggregate by village for this user
  const byVillage = new Map<string, UserStatsVillage>();
  let totalTroops = 0;

  for (const c of stats.contributions) {
    if (c.userId !== userId) continue;

    const key = `${c.x}|${c.y}`;
    const entry = byVillage.get(key) || { x: c.x, y: c.y, troops: 0 };
    entry.troops += c.troops;
    totalTroops += c.troops;
    byVillage.set(key, entry);
  }

  if (totalTroops === 0) {
    return null;
  }

  const villages = Array.from(byVillage.values());
  villages.sort((a, b) => b.troops - a.troops);

  return {
    userId,
    totalTroops,
    villages,
  };
}

export interface VillageStatsContributor {
  userId: string;
  troops: number;
}

export interface VillageStats {
  x: number;
  y: number;
  totalTroops: number;
  contributors: VillageStatsContributor[];
}

/**
 * Get stats for a specific village.
 */
export function getVillageStats(guildId: string, x: number, y: number): VillageStats | null {
  const stats = getGuildStats(guildId);

  // Aggregate by contributor for this village
  const byContributor = new Map<string, number>();
  let totalTroops = 0;

  for (const c of stats.contributions) {
    if (c.x !== x || c.y !== y) continue;

    const current = byContributor.get(c.userId) || 0;
    byContributor.set(c.userId, current + c.troops);
    totalTroops += c.troops;
  }

  if (totalTroops === 0) {
    return null;
  }

  const contributors: VillageStatsContributor[] = [];
  for (const [userId, troops] of byContributor) {
    contributors.push({ userId, troops });
  }
  contributors.sort((a, b) => b.troops - a.troops);

  return {
    x,
    y,
    totalTroops,
    contributors,
  };
}

export interface AllVillageStatsEntry {
  x: number;
  y: number;
  totalTroops: number;
  contributorCount: number;
}

/**
 * Get all villages sorted by total troops (descending).
 */
export function getAllVillageStats(guildId: string): AllVillageStatsEntry[] {
  const stats = getGuildStats(guildId);

  // Aggregate by village
  const byVillage = new Map<string, { x: number; y: number; totalTroops: number; contributors: Set<string> }>();

  for (const c of stats.contributions) {
    const key = `${c.x}|${c.y}`;
    const entry = byVillage.get(key) || { x: c.x, y: c.y, totalTroops: 0, contributors: new Set() };
    entry.totalTroops += c.troops;
    entry.contributors.add(c.userId);
    byVillage.set(key, entry);
  }

  // Convert to array and sort
  const result: AllVillageStatsEntry[] = [];
  for (const data of byVillage.values()) {
    result.push({
      x: data.x,
      y: data.y,
      totalTroops: data.totalTroops,
      contributorCount: data.contributors.size,
    });
  }

  result.sort((a, b) => b.totalTroops - a.totalTroops);
  return result;
}

/**
 * Reset all stats for a guild.
 */
export function resetStats(guildId: string): void {
  const stats: GuildStats = {
    contributions: [],
    lastReset: Date.now(),
  };
  saveGuildStats(guildId, stats);
}

/**
 * Get the timestamp of last reset.
 */
export function getLastResetTime(guildId: string): number {
  return getGuildStats(guildId).lastReset;
}
