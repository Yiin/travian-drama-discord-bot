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
  requests: DefenseRequest[];
  nextId: number;
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
    nextId: 1,
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
    id: data.nextId,
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
  data.nextId++;
  saveGuildData(guildId, data);

  return { request: newRequest, isUpdate: false };
}

export function getRequestById(
  guildId: string,
  requestId: number
): DefenseRequest | undefined {
  const data = getGuildDefenseData(guildId);
  return data.requests.find((r) => r.id === requestId);
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
  const request = data.requests.find((r) => r.id === requestId);

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
    data.requests = data.requests.filter((r) => r.id !== requestId);
    // Add to recently completed
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
  const request = data.requests.find((r) => r.id === requestId);

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
    data.requests = data.requests.filter((r) => r.id !== requestId);
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
  const initialLength = data.requests.length;
  data.requests = data.requests.filter((r) => r.id !== requestId);

  if (data.requests.length < initialLength) {
    saveGuildData(guildId, data);
    return true;
  }
  return false;
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
