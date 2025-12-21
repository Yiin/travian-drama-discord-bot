import initSqlJs, { Database } from "sql.js";
import fs from "fs";
import path from "path";
import https from "https";
import { captureSnapshot } from "./population-history";

const DATA_DIR = path.join(process.cwd(), "data");
const MAPS_DIR = path.join(DATA_DIR, "maps");

// Helper to construct full URL from server key (e.g., "ts31.x3.europe" -> "https://ts31.x3.europe.travian.com")
export function getFullServerUrl(serverKey: string): string {
  return `https://${serverKey}.travian.com`;
}

export interface VillageData {
  targetMapId: number;
  x: number;
  y: number;
  tribe: number;
  playerId: number;
  villageName: string;
  playerName: string;
  allianceId: number;
  allianceName: string;
  population: number;
}

export const TRIBES: Record<number, string> = {
  1: "Romans",
  2: "Teutons",
  3: "Gauls",
  4: "Nature",
  5: "Natars",
  6: "Egyptians",
  7: "Huns",
};

// In-memory database cache per server
const dbCache: Map<string, Database> = new Map();
const lastUpdated: Map<string, number> = new Map();

// sql.js instance
let SQL: initSqlJs.SqlJsStatic | null = null;

async function initSQL(): Promise<initSqlJs.SqlJsStatic> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

function ensureMapsDir(): void {
  if (!fs.existsSync(MAPS_DIR)) {
    fs.mkdirSync(MAPS_DIR, { recursive: true });
  }
}

function getServerHash(serverKey: string): string {
  // Use server key directly for file naming (replace dots with underscores)
  return serverKey.replace(/\./g, "_");
}

function getDbPath(serverUrl: string): string {
  return path.join(MAPS_DIR, `${getServerHash(serverUrl)}.db`);
}

function getMetaPath(serverUrl: string): string {
  return path.join(MAPS_DIR, `${getServerHash(serverUrl)}.meta.json`);
}

async function downloadMapSql(serverKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullUrl = getFullServerUrl(serverKey);
    const mapUrl = `${fullUrl}/map.sql`;

    https
      .get(mapUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download map.sql: HTTP ${res.statusCode}`));
          return;
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function parseMapSql(sqlContent: string): VillageData[] {
  const villages: VillageData[] = [];
  const regex = /INSERT INTO [`']?x_world[`']? VALUES\s*\(([^)]+)\)/gi;

  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    try {
      const valuesStr = match[1];
      const values = parseValues(valuesStr);

      if (values.length >= 11) {
        const village: VillageData = {
          targetMapId: parseInt(values[0], 10),
          x: parseInt(values[1], 10),
          y: parseInt(values[2], 10),
          tribe: parseInt(values[3], 10),
          playerId: parseInt(values[4], 10),
          villageName: cleanString(values[5]),
          playerName: cleanString(values[7]),
          allianceId: parseInt(values[8], 10) || 0,
          allianceName: cleanString(values[9]),
          population: parseInt(values[10], 10),
        };
        villages.push(village);
      }
    } catch {
      // Skip malformed entries
    }
  }

  return villages;
}

function parseValues(valuesStr: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < valuesStr.length; i++) {
    const char = valuesStr[i];

    if (!inQuote && (char === "'" || char === '"')) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      // Check for escaped quote
      if (i + 1 < valuesStr.length && valuesStr[i + 1] === quoteChar) {
        current += char;
        i++; // Skip next quote
      } else {
        inQuote = false;
        quoteChar = "";
      }
    } else if (!inQuote && char === ",") {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    values.push(current.trim());
  }

  return values;
}

function cleanString(s: string): string {
  if (!s) return "";
  // Remove surrounding quotes and unescape
  s = s.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1);
  }
  return s.replace(/''/g, "'").replace(/""/g, '"');
}

async function createDatabase(villages: VillageData[]): Promise<Database> {
  const sql = await initSQL();
  const db = new sql.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS villages (
      targetMapId INTEGER PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      tribe INTEGER,
      playerId INTEGER,
      villageName TEXT,
      playerName TEXT,
      allianceId INTEGER,
      allianceName TEXT,
      population INTEGER
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_coords ON villages (x, y)");

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO villages
    (targetMapId, x, y, tribe, playerId, villageName, playerName, allianceId, allianceName, population)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const v of villages) {
    stmt.run([
      v.targetMapId,
      v.x,
      v.y,
      v.tribe,
      v.playerId,
      v.villageName,
      v.playerName,
      v.allianceId,
      v.allianceName,
      v.population,
    ]);
  }

  stmt.free();

  return db;
}

function saveDatabase(db: Database, serverUrl: string): void {
  ensureMapsDir();
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(serverUrl), buffer);

  // Save metadata
  const meta = { lastUpdated: Date.now() };
  fs.writeFileSync(getMetaPath(serverUrl), JSON.stringify(meta));
}

async function loadDatabase(serverUrl: string): Promise<Database | null> {
  const dbPath = getDbPath(serverUrl);
  const metaPath = getMetaPath(serverUrl);

  if (!fs.existsSync(dbPath) || !fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const sql = await initSQL();
    const buffer = fs.readFileSync(dbPath);
    const db = new sql.Database(buffer);

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    lastUpdated.set(serverUrl, meta.lastUpdated);

    return db;
  } catch {
    return null;
  }
}

export async function updateMapData(serverUrl: string): Promise<void> {
  console.log(`[MapData] Downloading map.sql from ${serverUrl}...`);

  const sqlContent = await downloadMapSql(serverUrl);
  console.log(`[MapData] Downloaded ${sqlContent.length} bytes`);

  const villages = parseMapSql(sqlContent);
  console.log(`[MapData] Parsed ${villages.length} villages`);

  const db = await createDatabase(villages);

  // Close old database if exists
  const oldDb = dbCache.get(serverUrl);
  if (oldDb) {
    oldDb.close();
  }

  // Save and cache
  saveDatabase(db, serverUrl);
  dbCache.set(serverUrl, db);
  lastUpdated.set(serverUrl, Date.now());

  // Capture population snapshot for history tracking
  captureSnapshot(serverUrl, villages);

  console.log(`[MapData] Database updated for ${serverUrl}`);
}

async function getDatabase(serverUrl: string): Promise<Database | null> {
  // Check cache first
  if (dbCache.has(serverUrl)) {
    return dbCache.get(serverUrl)!;
  }

  // Try to load from disk
  const db = await loadDatabase(serverUrl);
  if (db) {
    dbCache.set(serverUrl, db);
    return db;
  }

  return null;
}

export async function getVillageAt(
  serverUrl: string,
  x: number,
  y: number
): Promise<VillageData | null> {
  const db = await getDatabase(serverUrl);
  if (!db) return null;

  const stmt = db.prepare("SELECT * FROM villages WHERE x = ? AND y = ?");
  stmt.bind([x, y]);

  if (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    stmt.free();

    return {
      targetMapId: row.targetMapId as number,
      x: row.x as number,
      y: row.y as number,
      tribe: row.tribe as number,
      playerId: row.playerId as number,
      villageName: row.villageName as string,
      playerName: row.playerName as string,
      allianceId: row.allianceId as number,
      allianceName: row.allianceName as string,
      population: row.population as number,
    };
  }

  stmt.free();
  return null;
}

export function needsRefresh(serverUrl: string): boolean {
  const updated = lastUpdated.get(serverUrl);
  if (!updated) {
    // Check metadata file
    const metaPath = getMetaPath(serverUrl);
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        lastUpdated.set(serverUrl, meta.lastUpdated);
        return Date.now() - meta.lastUpdated > 24 * 60 * 60 * 1000;
      } catch {
        return true;
      }
    }
    return true;
  }

  // Refresh if older than 24 hours
  return Date.now() - updated > 24 * 60 * 60 * 1000;
}

export function getRallyPointLink(serverKey: string, targetMapId: number, eventType = 1): string {
  const fullUrl = getFullServerUrl(serverKey);
  return `${fullUrl}/build.php?id=39&eventType=${eventType}&tt=2&targetMapId=${targetMapId}&gid=16`;
}

export function getMapLink(serverKey: string, position: { x: number; y: number }) {
  return `https://${serverKey}.travian.com/karte.php?x=${position.x}&y=${position.y}`
}

export function getTribeName(tribe: number): string {
  return TRIBES[tribe] || "Unknown";
}

export async function ensureMapData(serverUrl: string): Promise<boolean> {
  try {
    const db = await getDatabase(serverUrl);
    if (!db || needsRefresh(serverUrl)) {
      await updateMapData(serverUrl);
    }
    return true;
  } catch (error) {
    console.error(`[MapData] Failed to ensure map data for ${serverUrl}:`, error);
    return false;
  }
}

export interface PlayerSearchResult {
  playerId: number;
  playerName: string;
  allianceId: number;
  allianceName: string;
  totalPopulation: number;
  villageCount: number;
}

/**
 * Search for players by exact name (case-insensitive).
 * Returns aggregated stats per player.
 */
export async function searchPlayersByName(
  serverKey: string,
  playerName: string,
  limit = 25
): Promise<PlayerSearchResult[]> {
  const db = await getDatabase(serverKey);
  if (!db) return [];

  const searchLower = playerName.toLowerCase();

  const stmt = db.prepare(`
    SELECT
      playerId,
      playerName,
      allianceId,
      allianceName,
      SUM(population) as totalPopulation,
      COUNT(*) as villageCount
    FROM villages
    WHERE LOWER(playerName) = ?
    GROUP BY playerId
    ORDER BY totalPopulation DESC
    LIMIT ?
  `);
  stmt.bind([searchLower, limit]);

  const results: PlayerSearchResult[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    results.push({
      playerId: row.playerId as number,
      playerName: row.playerName as string,
      allianceId: row.allianceId as number,
      allianceName: row.allianceName as string,
      totalPopulation: row.totalPopulation as number,
      villageCount: row.villageCount as number,
    });
  }
  stmt.free();

  return results;
}

/**
 * Get all villages for a specific player by ID.
 */
export async function getVillagesByPlayerId(
  serverKey: string,
  playerId: number
): Promise<VillageData[]> {
  const db = await getDatabase(serverKey);
  if (!db) return [];

  const stmt = db.prepare(
    "SELECT * FROM villages WHERE playerId = ? ORDER BY population DESC"
  );
  stmt.bind([playerId]);

  const villages: VillageData[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    villages.push({
      targetMapId: row.targetMapId as number,
      x: row.x as number,
      y: row.y as number,
      tribe: row.tribe as number,
      playerId: row.playerId as number,
      villageName: row.villageName as string,
      playerName: row.playerName as string,
      allianceId: row.allianceId as number,
      allianceName: row.allianceName as string,
      population: row.population as number,
    });
  }
  stmt.free();

  return villages;
}
