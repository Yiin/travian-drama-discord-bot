import fs from "fs";
import path from "path";
import { expireActionHistory } from "./history-expiry";

const DATA_DIR = path.join(process.cwd(), "data");
const REQUESTS_FILE = path.join(DATA_DIR, "defense-requests.json");

export const MAX_REQUESTS = 20;

export interface Contributor {
  userId: string;
  troops: number;
}

export interface DefenseRequest {
  /** Stable per-guild id. Never changes, never reused. Shown to users as `#41`. */
  id: number;
  x: number;
  y: number;
  troopsSent: number;
  troopsNeeded: number;
  message: string;
  requesterId: string;
  createdAt: number;
  contributors: Contributor[];
}

export interface CompletedRequest {
  id: number;
  x: number;
  y: number;
  completedBy: string;
}

export interface GuildDefenseData {
  globalMessageId?: string;
  /** Next stable id to hand out. */
  nextId: number;
  /** Array order is the queue position (first = highest priority). */
  requests: DefenseRequest[];
  recentlyCompleted: CompletedRequest[];
}

type AllGuildData = Record<string, GuildDefenseData>;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllData(): AllGuildData {
  ensureDataDir();
  if (!fs.existsSync(REQUESTS_FILE)) {
    return {};
  }
  const data: AllGuildData = JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf-8"));
  if (migrateIds(data)) {
    saveAllData(data);
  }
  return data;
}

/**
 * Give stable ids to records written before ids existed.
 * Older undo entries referenced positions, so they are expired.
 * Returns true when anything changed.
 */
function migrateIds(data: AllGuildData): boolean {
  let changed = false;
  for (const [guildId, guild] of Object.entries(data)) {
    const missing = guild.requests.some((r) => r.id === undefined);
    if (!missing && guild.nextId !== undefined) continue;
    if (missing) {
      let next = 1;
      for (const request of guild.requests) {
        request.id = next++;
      }
      expireActionHistory(guildId, "expired by id migration");
    }
    const maxId = guild.requests.reduce((max, r) => Math.max(max, r.id), 0);
    guild.nextId = Math.max(guild.nextId ?? 1, maxId + 1);
    changed = true;
  }
  return changed;
}

function saveAllData(data: AllGuildData): void {
  ensureDataDir();
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
}

function getDefaultGuildData(): GuildDefenseData {
  return {
    nextId: 1,
    requests: [],
    recentlyCompleted: [],
  };
}

export function getGuildDefenseData(guildId: string): GuildDefenseData {
  const allData = loadAllData();
  return allData[guildId] || getDefaultGuildData();
}

function saveGuildData(guildId: string, data: GuildDefenseData): void {
  const allData = loadAllData();
  allData[guildId] = data;
  saveAllData(allData);
}

function indexOfId(data: GuildDefenseData, requestId: number): number {
  return data.requests.findIndex((r) => r.id === requestId);
}

export function setGlobalMessageId(guildId: string, messageId: string): void {
  const data = getGuildDefenseData(guildId);
  data.globalMessageId = messageId;
  saveGuildData(guildId, data);
}

export function getGlobalMessageId(guildId: string): string | undefined {
  return getGuildDefenseData(guildId).globalMessageId;
}

export interface AddRequestResult {
  request: DefenseRequest;
  requestId: number;
}

export function addRequest(
  guildId: string,
  x: number,
  y: number,
  troopsNeeded: number,
  message: string,
  requesterId: string
): AddRequestResult | { error: string } {
  const data = getGuildDefenseData(guildId);

  if (data.requests.length >= MAX_REQUESTS) {
    return { error: `Maximum of ${MAX_REQUESTS} active requests reached.` };
  }

  const newRequest: DefenseRequest = {
    id: data.nextId++,
    x,
    y,
    troopsSent: 0,
    troopsNeeded,
    message,
    requesterId,
    createdAt: Date.now(),
    contributors: [],
  };

  data.requests.push(newRequest);
  saveGuildData(guildId, data);

  return { request: newRequest, requestId: newRequest.id };
}

export function getRequestById(
  guildId: string,
  requestId: number
): DefenseRequest | undefined {
  return getGuildDefenseData(guildId).requests.find((r) => r.id === requestId);
}

/** 1-based queue position of a request, or undefined when it is not active. */
export function getRequestPosition(guildId: string, requestId: number): number | undefined {
  const index = indexOfId(getGuildDefenseData(guildId), requestId);
  return index === -1 ? undefined : index + 1;
}

export function getRequestsByCoords(
  guildId: string,
  x: number,
  y: number
): { request: DefenseRequest; requestId: number }[] {
  const data = getGuildDefenseData(guildId);
  return data.requests
    .filter((r) => r.x === x && r.y === y)
    .map((request) => ({ request, requestId: request.id }));
}

export interface ReportTroopsResult {
  request: DefenseRequest;
  isComplete: boolean;
}

export function reportTroopsSent(
  guildId: string,
  requestId: number,
  userId: string,
  troops: number
): ReportTroopsResult | { error: string } {
  const data = getGuildDefenseData(guildId);
  const index = indexOfId(data, requestId);
  const request = data.requests[index];

  if (!request) {
    return { error: `Request #${requestId} not found.` };
  }

  const existingContributor = request.contributors.find(
    (c) => c.userId === userId
  );
  if (existingContributor) {
    existingContributor.troops += troops;
  } else {
    request.contributors.push({ userId, troops });
  }

  request.troopsSent += troops;

  const isComplete = request.troopsSent >= request.troopsNeeded;

  if (isComplete) {
    data.requests.splice(index, 1);
    data.recentlyCompleted.push({
      id: request.id,
      x: request.x,
      y: request.y,
      completedBy: userId,
    });
  }

  saveGuildData(guildId, data);

  return { request, isComplete };
}

export interface UpdateRequestOptions {
  troopsSent?: number;
  troopsNeeded?: number;
  message?: string;
}

export function updateRequest(
  guildId: string,
  requestId: number,
  updates: UpdateRequestOptions
): DefenseRequest | { error: string } {
  const data = getGuildDefenseData(guildId);
  const index = indexOfId(data, requestId);
  const request = data.requests[index];

  if (!request) {
    return { error: `Request #${requestId} not found.` };
  }

  if (updates.troopsSent !== undefined) {
    request.troopsSent = updates.troopsSent;
  }
  if (updates.troopsNeeded !== undefined) {
    request.troopsNeeded = updates.troopsNeeded;
  }
  if (updates.message !== undefined) {
    request.message = updates.message;
  }

  if (request.troopsSent >= request.troopsNeeded) {
    data.requests.splice(index, 1);
    data.recentlyCompleted.push({
      id: request.id,
      x: request.x,
      y: request.y,
      completedBy: "admin",
    });
  }

  saveGuildData(guildId, data);
  return request;
}

export function removeRequest(
  guildId: string,
  requestId: number
): boolean {
  const data = getGuildDefenseData(guildId);
  const index = indexOfId(data, requestId);

  if (index === -1) {
    return false;
  }

  data.requests.splice(index, 1);
  saveGuildData(guildId, data);
  return true;
}

export function clearRecentlyCompleted(guildId: string): CompletedRequest[] {
  const data = getGuildDefenseData(guildId);
  const completed = [...data.recentlyCompleted];
  data.recentlyCompleted = [];
  saveGuildData(guildId, data);
  return completed;
}

export function getAllRequests(guildId: string): DefenseRequest[] {
  return getGuildDefenseData(guildId).requests;
}

// --- Undo support functions ---

export interface RestoreResult {
  success: boolean;
  requestId?: number;
  error?: string;
}

/**
 * Puts a request back into the active list at the end of the queue.
 * The request keeps its id unless that id is active again, in which case it gets a new one.
 */
export function restoreRequest(
  guildId: string,
  request: DefenseRequest
): RestoreResult {
  const data = getGuildDefenseData(guildId);

  if (data.requests.length >= MAX_REQUESTS) {
    return { success: false, error: `Maximum request limit reached (${MAX_REQUESTS}).` };
  }

  const idTaken = request.id === undefined || indexOfId(data, request.id) !== -1;
  const restoredRequest: DefenseRequest = {
    ...request,
    id: idTaken ? data.nextId++ : request.id,
    contributors: [...request.contributors],
  };
  data.nextId = Math.max(data.nextId, restoredRequest.id + 1);
  data.requests.push(restoredRequest);
  saveGuildData(guildId, data);
  return { success: true, requestId: restoredRequest.id };
}

export interface SubtractTroopsResult {
  success: boolean;
  request?: DefenseRequest;
  error?: string;
}

/**
 * Subtracts troops from a request (reverse of reportTroopsSent).
 * Also updates the contributor's total.
 */
export function subtractTroops(
  guildId: string,
  requestId: number,
  contributorId: string,
  troops: number
): SubtractTroopsResult {
  const data = getGuildDefenseData(guildId);
  const request = data.requests.find((r) => r.id === requestId);

  if (!request) {
    return { success: false, error: "Request not found." };
  }

  request.troopsSent = Math.max(0, request.troopsSent - troops);

  const contributor = request.contributors.find((c) => c.userId === contributorId);
  if (contributor) {
    contributor.troops -= troops;
    if (contributor.troops <= 0) {
      request.contributors = request.contributors.filter(
        (c) => c.userId !== contributorId
      );
    }
  }

  saveGuildData(guildId, data);
  return { success: true, request };
}

export interface MoveRequestResult {
  success: boolean;
  error?: string;
}

/**
 * Moves a request to a 1-based queue position.
 */
export function moveRequest(
  guildId: string,
  requestId: number,
  toPosition: number
): MoveRequestResult {
  const data = getGuildDefenseData(guildId);
  const fromIndex = indexOfId(data, requestId);
  const toIndex = toPosition - 1;

  if (fromIndex === -1) {
    return { success: false, error: `Request #${requestId} not found.` };
  }

  if (toIndex < 0 || toIndex >= data.requests.length) {
    return {
      success: false,
      error: `Position ${toPosition} does not exist. There are ${data.requests.length} requests.`,
    };
  }

  if (fromIndex === toIndex) {
    return { success: false, error: `Request #${requestId} is already at position ${toPosition}.` };
  }

  const [request] = data.requests.splice(fromIndex, 1);
  data.requests.splice(toIndex, 0, request);

  saveGuildData(guildId, data);
  return { success: true };
}
