import fs from "fs";
import path from "path";
import { Scope, scopeKey } from "../config/scope";

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

export function getGuildPushStats(scope: Scope): GuildPushStats {
  const allData = loadAllData();
  return allData[scopeKey(scope)] || getDefaultGuildStats();
}

function saveGuildStats(scope: Scope, stats: GuildPushStats): void {
  const allData = loadAllData();
  allData[scopeKey(scope)] = stats;
  saveAllData(allData);
}

/**
 * Record a push contribution to stats.
 */
export function recordPushContribution(
  scope: Scope,
  accountName: string,
  x: number,
  y: number,
  resources: number
): void {
  const stats = getGuildPushStats(scope);
  stats.contributions.push({
    accountName,
    x,
    y,
    resources,
    timestamp: Date.now(),
  });
  saveGuildStats(scope, stats);
}

/**
 * Remove a push contribution from stats (for undo support).
 * Removes the most recent matching contribution.
 */
export function removePushContribution(
  scope: Scope,
  accountName: string,
  x: number,
  y: number,
  resources: number
): boolean {
  const stats = getGuildPushStats(scope);

  // Find the most recent matching contribution (search from end)
  for (let i = stats.contributions.length - 1; i >= 0; i--) {
    const c = stats.contributions[i];
    if (c.accountName === accountName && c.x === x && c.y === y && c.resources === resources) {
      stats.contributions.splice(i, 1);
      saveGuildStats(scope, stats);
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
export function getPushLeaderboard(scope: Scope): PushLeaderboardEntry[] {
  const stats = getGuildPushStats(scope);

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
export function getPlayerPushStats(scope: Scope, accountName: string): PlayerPushStats | null {
  const stats = getGuildPushStats(scope);

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
export function getVillagePushStats(scope: Scope, x: number, y: number): VillagePushStats | null {
  const stats = getGuildPushStats(scope);

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
export function resetPushStats(scope: Scope): void {
  const stats: GuildPushStats = {
    contributions: [],
    lastReset: Date.now(),
  };
  saveGuildStats(scope, stats);
}

/**
 * Get the timestamp of last push stats reset.
 */
export function getPushLastResetTime(scope: Scope): number {
  return getGuildPushStats(scope).lastReset;
}

/**
 * Adjust a player's contribution stats for a specific village.
 * Used when editing contribution amounts.
 */
export function adjustContributionStats(
  scope: Scope,
  accountName: string,
  x: number,
  y: number,
  adjustment: number
): void {
  const stats = getGuildPushStats(scope);

  // Add adjustment contribution entry
  stats.contributions.push({
    accountName,
    x,
    y,
    resources: adjustment,
    timestamp: Date.now(),
  });

  saveGuildStats(scope, stats);
}

/**
 * Transfer contribution stats from one player to another for a specific village.
 * Adds a negative entry for the source and positive entry for the target.
 */
export function transferContributionStats(
  scope: Scope,
  fromAccount: string,
  toAccount: string,
  x: number,
  y: number,
  amount: number
): void {
  const stats = getGuildPushStats(scope);
  const now = Date.now();

  // Remove from source
  stats.contributions.push({
    accountName: fromAccount,
    x,
    y,
    resources: -amount,
    timestamp: now,
  });

  // Add to target
  stats.contributions.push({
    accountName: toAccount,
    x,
    y,
    resources: amount,
    timestamp: now,
  });

  saveGuildStats(scope, stats);
}

// --- Global stats edit/transfer functions ---

export interface EditGlobalStatsResult {
  success: boolean;
  previousAmount?: number;
  error?: string;
}

/**
 * Set a player's total global stats to a specific amount.
 * Calculates the difference from current total and adds an adjustment entry.
 */
export function editGlobalStats(
  scope: Scope,
  accountName: string,
  newAmount: number
): EditGlobalStatsResult {
  const playerStats = getPlayerPushStats(scope, accountName);
  const previousAmount = playerStats?.totalResources || 0;

  if (previousAmount === newAmount) {
    return { success: true, previousAmount };
  }

  const adjustment = newAmount - previousAmount;

  const stats = getGuildPushStats(scope);
  // Use coords (0,0) as a marker for global adjustments
  stats.contributions.push({
    accountName,
    x: 0,
    y: 0,
    resources: adjustment,
    timestamp: Date.now(),
  });

  saveGuildStats(scope, stats);
  return { success: true, previousAmount };
}

export interface TransferGlobalStatsResult {
  success: boolean;
  transferredAmount?: number;
  error?: string;
}

/**
 * Rename all occurrences of an account name in push stats.
 * Returns the number of contribution records updated.
 */
export function renameAccountInPushStats(
  scope: Scope,
  oldName: string,
  newName: string
): number {
  const stats = getGuildPushStats(scope);
  let count = 0;

  for (const contribution of stats.contributions) {
    if (contribution.accountName === oldName) {
      contribution.accountName = newName;
      count++;
    }
  }

  if (count > 0) {
    saveGuildStats(scope, stats);
  }
  return count;
}

/**
 * Transfer all stats from one player to another.
 * Creates negative entries for source and positive entries for target.
 */
export function transferGlobalStats(
  scope: Scope,
  fromAccount: string,
  toAccount: string
): TransferGlobalStatsResult {
  if (fromAccount === toAccount) {
    return { success: false, error: "Cannot transfer to the same player." };
  }

  const fromStats = getPlayerPushStats(scope, fromAccount);
  if (!fromStats || fromStats.totalResources === 0) {
    return { success: false, error: `Player "${fromAccount}" has no stats.` };
  }

  const stats = getGuildPushStats(scope);
  const now = Date.now();
  const transferredAmount = fromStats.totalResources;

  // Transfer each village contribution
  for (const village of fromStats.villages) {
    // Remove from source
    stats.contributions.push({
      accountName: fromAccount,
      x: village.x,
      y: village.y,
      resources: -village.resources,
      timestamp: now,
    });

    // Add to target
    stats.contributions.push({
      accountName: toAccount,
      x: village.x,
      y: village.y,
      resources: village.resources,
      timestamp: now,
    });
  }

  saveGuildStats(scope, stats);
  return { success: true, transferredAmount };
}
