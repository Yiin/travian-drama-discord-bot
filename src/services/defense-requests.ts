import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const REQUESTS_FILE = path.join(DATA_DIR, "defense-requests.json");

export const MAX_REQUESTS = 20;

export interface Contributor {
  userId: string;
  troops: number;
}

export interface DefenseRequest {
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
  const data = fs.readFileSync(REQUESTS_FILE, "utf-8");
  return JSON.parse(data);
}

function saveAllData(data: AllGuildData): void {
  ensureDataDir();
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(data, null, 2));
}

function getDefaultGuildData(): GuildDefenseData {
  return {
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
  requestId: number; // 1-based position ID
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

  // Check max requests limit
  if (data.requests.length >= MAX_REQUESTS) {
    return { error: `Maximum of ${MAX_REQUESTS} active requests reached.` };
  }

  // Create new request (multiple requests per coordinate allowed)
  const newRequest: DefenseRequest = {
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

  return { request: newRequest, requestId: data.requests.length };
}

export function getRequestById(
  guildId: string,
  requestId: number
): DefenseRequest | undefined {
  const data = getGuildDefenseData(guildId);
  // IDs are 1-based, so convert to 0-based index
  return data.requests[requestId - 1];
}

export function getRequestsByCoords(
  guildId: string,
  x: number,
  y: number
): { request: DefenseRequest; requestId: number }[] {
  const data = getGuildDefenseData(guildId);
  const results: { request: DefenseRequest; requestId: number }[] = [];
  data.requests.forEach((r, index) => {
    if (r.x === x && r.y === y) {
      results.push({ request: r, requestId: index + 1 });
    }
  });
  return results;
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
  // IDs are 1-based, convert to 0-based index
  const index = requestId - 1;
  const request = data.requests[index];

  if (!request) {
    return { error: `Request #${requestId} not found.` };
  }

  // Add to contributors
  const existingContributor = request.contributors.find(
    (c) => c.userId === userId
  );
  if (existingContributor) {
    existingContributor.troops += troops;
  } else {
    request.contributors.push({ userId, troops });
  }

  // Update total troops sent
  request.troopsSent += troops;

  const isComplete = request.troopsSent >= request.troopsNeeded;

  if (isComplete) {
    // Remove from active requests
    data.requests.splice(index, 1);
    // Add to recently completed
    data.recentlyCompleted.push({
      id: requestId,
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
  // IDs are 1-based, convert to 0-based index
  const index = requestId - 1;
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

  // Check if now complete
  if (request.troopsSent >= request.troopsNeeded) {
    data.requests.splice(index, 1);
    data.recentlyCompleted.push({
      id: requestId,
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
  // IDs are 1-based, convert to 0-based index
  const index = requestId - 1;

  if (index < 0 || index >= data.requests.length) {
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
 * Restores a request back to the active list.
 * Always adds to end (multiple requests per coordinate allowed).
 * Returns the new 1-based request ID.
 */
export function restoreRequest(
  guildId: string,
  request: DefenseRequest
): RestoreResult {
  const data = getGuildDefenseData(guildId);

  // Check max requests limit
  if (data.requests.length >= MAX_REQUESTS) {
    return { success: false, error: "Pasiektas maksimalus užklausų limitas (20)." };
  }

  // Add at end
  const restoredRequest: DefenseRequest = {
    ...request,
    contributors: [...request.contributors],
  };
  data.requests.push(restoredRequest);
  saveGuildData(guildId, data);
  return { success: true, requestId: data.requests.length };
}

// removeRequestByCoords removed - use removeRequest(guildId, requestId) instead
// Multiple requests per coordinate are now allowed

export interface SubtractTroopsResult {
  success: boolean;
  request?: DefenseRequest;
  error?: string;
}

/**
 * Subtracts troops from a request by requestId (reverse of reportTroopsSent).
 * Also updates the contributor's total.
 */
export function subtractTroops(
  guildId: string,
  requestId: number,
  contributorId: string,
  troops: number
): SubtractTroopsResult {
  const data = getGuildDefenseData(guildId);
  const index = requestId - 1; // Convert 1-based to 0-based

  if (index < 0 || index >= data.requests.length) {
    return { success: false, error: "Užklausa nerasta." };
  }

  const request = data.requests[index];

  // Subtract from total
  request.troopsSent = Math.max(0, request.troopsSent - troops);

  // Update contributor
  const contributor = request.contributors.find((c) => c.userId === contributorId);
  if (contributor) {
    contributor.troops -= troops;
    if (contributor.troops <= 0) {
      // Remove contributor if no troops left
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
 * Moves a request from one position to another.
 * Both positions are 1-based.
 */
export function moveRequest(
  guildId: string,
  fromPosition: number,
  toPosition: number
): MoveRequestResult {
  const data = getGuildDefenseData(guildId);
  const fromIndex = fromPosition - 1;
  const toIndex = toPosition - 1;

  if (fromIndex < 0 || fromIndex >= data.requests.length) {
    return { success: false, error: `Užklausa #${fromPosition} nerasta.` };
  }

  if (toIndex < 0 || toIndex >= data.requests.length) {
    return { success: false, error: `Pozicija #${toPosition} neegzistuoja.` };
  }

  if (fromIndex === toIndex) {
    return { success: false, error: "Abi pozicijos yra vienodos." };
  }

  // Remove the request from its current position
  const [request] = data.requests.splice(fromIndex, 1);
  // Insert it at the new position
  data.requests.splice(toIndex, 0, request);

  saveGuildData(guildId, data);
  return { success: true };
}
