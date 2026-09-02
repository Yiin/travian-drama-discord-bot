import fs from "fs";
import path from "path";
import { expireActionHistory } from "./history-expiry";

const DATA_DIR = path.join(process.cwd(), "data");
const REQUESTS_FILE = path.join(DATA_DIR, "push-requests.json");

export const MAX_PUSH_REQUESTS = 20;

export interface PushContributor {
  accountName: string; // In-game account name, NOT Discord userId
  resources: number;
}

export interface PushRequest {
  /** Stable per-guild id. Never changes, never reused. Shown to users as `#9`. */
  id: number;
  x: number;
  y: number;
  resourcesSent: number;
  resourcesNeeded: number;
  requesterId: string; // Discord userId who created
  requesterAccount: string; // In-game account name
  createdAt: number;
  completed: boolean; // true when resourcesSent >= resourcesNeeded
  /** Closed by the requester or an admin; the thread is archived, the data stays. */
  closed?: boolean;
  contributors: PushContributor[];
  channelId?: string; // Discord channel ID for this push request
  messageId?: string; // Discord message ID for the embed in the channel
}

export interface GuildPushData {
  nextId: number;
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
  const data: AllGuildData = JSON.parse(fs.readFileSync(REQUESTS_FILE, "utf-8"));
  if (migrateIds(data)) {
    saveAllData(data);
  }
  return data;
}

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

function getDefaultGuildData(): GuildPushData {
  return {
    nextId: 1,
    requests: [],
  };
}

function findById(data: GuildPushData, requestId: number): PushRequest | undefined {
  return data.requests.find((r) => r.id === requestId);
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
  const request = findById(data, requestId);
  if (request) {
    request.channelId = channelId;
    request.messageId = messageId;
    saveGuildData(guildId, data);
  }
}

export function getPushRequestByChannelId(
  guildId: string,
  channelId: string
): { request: PushRequest; requestId: number } | undefined {
  const request = getGuildPushData(guildId).requests.find((r) => r.channelId === channelId);
  return request ? { request, requestId: request.id } : undefined;
}

export interface AddPushRequestResult {
  request: PushRequest;
  requestId: number;
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
    return { error: `Maximum request limit reached (${MAX_PUSH_REQUESTS}).` };
  }

  // Create new request
  const newRequest: PushRequest = {
    id: data.nextId++,
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

  return { request: newRequest, requestId: newRequest.id };
}

export function getPushRequestById(
  guildId: string,
  requestId: number
): PushRequest | undefined {
  return findById(getGuildPushData(guildId), requestId);
}

export function getPushRequestsByCoords(
  guildId: string,
  x: number,
  y: number
): { request: PushRequest; requestId: number }[] {
  return getGuildPushData(guildId)
    .requests.filter((r) => r.x === x && r.y === y)
    .map((request) => ({ request, requestId: request.id }));
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
  const request = findById(data, requestId);

  if (!request) {
    return { error: `Request #${requestId} not found.` };
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
  const request = findById(data, requestId);

  if (!request) {
    return { error: `Request #${requestId} not found.` };
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
  const index = data.requests.findIndex((r) => r.id === requestId);

  if (index === -1) {
    return null;
  }

  const [removed] = data.requests.splice(index, 1);
  saveGuildData(guildId, data);
  return removed;
}

export function setPushRequestClosed(
  guildId: string,
  requestId: number,
  closed: boolean
): PushRequest | null {
  const data = getGuildPushData(guildId);
  const request = findById(data, requestId);
  if (!request) return null;
  request.closed = closed;
  saveGuildData(guildId, data);
  return request;
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
  const request = findById(data, requestId);

  if (!request) {
    return { success: false, error: "Request not found." };
  }

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
      error: `Maximum request limit reached (${MAX_PUSH_REQUESTS}).`,
    };
  }

  // Keep the id unless it is active again
  const idTaken = request.id === undefined || findById(data, request.id) !== undefined;
  const restoredRequest: PushRequest = {
    ...request,
    id: idTaken ? data.nextId++ : request.id,
    contributors: [...request.contributors],
  };
  data.nextId = Math.max(data.nextId, restoredRequest.id + 1);

  data.requests.push(restoredRequest);
  saveGuildData(guildId, data);

  return {
    success: true,
    requestId: restoredRequest.id,
  };
}

// --- Update contributor resources ---

export interface UpdateContributorResult {
  success: boolean;
  request?: PushRequest;
  previousAmount?: number;
  error?: string;
}

/**
 * Set a contributor's resources to a specific amount.
 * Updates the request's total resourcesSent accordingly.
 */
export function updateContributorResources(
  guildId: string,
  requestId: number,
  accountName: string,
  newAmount: number
): UpdateContributorResult {
  const data = getGuildPushData(guildId);
  const request = findById(data, requestId);

  if (!request) {
    return { success: false, error: "Request not found." };
  }

  const contributor = request.contributors.find((c) => c.accountName === accountName);

  if (!contributor) {
    return { success: false, error: `Contributor "${accountName}" was not found.` };
  }

  const previousAmount = contributor.resources;
  const diff = newAmount - previousAmount;

  // Update contributor amount
  contributor.resources = newAmount;

  // Update total resourcesSent
  request.resourcesSent += diff;

  // Remove contributor if amount becomes 0 or negative
  if (newAmount <= 0) {
    request.contributors = request.contributors.filter((c) => c.accountName !== accountName);
  }

  // Update completed status
  request.completed = request.resourcesSent >= request.resourcesNeeded;

  saveGuildData(guildId, data);
  return { success: true, request, previousAmount };
}

// --- Transfer contribution ---

export interface TransferContributionResult {
  success: boolean;
  request?: PushRequest;
  transferredAmount?: number;
  error?: string;
}

/**
 * Transfer all resources from one contributor to another.
 * The source contributor is removed after transfer.
 */
/**
 * Rename all occurrences of an account name in push requests
 * (both as requester and as contributor)
 */
export function renameAccountInPushRequests(
  guildId: string,
  oldName: string,
  newName: string
): number {
  const data = getGuildPushData(guildId);
  let count = 0;

  for (const request of data.requests) {
    // Rename requester account
    if (request.requesterAccount === oldName) {
      request.requesterAccount = newName;
      count++;
    }

    // Rename in contributors
    for (const contributor of request.contributors) {
      if (contributor.accountName === oldName) {
        contributor.accountName = newName;
        count++;
      }
    }
  }

  if (count > 0) {
    saveGuildData(guildId, data);
  }
  return count;
}

export function transferContribution(
  guildId: string,
  requestId: number,
  fromAccount: string,
  toAccount: string
): TransferContributionResult {
  const data = getGuildPushData(guildId);
  const request = findById(data, requestId);

  if (!request) {
    return { success: false, error: "Request not found." };
  }

  const fromContributor = request.contributors.find((c) => c.accountName === fromAccount);

  if (!fromContributor) {
    return { success: false, error: `Contributor "${fromAccount}" was not found.` };
  }

  if (fromAccount === toAccount) {
    return { success: false, error: "Cannot transfer to the same player." };
  }

  const transferredAmount = fromContributor.resources;

  // Find or create target contributor
  let toContributor = request.contributors.find((c) => c.accountName === toAccount);
  if (toContributor) {
    toContributor.resources += transferredAmount;
  } else {
    request.contributors.push({ accountName: toAccount, resources: transferredAmount });
  }

  // Remove source contributor
  request.contributors = request.contributors.filter((c) => c.accountName !== fromAccount);

  saveGuildData(guildId, data);
  return { success: true, request, transferredAmount };
}
