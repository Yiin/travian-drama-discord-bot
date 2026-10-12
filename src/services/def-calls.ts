import fs from "fs";
import path from "path";
import { expireActionHistory } from "./history-expiry";
import { parseScopeKey, Scope, scopeKey } from "../config/scope";

const DATA_DIR = path.join(process.cwd(), "data");
const DEF_CALLS_FILE = path.join(DATA_DIR, "def-calls.json");

export interface DefCallContributor {
  accountName: string;
  troops: number;
}

export interface DefCallRequest {
  /** Stable per-guild id. Never changes, never reused. Shown to users as `#17`. */
  id: number;
  x: number;
  y: number;
  landingAt: number;
  comment?: string;
  troopsNeeded?: number;
  requesterId: string;
  requesterAccount: string;
  troopsSent: number;
  contributors: DefCallContributor[];
  channelId?: string;
  messageId?: string;
  summaryMessageId?: string;
  createdAt: number;
  closed: boolean;
  /** Set by the landing scheduler once `landingAt` has passed. */
  landed?: boolean;
}

export interface GuildDefCalls {
  nextId: number;
  requests: DefCallRequest[];
  hubButtonMessageId?: string;
}

type AllGuildData = Record<string, GuildDefCalls>;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllData(): AllGuildData {
  ensureDataDir();
  if (!fs.existsSync(DEF_CALLS_FILE)) {
    return {};
  }
  const data: AllGuildData = JSON.parse(fs.readFileSync(DEF_CALLS_FILE, "utf-8"));
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
  fs.writeFileSync(DEF_CALLS_FILE, JSON.stringify(data, null, 2));
}

/** Read the store once so id migration runs at boot, before any command. */
export function ensureMigrated(): void {
  loadAllData();
}

function getDefaultGuildData(): GuildDefCalls {
  return { nextId: 1, requests: [] };
}

export function getGuildDefCalls(scope: Scope): GuildDefCalls {
  const allData = loadAllData();
  return allData[scopeKey(scope)] || getDefaultGuildData();
}

function saveGuildData(scope: Scope, data: GuildDefCalls): void {
  const allData = loadAllData();
  allData[scopeKey(scope)] = data;
  saveAllData(allData);
}

function findById(data: GuildDefCalls, requestId: number): DefCallRequest | undefined {
  return data.requests.find((r) => r.id === requestId);
}

export interface AddDefCallResult {
  request: DefCallRequest;
  requestId: number;
}

export function addRequest(
  scope: Scope,
  x: number,
  y: number,
  landingAt: number,
  requesterId: string,
  requesterAccount: string,
  comment?: string,
  troopsNeeded?: number
): AddDefCallResult {
  const data = getGuildDefCalls(scope);

  const newRequest: DefCallRequest = {
    id: data.nextId++,
    x,
    y,
    landingAt,
    comment: comment || undefined,
    troopsNeeded,
    requesterId,
    requesterAccount,
    troopsSent: 0,
    contributors: [],
    createdAt: Date.now(),
    closed: false,
  };

  data.requests.push(newRequest);
  saveGuildData(scope, data);
  return { request: newRequest, requestId: newRequest.id };
}

export function removeRequest(scope: Scope, requestId: number): void {
  const data = getGuildDefCalls(scope);
  const index = data.requests.findIndex((request) => request.id === requestId);
  if (index === -1) return;
  data.requests.splice(index, 1);
  saveGuildData(scope, data);
}

export function getRequestById(
  scope: Scope,
  requestId: number
): DefCallRequest | undefined {
  return findById(getGuildDefCalls(scope), requestId);
}

export function getRequestByChannelId(
  scope: Scope,
  channelId: string
): { request: DefCallRequest; requestId: number } | undefined {
  const request = getGuildDefCalls(scope).requests.find((r) => r.channelId === channelId);
  return request ? { request, requestId: request.id } : undefined;
}

export interface ReportTroopsResult {
  request: DefCallRequest;
  contribution: DefCallContributor;
}

export function reportTroopsSent(
  scope: Scope,
  requestId: number,
  accountName: string,
  troops: number
): ReportTroopsResult | { error: string } {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (!request) {
    return { error: `Request #${requestId} not found.` };
  }

  const existing = request.contributors.find((c) => c.accountName === accountName);
  if (existing) {
    existing.troops += troops;
  } else {
    request.contributors.push({ accountName, troops });
  }
  request.troopsSent += troops;

  saveGuildData(scope, data);

  const contribution = request.contributors.find((c) => c.accountName === accountName)!;
  return { request, contribution };
}

export interface SubtractTroopsResult {
  success: boolean;
  request?: DefCallRequest;
  error?: string;
}

export function subtractTroops(
  scope: Scope,
  requestId: number,
  accountName: string,
  troops: number
): SubtractTroopsResult {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (!request) {
    return { success: false, error: "Request not found." };
  }
  request.troopsSent = Math.max(0, request.troopsSent - troops);
  const contributor = request.contributors.find((c) => c.accountName === accountName);
  if (contributor) {
    contributor.troops -= troops;
    if (contributor.troops <= 0) {
      request.contributors = request.contributors.filter(
        (c) => c.accountName !== accountName
      );
    }
  }
  saveGuildData(scope, data);
  return { success: true, request };
}

export function closeRequest(
  scope: Scope,
  requestId: number
): DefCallRequest | { error: string } {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (!request) {
    return { error: `Request #${requestId} not found.` };
  }
  request.closed = true;
  saveGuildData(scope, data);
  return request;
}

export function setLanded(scope: Scope, requestId: number, landed: boolean): DefCallRequest | undefined {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (!request) return undefined;
  request.landed = landed;
  saveGuildData(scope, data);
  return request;
}

export function reopenRequest(scope: Scope, requestId: number): DefCallRequest | { error: string } {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (!request) {
    return { error: `Request #${requestId} not found.` };
  }
  request.closed = false;
  saveGuildData(scope, data);
  return request;
}

export function restoreRequest(
  scope: Scope,
  requestId: number,
  state: DefCallRequest
): DefCallRequest | { error: string } {
  const data = getGuildDefCalls(scope);
  const index = data.requests.findIndex((r) => r.id === requestId);
  if (index === -1) {
    return { error: `Request #${requestId} not found.` };
  }
  data.requests[index] = {
    ...state,
    id: requestId,
    contributors: [...state.contributors],
  };
  saveGuildData(scope, data);
  return data.requests[index];
}

export function updateChannelInfo(
  scope: Scope,
  requestId: number,
  channelId: string,
  messageId: string
): void {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (request) {
    request.channelId = channelId;
    request.messageId = messageId;
    saveGuildData(scope, data);
  }
}

export function updateMessageId(
  scope: Scope,
  requestId: number,
  messageId: string
): void {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (request) {
    request.messageId = messageId;
    saveGuildData(scope, data);
  }
}

export function updateSummaryMessageId(
  scope: Scope,
  requestId: number,
  summaryMessageId: string | undefined
): void {
  const data = getGuildDefCalls(scope);
  const request = findById(data, requestId);
  if (request) {
    request.summaryMessageId = summaryMessageId;
    saveGuildData(scope, data);
  }
}

export function setHubButtonMessageId(
  scope: Scope,
  messageId: string | undefined
): void {
  const data = getGuildDefCalls(scope);
  data.hubButtonMessageId = messageId;
  saveGuildData(scope, data);
}

export function getHubButtonMessageId(scope: Scope): string | undefined {
  return getGuildDefCalls(scope).hubButtonMessageId;
}

export function getActiveRequests(
  scope: Scope
): { request: DefCallRequest; requestId: number }[] {
  return getGuildDefCalls(scope)
    .requests.filter((r) => !r.closed)
    .map((request) => ({ request, requestId: request.id }));
}

export function getAllRequests(scope: Scope): DefCallRequest[] {
  return getGuildDefCalls(scope).requests;
}

/** Every guild with def-call data; used by the landing scheduler on boot. */
export function getAllDefCallScopes(): Scope[] {
  return Object.keys(loadAllData()).map(parseScopeKey);
}
