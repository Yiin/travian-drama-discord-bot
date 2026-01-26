import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "player-accounts.json");

export interface GuildPlayerData {
  // Map InGameName -> array of user IDs who have this account
  accounts: Record<string, string[]>;
  // Map InGameName -> array of user IDs who are sitters
  sitters: Record<string, string[]>;
}

type AllGuildData = Record<string, GuildPlayerData>;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllData(): AllGuildData {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    return {};
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function saveAllData(data: AllGuildData): void {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getDefaultGuildData(): GuildPlayerData {
  return {
    accounts: {},
    sitters: {},
  };
}

export function getGuildPlayerData(guildId: string): GuildPlayerData {
  const allData = loadAllData();
  return allData[guildId] || getDefaultGuildData();
}

function saveGuildData(guildId: string, data: GuildPlayerData): void {
  const allData = loadAllData();
  allData[guildId] = data;
  saveAllData(allData);
}

/**
 * Set user as having an in-game account
 */
export function setAccount(
  guildId: string,
  userId: string,
  inGameName: string
): void {
  const data = getGuildPlayerData(guildId);

  // Remove user from any existing account first
  for (const name of Object.keys(data.accounts)) {
    data.accounts[name] = data.accounts[name].filter((id) => id !== userId);
    if (data.accounts[name].length === 0) {
      delete data.accounts[name];
    }
  }

  // Add to new account
  if (!data.accounts[inGameName]) {
    data.accounts[inGameName] = [];
  }
  if (!data.accounts[inGameName].includes(userId)) {
    data.accounts[inGameName].push(userId);
  }

  saveGuildData(guildId, data);
}

/**
 * Remove user's account association
 */
export function deleteAccount(guildId: string, userId: string): boolean {
  const data = getGuildPlayerData(guildId);
  let removed = false;

  for (const name of Object.keys(data.accounts)) {
    const before = data.accounts[name].length;
    data.accounts[name] = data.accounts[name].filter((id) => id !== userId);
    if (data.accounts[name].length < before) {
      removed = true;
    }
    if (data.accounts[name].length === 0) {
      delete data.accounts[name];
    }
  }

  if (removed) {
    saveGuildData(guildId, data);
  }
  return removed;
}

/**
 * Get the in-game name for a user (if any)
 */
export function getAccountForUser(
  guildId: string,
  userId: string
): string | null {
  const data = getGuildPlayerData(guildId);
  for (const [name, users] of Object.entries(data.accounts)) {
    if (users.includes(userId)) {
      return name;
    }
  }
  return null;
}

/**
 * Add user as sitter for specified in-game names
 */
export function addSitter(
  guildId: string,
  userId: string,
  inGameNames: string[]
): string[] {
  const data = getGuildPlayerData(guildId);
  const added: string[] = [];

  for (const name of inGameNames) {
    if (!data.sitters[name]) {
      data.sitters[name] = [];
    }
    if (!data.sitters[name].includes(userId)) {
      data.sitters[name].push(userId);
      added.push(name);
    }
  }

  if (added.length > 0) {
    saveGuildData(guildId, data);
  }
  return added;
}

/**
 * Remove user as sitter for specified in-game names
 */
export function removeSitter(
  guildId: string,
  userId: string,
  inGameNames: string[]
): string[] {
  const data = getGuildPlayerData(guildId);
  const removed: string[] = [];

  for (const name of inGameNames) {
    if (data.sitters[name]) {
      const before = data.sitters[name].length;
      data.sitters[name] = data.sitters[name].filter((id) => id !== userId);
      if (data.sitters[name].length < before) {
        removed.push(name);
      }
      if (data.sitters[name].length === 0) {
        delete data.sitters[name];
      }
    }
  }

  if (removed.length > 0) {
    saveGuildData(guildId, data);
  }
  return removed;
}

/**
 * Rename an in-game account (updates both accounts and sitters maps)
 * Returns true if the account was found and renamed, false otherwise
 */
export function renameAccount(
  guildId: string,
  oldName: string,
  newName: string
): boolean {
  const data = getGuildPlayerData(guildId);
  let renamed = false;

  // Rename in accounts map
  if (data.accounts[oldName]) {
    data.accounts[newName] = data.accounts[oldName];
    delete data.accounts[oldName];
    renamed = true;
  }

  // Rename in sitters map
  if (data.sitters[oldName]) {
    // Merge with existing sitters if newName already has some
    if (data.sitters[newName]) {
      const combined = new Set([
        ...data.sitters[newName],
        ...data.sitters[oldName],
      ]);
      data.sitters[newName] = Array.from(combined);
    } else {
      data.sitters[newName] = data.sitters[oldName];
    }
    delete data.sitters[oldName];
    renamed = true;
  }

  if (renamed) {
    saveGuildData(guildId, data);
  }
  return renamed;
}

/**
 * Get all players with their owners and sitters
 */
export function getAllPlayers(
  guildId: string
): Array<{ name: string; owners: string[]; sitters: string[] }> {
  const data = getGuildPlayerData(guildId);
  const playerNames = new Set<string>([
    ...Object.keys(data.accounts),
    ...Object.keys(data.sitters),
  ]);

  const result: Array<{ name: string; owners: string[]; sitters: string[] }> =
    [];

  for (const name of playerNames) {
    result.push({
      name,
      owners: data.accounts[name] || [],
      sitters: data.sitters[name] || [],
    });
  }

  // Sort alphabetically by name
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}
