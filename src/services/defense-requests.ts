import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const REQUESTS_FILE = path.join(DATA_DIR, "defense-requests.json");

const MAX_REQUESTS = 20;

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
  isUpdate: boolean;
  previousRequest?: DefenseRequest;
}

export function addOrUpdateRequest(
  guildId: string,
  x: number,
  y: number,
  troopsNeeded: number,
  message: string,
  requesterId: string
): AddRequestResult | { error: string } {
  const data = getGuildDefenseData(guildId);

  // Check if coordinates already exist
  const existingIndex = data.requests.findIndex(
    (r) => r.x === x && r.y === y
  );

  if (existingIndex !== -1) {
    // Update existing request
    const previousRequest = { ...data.requests[existingIndex] };
    data.requests[existingIndex] = {
      ...data.requests[existingIndex],
      troopsNeeded,
      message,
      requesterId,
      troopsSent: 0, // Reset troops sent on update
      contributors: [],
      createdAt: Date.now(),
    };
    saveGuildData(guildId, data);
    return {
      request: data.requests[existingIndex],
      requestId: existingIndex + 1, // 1-based position
      isUpdate: true,
      previousRequest,
    };
  }

  // Check max requests limit
  if (data.requests.length >= MAX_REQUESTS) {
    return { error: `Maximum of ${MAX_REQUESTS} active requests reached.` };
  }

  // Create new request
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

  return { request: newRequest, requestId: data.requests.length, isUpdate: false };
}

export function getRequestById(
  guildId: string,
  requestId: number
): DefenseRequest | undefined {
  const data = getGuildDefenseData(guildId);
  // IDs are 1-based, so convert to 0-based index
  return data.requests[requestId - 1];
}

export function getRequestByCoords(
  guildId: string,
  x: number,
  y: number
): { request: DefenseRequest; requestId: number } | undefined {
  const data = getGuildDefenseData(guildId);
  const index = data.requests.findIndex((r) => r.x === x && r.y === y);
  if (index === -1) return undefined;
  return { request: data.requests[index], requestId: index + 1 };
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
