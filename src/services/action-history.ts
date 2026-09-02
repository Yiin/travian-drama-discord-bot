import fs from "fs";
import path from "path";
import {
  DefenseRequest,
  getRequestById,
  restoreRequest,
  removeRequest,
  subtractTroops,
} from "./defense-requests";
import {
  PushRequest,
  getPushRequestById,
  removePushRequest,
  subtractResources,
  restorePushRequest,
} from "./push-requests";
import {
  DefCallRequest,
  getRequestById as getDefCallRequestById,
  subtractTroops as subtractDefCallTroops,
  restoreRequest as restoreDefCallRequest,
  closeRequest as closeDefCallRequestById,
} from "./def-calls";
import { formatResources, formatTroops } from "../utils/format";

const DATA_DIR = path.join(process.cwd(), "data");
const HISTORY_FILE = path.join(DATA_DIR, "action-history.json");

const MAX_ACTIONS = 50;

export type ActionType =
  | "DEF_ADD"
  | "DEF_UPDATE"
  | "TROOPS_SENT"
  | "REQUEST_DELETED"
  | "ADMIN_UPDATE"
  // Push action types
  | "PUSH_REQUEST_ADD"
  | "PUSH_RESOURCES_SENT"
  | "PUSH_REQUEST_DELETED"
  | "PUSH_REQUEST_EDIT"
  | "PUSH_CONTRIBUTION_EDIT"
  | "PUSH_CONTRIBUTION_TRANSFER"
  // Def call action types
  | "DEF_CALL_REQUEST_ADD"
  | "DEF_CALL_TROOPS_SENT"
  | "DEF_CALL_CLOSED";

export interface ActionData {
  troops?: number;
  troopsNeeded?: number;
  message?: string;
  contributorId?: string;
  didComplete?: boolean;
  // For ADMIN_UPDATE - store previous values
  previousTroopsSent?: number;
  previousTroopsNeeded?: number;
  previousMessage?: string;
  adminDidComplete?: boolean;
  // For push actions
  resources?: number;
  resourcesNeeded?: number;
  contributorAccount?: string; // In-game account name for push
  pushDidComplete?: boolean;
  previousResourcesNeeded?: number; // For PUSH_REQUEST_EDIT
  channelId?: string; // For channel-based push requests
  // For PUSH_CONTRIBUTION_EDIT
  accountName?: string;
  oldAmount?: number;
  newAmount?: number;
  // For PUSH_CONTRIBUTION_TRANSFER
  fromAccount?: string;
  toAccount?: string;
  transferredAmount?: number;
}

export interface Action {
  id: number;
  type: ActionType;
  userId: string;
  timestamp: number;
  coords: { x: number; y: number };
  requestId: number; // 1-based position ID at time of action
  previousState?: DefenseRequest;
  previousPushState?: PushRequest; // For push actions
  previousDefCallState?: DefCallRequest;
  data: ActionData;
  undone: boolean;
}

export interface GuildActionHistory {
  nextId: number;
  actions: Action[];
  /** Text-command messages that produced actions, keyed by message ID. */
  messageActions?: Record<string, MessageActions>;
}

/** Actions a single text-command message produced, plus the content that produced them. */
export interface MessageActions {
  content: string;
  actionIds: number[];
}

type AllHistoryData = Record<string, GuildActionHistory>;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllHistory(): AllHistoryData {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return {};
  }
  const data = fs.readFileSync(HISTORY_FILE, "utf-8");
  return JSON.parse(data);
}

function saveAllHistory(data: AllHistoryData): void {
  ensureDataDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function getDefaultGuildHistory(): GuildActionHistory {
  return {
    nextId: 1,
    actions: [],
  };
}

export function getGuildHistory(guildId: string): GuildActionHistory {
  const allData = loadAllHistory();
  return allData[guildId] || getDefaultGuildHistory();
}

function saveGuildHistory(guildId: string, history: GuildActionHistory): void {
  const allData = loadAllHistory();
  allData[guildId] = history;
  saveAllHistory(allData);
}

export interface RecordActionInput {
  type: ActionType;
  userId: string;
  coords: { x: number; y: number };
  requestId: number; // 1-based position ID at time of action
  previousState?: DefenseRequest;
  previousPushState?: PushRequest; // For push actions
  previousDefCallState?: DefCallRequest;
  data: ActionData;
}

export function recordAction(
  guildId: string,
  input: RecordActionInput
): number {
  const history = getGuildHistory(guildId);

  const action: Action = {
    id: history.nextId,
    type: input.type,
    userId: input.userId,
    timestamp: Date.now(),
    coords: input.coords,
    requestId: input.requestId,
    previousState: input.previousState
      ? { ...input.previousState, contributors: [...input.previousState.contributors] }
      : undefined,
    previousPushState: input.previousPushState
      ? { ...input.previousPushState, contributors: [...input.previousPushState.contributors] }
      : undefined,
    previousDefCallState: input.previousDefCallState
      ? { ...input.previousDefCallState, contributors: [...input.previousDefCallState.contributors] }
      : undefined,
    data: { ...input.data },
    undone: false,
  };

  history.actions.push(action);
  history.nextId++;

  // Trim to MAX_ACTIONS (keep newest)
  if (history.actions.length > MAX_ACTIONS) {
    history.actions = history.actions.slice(-MAX_ACTIONS);
  }

  saveGuildHistory(guildId, history);
  return action.id;
}

export function getAction(guildId: string, actionId: number): Action | undefined {
  const history = getGuildHistory(guildId);
  return history.actions.find((a) => a.id === actionId);
}

export function getRecentActions(guildId: string, limit: number = 10): Action[] {
  const history = getGuildHistory(guildId);
  return history.actions.slice(-limit).reverse();
}

/** The most recent action that has not been undone yet. */
export function getLatestUndoableActionId(guildId: string): number | undefined {
  const history = getGuildHistory(guildId);
  for (let i = history.actions.length - 1; i >= 0; i--) {
    if (!history.actions[i].undone) return history.actions[i].id;
  }
  return undefined;
}

// --- Text-command message links ---
// Each message owns its own actions. Editing a message undoes those actions before the new content runs.

export function linkActionToMessage(
  guildId: string,
  messageId: string,
  content: string,
  actionId: number
): void {
  const history = getGuildHistory(guildId);
  history.messageActions ??= {};
  const entry = history.messageActions[messageId] ?? { content, actionIds: [] };
  entry.content = content;
  if (!entry.actionIds.includes(actionId)) entry.actionIds.push(actionId);
  history.messageActions[messageId] = entry;
  pruneMessageLinks(history);
  saveGuildHistory(guildId, history);
}

export function getMessageActions(guildId: string, messageId: string): MessageActions | undefined {
  return getGuildHistory(guildId).messageActions?.[messageId];
}

export function setMessageContent(guildId: string, messageId: string, content: string): void {
  const history = getGuildHistory(guildId);
  history.messageActions ??= {};
  const entry = history.messageActions[messageId] ?? { content, actionIds: [] };
  entry.content = content;
  history.messageActions[messageId] = entry;
  pruneMessageLinks(history);
  saveGuildHistory(guildId, history);
}

/** Drop links whose actions have all been trimmed from history. */
function pruneMessageLinks(history: GuildActionHistory): void {
  if (!history.messageActions) return;
  const live = new Set(history.actions.map((a) => a.id));
  for (const [messageId, entry] of Object.entries(history.messageActions)) {
    entry.actionIds = entry.actionIds.filter((id) => live.has(id));
    if (entry.actionIds.length === 0) delete history.messageActions[messageId];
  }
}

export function markUndone(guildId: string, actionId: number): boolean {
  const history = getGuildHistory(guildId);
  const action = history.actions.find((a) => a.id === actionId);
  if (!action) return false;
  action.undone = true;
  saveGuildHistory(guildId, history);
  return true;
}

// --- Undo action logic ---

export interface UndoResult {
  success: boolean;
  message: string;
  requestId?: number; // New request ID if request was restored
}

/**
 * Performs the undo operation for a given action.
 * Returns a result with success status and a message describing what happened.
 *
 * Note: Uses stored requestId for lookups, but position-based IDs may shift
 * when other requests are removed. We verify coordinates match before operating.
 */
export function undoAction(guildId: string, actionId: number): UndoResult {
  const action = getAction(guildId, actionId);

  if (!action) {
    return { success: false, message: `Action #${actionId} was not found.` };
  }

  if (action.undone) {
    return { success: false, message: `Action #${actionId} has already been undone.` };
  }

  const { x, y } = action.coords;
  const coordsStr = `(${x}|${y})`;

  switch (action.type) {
    case "DEF_ADD": {
      // Remove the request that was added using stored requestId
      // Verify coordinates match to handle shifted positions
      const existing = getRequestById(guildId, action.requestId);
      if (existing && existing.x === x && existing.y === y) {
        removeRequest(guildId, action.requestId);
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: defense request ${coordsStr} removed.`,
        };
      }
      markUndone(guildId, actionId);
      return {
        success: true,
        message: `Undone: request ${coordsStr} had already been removed or completed.`,
      };
    }

    case "DEF_UPDATE": {
      // Legacy: restore the previous state (no longer created but handle old history)
      if (!action.previousState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} has no previous state.`,
        };
      }

      const result = restoreRequest(guildId, action.previousState);
      markUndone(guildId, actionId);
      if (result.success) {
        return {
          success: true,
          message: `Undone: request ${coordsStr} restored as #${result.requestId}.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Failed to restore." };
    }

    case "TROOPS_SENT": {
      const { troops, contributorId, didComplete } = action.data;

      if (!troops || !contributorId) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} is missing required data.`,
        };
      }

      if (didComplete) {
        // Request was completed by this action - need to restore it
        if (!action.previousState) {
          markUndone(guildId, actionId);
          return {
            success: false,
            message: `Action #${actionId} has no previous state.`,
          };
        }

        // Restore the request
        const restoredRequest: DefenseRequest = {
          ...action.previousState,
          contributors: [...action.previousState.contributors],
        };

        const result = restoreRequest(guildId, restoredRequest);
        if (!result.success) {
          return { success: false, message: result.error || "Failed to restore." };
        }

        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: request ${coordsStr} restored as #${result.requestId} (${restoredRequest.troopsSent}/${restoredRequest.troopsNeeded}).`,
          requestId: result.requestId,
        };
      }

      // Request was NOT completed - subtract troops using stored requestId
      // Verify coordinates match to handle shifted positions
      const existing = getRequestById(guildId, action.requestId);
      if (!existing) {
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: request ${coordsStr} no longer exists.`,
        };
      }

      if (existing.x !== x || existing.y !== y) {
        // Position shifted, request at this ID is different now
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: request position changed, troops were not subtracted.`,
        };
      }

      const subtractResult = subtractTroops(guildId, action.requestId, contributorId, troops);
      markUndone(guildId, actionId);

      if (subtractResult.success && subtractResult.request) {
        return {
          success: true,
          message: `Undone: ${troops} troops subtracted from ${coordsStr}. Progress: ${subtractResult.request.troopsSent}/${subtractResult.request.troopsNeeded}.`,
          requestId: action.requestId,
        };
      }

      return {
        success: true,
        message: `Undone: ${troops} troops cancellation.`,
      };
    }

    case "REQUEST_DELETED": {
      // Restore the deleted request
      if (!action.previousState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} has no previous state.`,
        };
      }

      const result = restoreRequest(guildId, action.previousState);
      markUndone(guildId, actionId);

      if (result.success) {
        return {
          success: true,
          message: `Undone: request ${coordsStr} restored as #${result.requestId}.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Failed to restore." };
    }

    case "ADMIN_UPDATE": {
      // Restore previous field values
      if (!action.previousState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} has no previous state.`,
        };
      }

      const { adminDidComplete } = action.data;

      if (adminDidComplete) {
        // Request was completed by admin update - restore it
        const result = restoreRequest(guildId, action.previousState);
        markUndone(guildId, actionId);

        if (result.success) {
          return {
            success: true,
            message: `Undone: request ${coordsStr} restored as #${result.requestId}.`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Failed to restore." };
      }

      // Not completed - check if request still exists at stored position
      const existing = getRequestById(guildId, action.requestId);
      if (!existing || existing.x !== x || existing.y !== y) {
        // Request doesn't exist or position shifted - restore it
        const result = restoreRequest(guildId, action.previousState);
        markUndone(guildId, actionId);
        if (result.success) {
          return {
            success: true,
            message: `Undone: request ${coordsStr} restored as #${result.requestId}.`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Failed to restore." };
      }

      // Request still at same position - restore previous state
      // First remove, then restore to get the previous state
      removeRequest(guildId, action.requestId);
      const result = restoreRequest(guildId, action.previousState);
      markUndone(guildId, actionId);
      if (result.success) {
        return {
          success: true,
          message: `Undone: request ${coordsStr} restored to the previous state.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Failed to restore." };
    }

    // --- Push action undo cases ---

    case "PUSH_REQUEST_ADD": {
      // Remove the push request that was added
      const existing = getPushRequestById(guildId, action.requestId);
      if (existing && existing.x === x && existing.y === y) {
        removePushRequest(guildId, action.requestId);
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: push request ${coordsStr} removed.`,
        };
      }
      markUndone(guildId, actionId);
      return {
        success: true,
        message: `Undone: push request ${coordsStr} had already been removed.`,
      };
    }

    case "PUSH_RESOURCES_SENT": {
      const { resources, contributorAccount, pushDidComplete } = action.data;

      if (!resources || !contributorAccount) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} is missing required data.`,
        };
      }

      if (pushDidComplete) {
        // Request was completed by this action - need to restore it
        if (!action.previousPushState) {
          markUndone(guildId, actionId);
          return {
            success: false,
            message: `Action #${actionId} has no previous state.`,
          };
        }

        // Restore the request
        const restoredRequest: PushRequest = {
          ...action.previousPushState,
          contributors: [...action.previousPushState.contributors],
        };

        const result = restorePushRequest(guildId, restoredRequest);
        if (!result.success) {
          return { success: false, message: result.error || "Failed to restore." };
        }

        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: push request ${coordsStr} restored as #${result.requestId} (${restoredRequest.resourcesSent}/${restoredRequest.resourcesNeeded}).`,
          requestId: result.requestId,
        };
      }

      // Request was NOT completed - subtract resources
      const existing = getPushRequestById(guildId, action.requestId);
      if (!existing) {
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: push request ${coordsStr} no longer exists.`,
        };
      }

      if (existing.x !== x || existing.y !== y) {
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: push request position changed, resources were not subtracted.`,
        };
      }

      const subtractResult = subtractResources(guildId, action.requestId, contributorAccount, resources);
      markUndone(guildId, actionId);

      if (subtractResult.success && subtractResult.request) {
        return {
          success: true,
          message: `Undone: ${formatResources(resources)} resources subtracted from ${coordsStr}. Progress: ${subtractResult.request.resourcesSent}/${subtractResult.request.resourcesNeeded}.`,
          requestId: action.requestId,
        };
      }

      return {
        success: true,
        message: `Undone: ${formatResources(resources)} resources cancellation.`,
      };
    }

    case "PUSH_REQUEST_DELETED": {
      // Restore the deleted push request
      if (!action.previousPushState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} has no previous state.`,
        };
      }

      const result = restorePushRequest(guildId, action.previousPushState);
      markUndone(guildId, actionId);

      if (result.success) {
        return {
          success: true,
          message: `Undone: push request ${coordsStr} restored as #${result.requestId}.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Failed to restore." };
    }

    case "PUSH_REQUEST_EDIT": {
      // Restore previous resource amount
      if (!action.previousPushState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} has no previous state.`,
        };
      }

      const existing = getPushRequestById(guildId, action.requestId);
      if (!existing || existing.x !== x || existing.y !== y) {
        // Request doesn't exist or position shifted - restore it
        const result = restorePushRequest(guildId, action.previousPushState);
        markUndone(guildId, actionId);
        if (result.success) {
          return {
            success: true,
            message: `Undone: push request ${coordsStr} restored as #${result.requestId}.`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Failed to restore." };
      }

      // Request still at same position - restore previous state
      removePushRequest(guildId, action.requestId);
      const result = restorePushRequest(guildId, action.previousPushState);
      markUndone(guildId, actionId);
      if (result.success) {
        return {
          success: true,
          message: `Undone: push request ${coordsStr} restored to the previous state.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Failed to restore." };
    }

    case "PUSH_CONTRIBUTION_EDIT":
    case "PUSH_CONTRIBUTION_TRANSFER": {
      // Restore previous contributor state
      if (!action.previousPushState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} has no previous state.`,
        };
      }

      const existing = getPushRequestById(guildId, action.requestId);
      if (!existing || existing.x !== x || existing.y !== y) {
        // Request doesn't exist or position shifted - restore it
        const result = restorePushRequest(guildId, action.previousPushState);
        markUndone(guildId, actionId);
        if (result.success) {
          return {
            success: true,
            message: `Undone: push request ${coordsStr} restored as #${result.requestId}.`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Failed to restore." };
      }

      // Request still at same position - restore previous state
      removePushRequest(guildId, action.requestId);
      const resultRestore = restorePushRequest(guildId, action.previousPushState);
      markUndone(guildId, actionId);
      if (resultRestore.success) {
        return {
          success: true,
          message: `Undone: push request ${coordsStr} restored to the previous state.`,
          requestId: resultRestore.requestId,
        };
      }
      return { success: false, message: resultRestore.error || "Failed to restore." };
    }

    // --- Def call action undo cases ---

    case "DEF_CALL_REQUEST_ADD": {
      const existing = getDefCallRequestById(guildId, action.requestId);
      if (existing && existing.x === x && existing.y === y) {
        closeDefCallRequestById(guildId, action.requestId);
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: defense request ${coordsStr} closed.`,
        };
      }
      markUndone(guildId, actionId);
      return {
        success: true,
        message: `Undone: defense request ${coordsStr} is already closed.`,
      };
    }

    case "DEF_CALL_TROOPS_SENT": {
      const { troops, contributorAccount } = action.data;
      if (!troops || !contributorAccount) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} is missing required data.`,
        };
      }

      const existing = getDefCallRequestById(guildId, action.requestId);
      if (!existing) {
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Undone: request ${coordsStr} no longer exists.`,
        };
      }

      if (action.previousDefCallState) {
        restoreDefCallRequest(guildId, action.requestId, action.previousDefCallState);
      } else {
        subtractDefCallTroops(guildId, action.requestId, contributorAccount, troops);
      }
      markUndone(guildId, actionId);
      return {
        success: true,
        message: `Undone: ${formatTroops(troops)} troops subtracted from ${coordsStr}.`,
        requestId: action.requestId,
      };
    }

    case "DEF_CALL_CLOSED": {
      if (!action.previousDefCallState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Action #${actionId} has no previous state.`,
        };
      }
      const reopened: DefCallRequest = {
        ...action.previousDefCallState,
        closed: false,
        contributors: [...action.previousDefCallState.contributors],
      };
      restoreDefCallRequest(guildId, action.requestId, reopened);
      markUndone(guildId, actionId);
      return {
        success: true,
        message: `Undone: request ${coordsStr} was updated, but the channel can no longer be restored - create a new one if needed.`,
        requestId: action.requestId,
      };
    }

    default:
      return { success: false, message: `Unknown action type: ${action.type}` };
  }
}

/**
 * Gets a human-readable description of an action.
 */
export function getActionDescription(action: Action): string {
  const { x, y } = action.coords;
  const coordsStr = `(${x}|${y})`;

  switch (action.type) {
    case "DEF_ADD":
      return `Created request ${coordsStr} (${action.data.troopsNeeded} troops)`;
    case "DEF_UPDATE":
      return `Updated request ${coordsStr} (${action.data.troopsNeeded} troops)`;
    case "TROOPS_SENT":
      return `Sent ${action.data.troops} troops to ${coordsStr}${action.data.didComplete ? " (completed)" : ""}`;
    case "REQUEST_DELETED":
      return `Deleted request ${coordsStr}`;
    case "ADMIN_UPDATE":
      return `Admin updated ${coordsStr}`;
    // Push actions
    case "PUSH_REQUEST_ADD":
      return `Created push request ${coordsStr} (${formatResources(action.data.resourcesNeeded || 0)} resources)`;
    case "PUSH_RESOURCES_SENT":
      return `Sent ${formatResources(action.data.resources || 0)} resources to ${coordsStr}${action.data.pushDidComplete ? " (completed)" : ""}`;
    case "PUSH_REQUEST_DELETED":
      return `Deleted push request ${coordsStr}`;
    case "PUSH_REQUEST_EDIT":
      return `Changed push request ${coordsStr} (${formatResources(action.data.previousResourcesNeeded || 0)} → ${formatResources(action.data.resourcesNeeded || 0)})`;
    case "PUSH_CONTRIBUTION_EDIT":
      return `Changed ${action.data.accountName} contribution ${coordsStr} (${formatResources(action.data.oldAmount || 0)} → ${formatResources(action.data.newAmount || 0)})`;
    case "PUSH_CONTRIBUTION_TRANSFER":
      return `Transferred contribution ${coordsStr}: ${action.data.fromAccount} → ${action.data.toAccount} (${formatResources(action.data.transferredAmount || 0)})`;
    case "DEF_CALL_REQUEST_ADD":
      return `Created defense request ${coordsStr}`;
    case "DEF_CALL_TROOPS_SENT":
      return `Sent ${formatTroops(action.data.troops || 0)} troops to ${coordsStr}`;
    case "DEF_CALL_CLOSED":
      return `Closed defense request ${coordsStr}`;
    default:
      return `Action ${coordsStr}`;
  }
}

/**
 * Checks if an action is a push-related action.
 */
export function isPushAction(action: Action): boolean {
  return action.type.startsWith("PUSH_");
}

/**
 * Checks if an action is a def-call-related action.
 */
export function isDefCallAction(action: Action): boolean {
  return action.type.startsWith("DEF_CALL_");
}
