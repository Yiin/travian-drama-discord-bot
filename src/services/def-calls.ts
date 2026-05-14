import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DEF_CALLS_FILE = path.join(DATA_DIR, "def-calls.json");

export interface DefCallContributor {
  accountName: string;
  troops: number;
}

export interface DefCallRequest {
  x: number;
  y: number;
  landingAt: number;
  comment?: string;
  requesterId: string;
  requesterAccount: string;
  troopsSent: number;
  contributors: DefCallContributor[];
  channelId?: string;
  messageId?: string;
  summaryMessageId?: string;
  createdAt: number;
  closed: boolean;
}

export interface GuildDefCalls {
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
  const data = fs.readFileSync(DEF_CALLS_FILE, "utf-8");
  return JSON.parse(data);
}

function saveAllData(data: AllGuildData): void {
  ensureDataDir();
  fs.writeFileSync(DEF_CALLS_FILE, JSON.stringify(data, null, 2));
}

function getDefaultGuildData(): GuildDefCalls {
  return { requests: [] };
}

export function getGuildDefCalls(guildId: string): GuildDefCalls {
  const allData = loadAllData();
  return allData[guildId] || getDefaultGuildData();
}

function saveGuildData(guildId: string, data: GuildDefCalls): void {
  const allData = loadAllData();
  allData[guildId] = data;
  saveAllData(allData);
}

export interface AddDefCallResult {
  request: DefCallRequest;
  requestId: number;
}

export function addRequest(
  guildId: string,
  x: number,
  y: number,
  landingAt: number,
  requesterId: string,
  requesterAccount: string,
  comment?: string
): AddDefCallResult {
  const data = getGuildDefCalls(guildId);

  const newRequest: DefCallRequest = {
    x,
    y,
    landingAt,
    comment: comment || undefined,
    requesterId,
    requesterAccount,
    troopsSent: 0,
    contributors: [],
    createdAt: Date.now(),
    closed: false,
  };

  data.requests.push(newRequest);
  saveGuildData(guildId, data);
  return { request: newRequest, requestId: data.requests.length };
}

export function getRequestById(
  guildId: string,
  requestId: number
): DefCallRequest | undefined {
  const data = getGuildDefCalls(guildId);
  return data.requests[requestId - 1];
}

export function getRequestByChannelId(
  guildId: string,
  channelId: string
): { request: DefCallRequest; requestId: number } | undefined {
  const data = getGuildDefCalls(guildId);
  for (let i = 0; i < data.requests.length; i++) {
    if (data.requests[i].channelId === channelId) {
      return { request: data.requests[i], requestId: i + 1 };
    }
  }
  return undefined;
}

export interface ReportTroopsResult {
  request: DefCallRequest;
  contribution: DefCallContributor;
}

export function reportTroopsSent(
  guildId: string,
  requestId: number,
  accountName: string,
  troops: number
): ReportTroopsResult | { error: string } {
  const data = getGuildDefCalls(guildId);
  const index = requestId - 1;
  const request = data.requests[index];
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

  saveGuildData(guildId, data);

  const contribution = request.contributors.find((c) => c.accountName === accountName)!;
  return { request, contribution };
}

export interface SubtractTroopsResult {
  success: boolean;
  request?: DefCallRequest;
  error?: string;
}

export function subtractTroops(
  guildId: string,
  requestId: number,
  accountName: string,
  troops: number
): SubtractTroopsResult {
  const data = getGuildDefCalls(guildId);
  const index = requestId - 1;
  if (index < 0 || index >= data.requests.length) {
    return { success: false, error: "Request not found." };
  }
  const request = data.requests[index];
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
  saveGuildData(guildId, data);
  return { success: true, request };
}

export function closeRequest(
  guildId: string,
  requestId: number
): DefCallRequest | { error: string } {
  const data = getGuildDefCalls(guildId);
  const index = requestId - 1;
  const request = data.requests[index];
  if (!request) {
    return { error: `Request #${requestId} not found.` };
  }
  request.closed = true;
  saveGuildData(guildId, data);
  return request;
}

export function restoreRequest(
  guildId: string,
  requestId: number,
  state: DefCallRequest
): DefCallRequest | { error: string } {
  const data = getGuildDefCalls(guildId);
  const index = requestId - 1;
  if (index < 0 || index >= data.requests.length) {
    return { error: `Request #${requestId} not found.` };
  }
  data.requests[index] = {
    ...state,
    contributors: [...state.contributors],
  };
  saveGuildData(guildId, data);
  return data.requests[index];
}

export function updateChannelInfo(
  guildId: string,
  requestId: number,
  channelId: string,
  messageId: string
): void {
  const data = getGuildDefCalls(guildId);
  const index = requestId - 1;
  if (index >= 0 && index < data.requests.length) {
    data.requests[index].channelId = channelId;
    data.requests[index].messageId = messageId;
    saveGuildData(guildId, data);
  }
}

export function updateMessageId(
  guildId: string,
  requestId: number,
  messageId: string
): void {
  const data = getGuildDefCalls(guildId);
  const index = requestId - 1;
  if (index >= 0 && index < data.requests.length) {
    data.requests[index].messageId = messageId;
    saveGuildData(guildId, data);
  }
}

export function updateSummaryMessageId(
  guildId: string,
  requestId: number,
  summaryMessageId: string | undefined
): void {
  const data = getGuildDefCalls(guildId);
  const index = requestId - 1;
  if (index >= 0 && index < data.requests.length) {
    data.requests[index].summaryMessageId = summaryMessageId;
    saveGuildData(guildId, data);
  }
}

export function setHubButtonMessageId(
  guildId: string,
  messageId: string | undefined
): void {
  const data = getGuildDefCalls(guildId);
  data.hubButtonMessageId = messageId;
  saveGuildData(guildId, data);
}

export function getHubButtonMessageId(guildId: string): string | undefined {
  const data = getGuildDefCalls(guildId);
  return data.hubButtonMessageId;
}

export function getActiveRequests(
  guildId: string
): { request: DefCallRequest; requestId: number }[] {
  const data = getGuildDefCalls(guildId);
  const result: { request: DefCallRequest; requestId: number }[] = [];
  for (let i = 0; i < data.requests.length; i++) {
    if (!data.requests[i].closed) {
      result.push({ request: data.requests[i], requestId: i + 1 });
    }
  }
  return result;
}

export function getAllRequests(guildId: string): DefCallRequest[] {
  return getGuildDefCalls(guildId).requests;
}
