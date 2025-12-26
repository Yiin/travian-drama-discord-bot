import fs from "fs";
import path from "path";
import {
  DefenseRequest,
  getRequestById,
  restoreRequest,
  removeRequest,
  subtractTroops,
  getGuildDefenseData,
} from "./defense-requests";
import {
  PushRequest,
  getPushRequestById,
  removePushRequest,
  subtractResources,
  restorePushRequest,
} from "./push-requests";

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
  | "PUSH_REQUEST_EDIT";

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
  data: ActionData;
  undone: boolean;
}

export interface GuildActionHistory {
  nextId: number;
  actions: Action[];
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
    return { success: false, message: `Veiksmas #${actionId} nerastas.` };
  }

  if (action.undone) {
    return { success: false, message: `Veiksmas #${actionId} jau atšauktas.` };
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
          message: `Atšaukta: gynybos užklausa ${coordsStr} pašalinta.`,
        };
      }
      markUndone(guildId, actionId);
      return {
        success: true,
        message: `Atšaukta: užklausa ${coordsStr} jau buvo pašalinta arba užbaigta.`,
      };
    }

    case "DEF_UPDATE": {
      // Legacy: restore the previous state (no longer created but handle old history)
      if (!action.previousState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
        };
      }

      const result = restoreRequest(guildId, action.previousState);
      markUndone(guildId, actionId);
      if (result.success) {
        return {
          success: true,
          message: `Atšaukta: užklausa ${coordsStr} atstatyta kaip #${result.requestId}.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Nepavyko atstatyti." };
    }

    case "TROOPS_SENT": {
      const { troops, contributorId, didComplete } = action.data;

      if (!troops || !contributorId) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi reikiamų duomenų.`,
        };
      }

      if (didComplete) {
        // Request was completed by this action - need to restore it
        if (!action.previousState) {
          markUndone(guildId, actionId);
          return {
            success: false,
            message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
          };
        }

        // Restore the request
        const restoredRequest: DefenseRequest = {
          ...action.previousState,
          contributors: [...action.previousState.contributors],
        };

        const result = restoreRequest(guildId, restoredRequest);
        if (!result.success) {
          return { success: false, message: result.error || "Nepavyko atstatyti." };
        }

        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Atšaukta: užklausa ${coordsStr} atstatyta kaip #${result.requestId} (${restoredRequest.troopsSent}/${restoredRequest.troopsNeeded}).`,
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
          message: `Atšaukta: užklausa ${coordsStr} jau nebeegzistuoja.`,
        };
      }

      if (existing.x !== x || existing.y !== y) {
        // Position shifted, request at this ID is different now
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Atšaukta: užklausos pozicija pasikeitė, kariai neatimti.`,
        };
      }

      const subtractResult = subtractTroops(guildId, action.requestId, contributorId, troops);
      markUndone(guildId, actionId);

      if (subtractResult.success && subtractResult.request) {
        return {
          success: true,
          message: `Atšaukta: ${troops} karių atimta iš ${coordsStr}. Progresas: ${subtractResult.request.troopsSent}/${subtractResult.request.troopsNeeded}.`,
          requestId: action.requestId,
        };
      }

      return {
        success: true,
        message: `Atšaukta: ${troops} karių atšaukimas.`,
      };
    }

    case "REQUEST_DELETED": {
      // Restore the deleted request
      if (!action.previousState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
        };
      }

      const result = restoreRequest(guildId, action.previousState);
      markUndone(guildId, actionId);

      if (result.success) {
        return {
          success: true,
          message: `Atšaukta: užklausa ${coordsStr} atstatyta kaip #${result.requestId}.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Nepavyko atstatyti." };
    }

    case "ADMIN_UPDATE": {
      // Restore previous field values
      if (!action.previousState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
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
            message: `Atšaukta: užklausa ${coordsStr} atstatyta kaip #${result.requestId}.`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Nepavyko atstatyti." };
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
            message: `Atšaukta: užklausa ${coordsStr} atstatyta kaip #${result.requestId}.`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Nepavyko atstatyti." };
      }

      // Request still at same position - restore previous state
      // First remove, then restore to get the previous state
      removeRequest(guildId, action.requestId);
      const result = restoreRequest(guildId, action.previousState);
      markUndone(guildId, actionId);
      if (result.success) {
        return {
          success: true,
          message: `Atšaukta: užklausa ${coordsStr} atstatyta į ankstesnę būseną.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Nepavyko atstatyti." };
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
          message: `Atšaukta: push užklausa ${coordsStr} pašalinta.`,
        };
      }
      markUndone(guildId, actionId);
      return {
        success: true,
        message: `Atšaukta: push užklausa ${coordsStr} jau buvo pašalinta.`,
      };
    }

    case "PUSH_RESOURCES_SENT": {
      const { resources, contributorAccount, pushDidComplete } = action.data;

      if (!resources || !contributorAccount) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi reikiamų duomenų.`,
        };
      }

      if (pushDidComplete) {
        // Request was completed by this action - need to restore it
        if (!action.previousPushState) {
          markUndone(guildId, actionId);
          return {
            success: false,
            message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
          };
        }

        // Restore the request
        const restoredRequest: PushRequest = {
          ...action.previousPushState,
          contributors: [...action.previousPushState.contributors],
        };

        const result = restorePushRequest(guildId, restoredRequest);
        if (!result.success) {
          return { success: false, message: result.error || "Nepavyko atstatyti." };
        }

        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Atšaukta: push užklausa ${coordsStr} atstatyta kaip #${result.requestId} (${restoredRequest.resourcesSent}/${restoredRequest.resourcesNeeded}).`,
          requestId: result.requestId,
        };
      }

      // Request was NOT completed - subtract resources
      const existing = getPushRequestById(guildId, action.requestId);
      if (!existing) {
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Atšaukta: push užklausa ${coordsStr} jau nebeegzistuoja.`,
        };
      }

      if (existing.x !== x || existing.y !== y) {
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Atšaukta: push užklausos pozicija pasikeitė, resursai neatimti.`,
        };
      }

      const subtractResult = subtractResources(guildId, action.requestId, contributorAccount, resources);
      markUndone(guildId, actionId);

      if (subtractResult.success && subtractResult.request) {
        return {
          success: true,
          message: `Atšaukta: ${formatNumber(resources)} resursų atimta iš ${coordsStr}. Progresas: ${subtractResult.request.resourcesSent}/${subtractResult.request.resourcesNeeded}.`,
          requestId: action.requestId,
        };
      }

      return {
        success: true,
        message: `Atšaukta: ${formatNumber(resources)} resursų atšaukimas.`,
      };
    }

    case "PUSH_REQUEST_DELETED": {
      // Restore the deleted push request
      if (!action.previousPushState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
        };
      }

      const result = restorePushRequest(guildId, action.previousPushState);
      markUndone(guildId, actionId);

      if (result.success) {
        return {
          success: true,
          message: `Atšaukta: push užklausa ${coordsStr} atstatyta kaip #${result.requestId}.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Nepavyko atstatyti." };
    }

    case "PUSH_REQUEST_EDIT": {
      // Restore previous resource amount
      if (!action.previousPushState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
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
            message: `Atšaukta: push užklausa ${coordsStr} atstatyta kaip #${result.requestId}.`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Nepavyko atstatyti." };
      }

      // Request still at same position - restore previous state
      removePushRequest(guildId, action.requestId);
      const result = restorePushRequest(guildId, action.previousPushState);
      markUndone(guildId, actionId);
      if (result.success) {
        return {
          success: true,
          message: `Atšaukta: push užklausa ${coordsStr} atstatyta į ankstesnę būseną.`,
          requestId: result.requestId,
        };
      }
      return { success: false, message: result.error || "Nepavyko atstatyti." };
    }

    default:
      return { success: false, message: `Nežinomas veiksmo tipas: ${action.type}` };
  }
}

// Helper function for formatting numbers
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "k";
  }
  return num.toString();
}

/**
 * Gets a human-readable description of an action.
 */
export function getActionDescription(action: Action): string {
  const { x, y } = action.coords;
  const coordsStr = `(${x}|${y})`;

  switch (action.type) {
    case "DEF_ADD":
      return `Sukurta užklausa ${coordsStr} (${action.data.troopsNeeded} karių)`;
    case "DEF_UPDATE":
      return `Atnaujinta užklausa ${coordsStr} (${action.data.troopsNeeded} karių)`;
    case "TROOPS_SENT":
      return `Išsiųsta ${action.data.troops} karių į ${coordsStr}${action.data.didComplete ? " (užbaigta)" : ""}`;
    case "REQUEST_DELETED":
      return `Ištrinta užklausa ${coordsStr}`;
    case "ADMIN_UPDATE":
      return `Admin atnaujino ${coordsStr}`;
    // Push actions
    case "PUSH_REQUEST_ADD":
      return `Sukurta push užklausa ${coordsStr} (${formatNumber(action.data.resourcesNeeded || 0)} resursų)`;
    case "PUSH_RESOURCES_SENT":
      return `Išsiųsta ${formatNumber(action.data.resources || 0)} resursų į ${coordsStr}${action.data.pushDidComplete ? " (užbaigta)" : ""}`;
    case "PUSH_REQUEST_DELETED":
      return `Ištrinta push užklausa ${coordsStr}`;
    case "PUSH_REQUEST_EDIT":
      return `Pakeista push užklausa ${coordsStr} (${formatNumber(action.data.previousResourcesNeeded || 0)} → ${formatNumber(action.data.resourcesNeeded || 0)})`;
    default:
      return `Veiksmas ${coordsStr}`;
  }
}

/**
 * Checks if an action is a push-related action.
 */
export function isPushAction(action: Action): boolean {
  return action.type.startsWith("PUSH_");
}
