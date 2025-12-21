import fs from "fs";
import path from "path";
import { VillageData } from "./map-data";

const DATA_DIR = path.join(process.cwd(), "data");
const MAPS_DIR = path.join(DATA_DIR, "maps");
const MAX_HISTORY_DAYS = 7;

// --- Interfaces ---

export interface PlayerPopulationSnapshot {
  playerId: number;
  playerName: string;
  allianceId: number;
  allianceName: string;
  population: number;
  villageCount: number;
}

export interface DailySnapshot {
  date: string; // ISO date format: "2025-12-21"
  timestamp: number;
  players: PlayerPopulationSnapshot[];
}

export interface PopulationHistoryData {
  serverKey: string;
  snapshots: DailySnapshot[];
}

export interface PlayerPopulationTrend {
  date: string;
  population: number;
  villageCount: number;
}

export interface TrendDisplay {
  lines: string[];
  totalChange: number;
  changeDirection: "up" | "down" | "stable";
}

// --- File path helpers ---

function getServerHash(serverKey: string): string {
  return serverKey.replace(/\./g, "_");
}

function getHistoryPath(serverKey: string): string {
  return path.join(MAPS_DIR, `${getServerHash(serverKey)}.population-history.json`);
}

function ensureMapsDir(): void {
  if (!fs.existsSync(MAPS_DIR)) {
    fs.mkdirSync(MAPS_DIR, { recursive: true });
  }
}

// --- Load/Save functions ---

function loadHistory(serverKey: string): PopulationHistoryData {
  const historyPath = getHistoryPath(serverKey);
  if (!fs.existsSync(historyPath)) {
    return { serverKey, snapshots: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(historyPath, "utf-8"));
  } catch {
    return { serverKey, snapshots: [] };
  }
}

function saveHistory(data: PopulationHistoryData): void {
  ensureMapsDir();
  const historyPath = getHistoryPath(data.serverKey);
  fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

// --- Core functions ---

/**
 * Creates a new daily snapshot from current village data.
 * Aggregates population by player.
 */
export function captureSnapshot(serverKey: string, villages: VillageData[]): void {
  const today = new Date().toISOString().split("T")[0]; // "2025-12-21"

  // Aggregate by playerId
  const playerMap = new Map<number, PlayerPopulationSnapshot>();

  for (const village of villages) {
    if (village.playerId === 0) continue; // Skip unoccupied/oases

    const existing = playerMap.get(village.playerId);
    if (existing) {
      existing.population += village.population;
      existing.villageCount += 1;
      // Update alliance info (use latest)
      existing.allianceId = village.allianceId;
      existing.allianceName = village.allianceName;
    } else {
      playerMap.set(village.playerId, {
        playerId: village.playerId,
        playerName: village.playerName,
        allianceId: village.allianceId,
        allianceName: village.allianceName,
        population: village.population,
        villageCount: 1,
      });
    }
  }

  const snapshot: DailySnapshot = {
    date: today,
    timestamp: Date.now(),
    players: Array.from(playerMap.values()),
  };

  // Load existing history
  const history = loadHistory(serverKey);

  // Remove existing snapshot for today (if re-running)
  history.snapshots = history.snapshots.filter((s) => s.date !== today);

  // Add new snapshot
  history.snapshots.push(snapshot);

  // Sort by date descending (newest first)
  history.snapshots.sort((a, b) => b.date.localeCompare(a.date));

  // Prune older than MAX_HISTORY_DAYS
  history.snapshots = history.snapshots.slice(0, MAX_HISTORY_DAYS);

  saveHistory(history);
  console.log(`[PopulationHistory] Captured snapshot for ${serverKey}: ${playerMap.size} players`);
}

/**
 * Gets population history for a specific player.
 * Returns array of { date, population, villageCount } ordered newest first.
 */
export function getPlayerHistory(serverKey: string, playerId: number): PlayerPopulationTrend[] {
  const history = loadHistory(serverKey);
  const results: PlayerPopulationTrend[] = [];

  for (const snapshot of history.snapshots) {
    const player = snapshot.players.find((p) => p.playerId === playerId);
    if (player) {
      results.push({
        date: snapshot.date,
        population: player.population,
        villageCount: player.villageCount,
      });
    }
  }

  return results; // Already sorted newest first
}

/**
 * Formats population trend for Discord embed display.
 */
export function formatPopulationTrend(trends: PlayerPopulationTrend[]): TrendDisplay {
  if (trends.length === 0) {
    return { lines: ["Nėra istorinių duomenų"], totalChange: 0, changeDirection: "stable" };
  }

  const lines: string[] = [];

  for (let i = 0; i < trends.length; i++) {
    const trend = trends[i];
    const prevTrend = trends[i + 1];

    let changeStr = "";
    if (prevTrend) {
      const diff = trend.population - prevTrend.population;
      if (diff > 0) changeStr = ` (+${diff.toLocaleString()})`;
      else if (diff < 0) changeStr = ` (${diff.toLocaleString()})`;
    }

    // Format date as DD.MM
    const [, month, day] = trend.date.split("-");
    const formattedDate = `${day}.${month}`;

    lines.push(
      `${formattedDate}: **${trend.population.toLocaleString()}** pop (${trend.villageCount} miestai)${changeStr}`
    );
  }

  // Calculate total change
  const newest = trends[0];
  const oldest = trends[trends.length - 1];
  const totalChange = newest.population - oldest.population;
  const changeDirection = totalChange > 0 ? "up" : totalChange < 0 ? "down" : "stable";

  return { lines, totalChange, changeDirection };
}
