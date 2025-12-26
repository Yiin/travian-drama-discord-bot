import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const REQUESTS_FILE = path.join(DATA_DIR, "push-requests.json");

export const MAX_PUSH_REQUESTS = 20;

export interface PushContributor {
  accountName: string; // In-game account name, NOT Discord userId
  resources: number;
}

export interface PushRequest {
  x: number;
  y: number;
  resourcesSent: number;
  resourcesNeeded: number;
  requesterId: string; // Discord userId who created
  requesterAccount: string; // In-game account name
  createdAt: number;
  completed: boolean; // true when resourcesSent >= resourcesNeeded
  contributors: PushContributor[];
  channelId?: string; // Discord channel ID for this push request
  messageId?: string; // Discord message ID for the embed in the channel
}

export interface GuildPushData {
  requests: PushRequest[];
}

type AllGuildData = Record<string, GuildPushData>;

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

function getDefaultGuildData(): GuildPushData {
  return {
    requests: [],
  };
}

export function getGuildPushData(guildId: string): GuildPushData {
  const allData = loadAllData();
  return allData[guildId] || getDefaultGuildData();
}

function saveGuildData(guildId: string, data: GuildPushData): void {
  const allData = loadAllData();
  allData[guildId] = data;
  saveAllData(allData);
}

export function updatePushRequestChannelInfo(
  guildId: string,
  requestId: number,
  channelId: string,
  messageId: string
): void {
  const data = getGuildPushData(guildId);
  const index = requestId - 1; // Convert 1-based to 0-based
  if (index >= 0 && index < data.requests.length) {
    data.requests[index].channelId = channelId;
    data.requests[index].messageId = messageId;
    saveGuildData(guildId, data);
  }
}

export function getPushRequestByChannelId(
  guildId: string,
  channelId: string
): { request: PushRequest; requestId: number } | undefined {
  const data = getGuildPushData(guildId);
  for (let i = 0; i < data.requests.length; i++) {
    if (data.requests[i].channelId === channelId) {
      return { request: data.requests[i], requestId: i + 1 };
    }
  }
  return undefined;
}

export interface AddPushRequestResult {
  request: PushRequest;
  requestId: number; // 1-based position ID
}

export function addPushRequest(
  guildId: string,
  x: number,
  y: number,
  resourcesNeeded: number,
  requesterId: string,
  requesterAccount: string
): AddPushRequestResult | { error: string } {
  const data = getGuildPushData(guildId);

  // Check max requests limit
  if (data.requests.length >= MAX_PUSH_REQUESTS) {
    return { error: `Pasiektas maksimalus užklausų limitas (${MAX_PUSH_REQUESTS}).` };
  }

  // Create new request
  const newRequest: PushRequest = {
    x,
    y,
    resourcesSent: 0,
    resourcesNeeded,
    requesterId,
    requesterAccount,
    createdAt: Date.now(),
    completed: false,
    contributors: [],
  };

  data.requests.push(newRequest);
  saveGuildData(guildId, data);

  return { request: newRequest, requestId: data.requests.length };
}

export function getPushRequestById(
  guildId: string,
  requestId: number
): PushRequest | undefined {
  const data = getGuildPushData(guildId);
  // IDs are 1-based, so convert to 0-based index
  return data.requests[requestId - 1];
}

export function getPushRequestsByCoords(
  guildId: string,
  x: number,
  y: number
): { request: PushRequest; requestId: number }[] {
  const data = getGuildPushData(guildId);
  const results: { request: PushRequest; requestId: number }[] = [];
  data.requests.forEach((r, index) => {
    if (r.x === x && r.y === y) {
      results.push({ request: r, requestId: index + 1 });
    }
  });
  return results;
}

export interface ReportResourcesResult {
  request: PushRequest;
  isComplete: boolean;
  wasAlreadyComplete: boolean;
}

export function reportResourcesSent(
  guildId: string,
  requestId: number,
  accountName: string,
  resources: number
): ReportResourcesResult | { error: string } {
  const data = getGuildPushData(guildId);
  // IDs are 1-based, convert to 0-based index
  const index = requestId - 1;
  const request = data.requests[index];

  if (!request) {
    return { error: `Užklausa #${requestId} nerasta.` };
  }

  const wasAlreadyComplete = request.completed;

  // Add to contributors
  const existingContributor = request.contributors.find(
    (c) => c.accountName === accountName
  );
  if (existingContributor) {
    existingContributor.resources += resources;
  } else {
    request.contributors.push({ accountName, resources });
  }

  // Update total resources sent
  request.resourcesSent += resources;

  // Mark as complete if threshold reached (but don't remove)
  const isComplete = request.resourcesSent >= request.resourcesNeeded;
  if (isComplete && !wasAlreadyComplete) {
    request.completed = true;
  }

  saveGuildData(guildId, data);

  return { request, isComplete, wasAlreadyComplete };
}

export interface UpdatePushRequestOptions {
  resourcesNeeded?: number;
}

export function updatePushRequest(
  guildId: string,
  requestId: number,
  updates: UpdatePushRequestOptions
): PushRequest | { error: string } {
  const data = getGuildPushData(guildId);
  // IDs are 1-based, convert to 0-based index
  const index = requestId - 1;
  const request = data.requests[index];

  if (!request) {
    return { error: `Užklausa #${requestId} nerasta.` };
  }

  if (updates.resourcesNeeded !== undefined) {
    request.resourcesNeeded = updates.resourcesNeeded;
    // Update completed status based on new threshold
    request.completed = request.resourcesSent >= request.resourcesNeeded;
  }

  saveGuildData(guildId, data);
  return request;
}

export function removePushRequest(
  guildId: string,
  requestId: number
): PushRequest | null {
  const data = getGuildPushData(guildId);
  // IDs are 1-based, convert to 0-based index
  const index = requestId - 1;

  if (index < 0 || index >= data.requests.length) {
    return null;
  }

  const [removed] = data.requests.splice(index, 1);
  saveGuildData(guildId, data);
  return removed;
}

export function getAllPushRequests(guildId: string): PushRequest[] {
  return getGuildPushData(guildId).requests;
}

// --- Undo support functions ---

export interface SubtractResourcesResult {
  success: boolean;
  request?: PushRequest;
  error?: string;
}

/**
 * Subtracts resources from a request by requestId (reverse of reportResourcesSent).
 * Also updates the contributor's total.
 */
export function subtractResources(
  guildId: string,
  requestId: number,
  accountName: string,
  resources: number
): SubtractResourcesResult {
  const data = getGuildPushData(guildId);
  const index = requestId - 1; // Convert 1-based to 0-based

  if (index < 0 || index >= data.requests.length) {
    return { success: false, error: "Užklausa nerasta." };
  }

  const request = data.requests[index];

  // Subtract from total
  request.resourcesSent = Math.max(0, request.resourcesSent - resources);

  // Update completed status
  request.completed = request.resourcesSent >= request.resourcesNeeded;

  // Update contributor
  const contributor = request.contributors.find((c) => c.accountName === accountName);
  if (contributor) {
    contributor.resources -= resources;
    if (contributor.resources <= 0) {
      // Remove contributor if no resources left
      request.contributors = request.contributors.filter(
        (c) => c.accountName !== accountName
      );
    }
  }

  saveGuildData(guildId, data);
  return { success: true, request };
}

export interface RestorePushRequestResult {
  success: boolean;
  requestId?: number;
  error?: string;
}

/**
 * Restores a push request from a previous state (for undo support).
 * Appends to the end of the requests list.
 */
export function restorePushRequest(
  guildId: string,
  request: PushRequest
): RestorePushRequestResult {
  const data = getGuildPushData(guildId);

  // Check max requests limit
  if (data.requests.length >= MAX_PUSH_REQUESTS) {
    return {
      success: false,
      error: `Pasiektas maksimalus užklausų limitas (${MAX_PUSH_REQUESTS}).`,
    };
  }

  // Create a copy of the request with its contributors
  const restoredRequest: PushRequest = {
    ...request,
    contributors: [...request.contributors],
  };

  data.requests.push(restoredRequest);
  saveGuildData(guildId, data);

  return {
    success: true,
    requestId: data.requests.length, // 1-based ID
  };
}
