import fs from "fs";
import path from "path";
import { parseScopeKey, Scope, scopeKey } from "../config/scope";

/**
 * Scout requests: one card per request in the scout channel.
 * State lives here, never in the rendered message.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const SCOUTS_FILE = path.join(DATA_DIR, "scout-requests.json");

export interface ScoutGoing {
  userId: string;
  displayName: string;
  /** Unix seconds when the scouts land; undefined when the entered time could not be parsed. */
  arrivalAt?: number;
  /** Raw text the user typed, shown when it could not be parsed. */
  rawTime: string;
}

export interface ScoutRequest {
  /** Stable per-guild id, shown as `#S12`. */
  id: number;
  messageId?: string;
  channelId: string;
  x: number;
  y: number;
  note: string;
  requesterId: string;
  scoutRoleId?: string;
  going: ScoutGoing[];
  reportUrl?: string;
  status: "open" | "done";
  createdAt: number;
  doneAt?: number;
}

export interface GuildScoutData {
  nextId: number;
  requests: ScoutRequest[];
}

type AllGuildData = Record<string, GuildScoutData>;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllData(): AllGuildData {
  ensureDataDir();
  if (!fs.existsSync(SCOUTS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SCOUTS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveAllData(data: AllGuildData): void {
  ensureDataDir();
  fs.writeFileSync(SCOUTS_FILE, JSON.stringify(data, null, 2));
}

function getGuildData(scope: Scope): GuildScoutData {
  return loadAllData()[scopeKey(scope)] ?? { nextId: 1, requests: [] };
}

function saveGuildData(scope: Scope, data: GuildScoutData): void {
  const all = loadAllData();
  all[scopeKey(scope)] = data;
  saveAllData(all);
}

export function formatScoutId(id: number): string {
  return `S${id}`;
}

export function addScoutRequest(
  scope: Scope,
  input: Pick<ScoutRequest, "channelId" | "x" | "y" | "note" | "requesterId" | "scoutRoleId">,
): ScoutRequest {
  const data = getGuildData(scope);
  const request: ScoutRequest = {
    id: data.nextId++,
    ...input,
    going: [],
    status: "open",
    createdAt: Date.now(),
  };
  data.requests.push(request);
  saveGuildData(scope, data);
  return request;
}

export function setScoutMessageId(scope: Scope, id: number, messageId: string): void {
  const data = getGuildData(scope);
  const request = data.requests.find((r) => r.id === id);
  if (!request) return;
  request.messageId = messageId;
  saveGuildData(scope, data);
}

export function getScoutRequest(scope: Scope, id: number): ScoutRequest | undefined {
  return getGuildData(scope).requests.find((r) => r.id === id);
}

export function getScoutRequestByMessageId(scope: Scope, messageId: string): ScoutRequest | undefined {
  return getGuildData(scope).requests.find((r) => r.messageId === messageId);
}

/** Find a scout by message id across all scopes; used by the scheduler, which only knows the message. */
export function findScoutByMessageId(messageId: string): { scope: Scope; request: ScoutRequest } | undefined {
  for (const [key, guild] of Object.entries(loadAllData())) {
    const request = guild.requests.find((r) => r.messageId === messageId);
    if (request) return { scope: parseScopeKey(key), request };
  }
  return undefined;
}

export function getOpenScoutRequests(scope: Scope): ScoutRequest[] {
  return getGuildData(scope).requests.filter((r) => r.status === "open");
}

export function setScoutGoing(scope: Scope, id: number, going: ScoutGoing): ScoutRequest | undefined {
  const data = getGuildData(scope);
  const request = data.requests.find((r) => r.id === id);
  if (!request) return undefined;
  const index = request.going.findIndex((g) => g.userId === going.userId);
  if (index === -1) request.going.push(going);
  else request.going[index] = going;
  saveGuildData(scope, data);
  return request;
}

export function markScoutDone(scope: Scope, id: number, reportUrl?: string): ScoutRequest | undefined {
  const data = getGuildData(scope);
  const request = data.requests.find((r) => r.id === id);
  if (!request) return undefined;
  request.status = "done";
  request.doneAt = Date.now();
  if (reportUrl) request.reportUrl = reportUrl;
  saveGuildData(scope, data);
  return request;
}

/** Drop a scout request entirely (undo of its creation). */
export function removeScoutRequest(scope: Scope, id: number): ScoutRequest | undefined {
  const data = getGuildData(scope);
  const index = data.requests.findIndex((r) => r.id === id);
  if (index === -1) return undefined;
  const [removed] = data.requests.splice(index, 1);
  saveGuildData(scope, data);
  return removed;
}

/** Keep the file small: drop done scouts older than 14 days. */
export function pruneScoutRequests(scope: Scope, maxAgeMs = 14 * 24 * 60 * 60 * 1000): void {
  const data = getGuildData(scope);
  const cutoff = Date.now() - maxAgeMs;
  const before = data.requests.length;
  data.requests = data.requests.filter((r) => r.status === "open" || (r.doneAt ?? r.createdAt) > cutoff);
  if (data.requests.length !== before) saveGuildData(scope, data);
}
