import fs from "fs";
import path from "path";
import {
  DefenseRequest,
  getRequestByCoords,
  restoreRequest,
  removeRequestByCoords,
  subtractTroops,
  getGuildDefenseData,
} from "./defense-requests";

const DATA_DIR = path.join(process.cwd(), "data");
const HISTORY_FILE = path.join(DATA_DIR, "action-history.json");

const MAX_ACTIONS = 50;

export type ActionType =
  | "DEF_ADD"
  | "DEF_UPDATE"
  | "TROOPS_SENT"
  | "REQUEST_DELETED"
  | "ADMIN_UPDATE";

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
}

export interface Action {
  id: number;
  type: ActionType;
  userId: string;
  timestamp: number;
  coords: { x: number; y: number };
  previousState?: DefenseRequest;
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
  previousState?: DefenseRequest;
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
    previousState: input.previousState
      ? { ...input.previousState, contributors: [...input.previousState.contributors] }
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
      // Remove the request that was added
      const removed = removeRequestByCoords(guildId, x, y);
      markUndone(guildId, actionId);
      if (removed) {
        return {
          success: true,
          message: `Atšaukta: gynybos užklausa ${coordsStr} pašalinta.`,
        };
      }
      return {
        success: true,
        message: `Atšaukta: užklausa ${coordsStr} jau buvo pašalinta arba užbaigta.`,
      };
    }

    case "DEF_UPDATE": {
      // Restore the previous state
      if (!action.previousState) {
        markUndone(guildId, actionId);
        return {
          success: false,
          message: `Veiksmas #${actionId} neturi ankstesnės būsenos.`,
        };
      }

      // Check if there's a request at these coords
      const existing = getRequestByCoords(guildId, x, y);
      if (existing) {
        // Replace with previous state
        const result = restoreRequest(guildId, action.previousState, false);
        markUndone(guildId, actionId);
        if (result.success) {
          return {
            success: true,
            message: `Atšaukta: užklausa ${coordsStr} atstatyta į ankstesnę būseną (${action.previousState.troopsSent}/${action.previousState.troopsNeeded}).`,
            requestId: result.requestId,
          };
        }
        return { success: false, message: result.error || "Nepavyko atstatyti." };
      }

      // Request doesn't exist, restore at end
      const result = restoreRequest(guildId, action.previousState, true);
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

        // Check if coords are occupied by a new request
        const existing = getRequestByCoords(guildId, x, y);
        const atEnd = existing !== undefined;

        // Restore the request with troops subtracted
        const restoredRequest: DefenseRequest = {
          ...action.previousState,
          contributors: [...action.previousState.contributors],
        };

        const result = restoreRequest(guildId, restoredRequest, atEnd);
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

      // Request was NOT completed - just subtract troops
      const existing = getRequestByCoords(guildId, x, y);
      if (!existing) {
        markUndone(guildId, actionId);
        return {
          success: true,
          message: `Atšaukta: užklausa ${coordsStr} jau nebeegzistuoja.`,
        };
      }

      const subtractResult = subtractTroops(guildId, x, y, contributorId, troops);
      markUndone(guildId, actionId);

      if (subtractResult.success && subtractResult.request) {
        return {
          success: true,
          message: `Atšaukta: ${troops} karių atimta iš ${coordsStr}. Progresas: ${subtractResult.request.troopsSent}/${subtractResult.request.troopsNeeded}.`,
          requestId: existing.requestId,
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

      // Check if coords are occupied
      const existing = getRequestByCoords(guildId, x, y);
      const atEnd = existing !== undefined;

      const result = restoreRequest(guildId, action.previousState, atEnd);
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
        const existing = getRequestByCoords(guildId, x, y);
        const atEnd = existing !== undefined;

        const result = restoreRequest(guildId, action.previousState, atEnd);
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

      // Not completed - restore to existing request
      const existing = getRequestByCoords(guildId, x, y);
      if (!existing) {
        // Request doesn't exist, restore it
        const result = restoreRequest(guildId, action.previousState, true);
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

      // Restore previous state to existing request
      const result = restoreRequest(guildId, action.previousState, false);
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

    default:
      return { success: false, message: `Nežinomas veiksmo tipas: ${action.type}` };
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
      return `Sukurta užklausa ${coordsStr} (${action.data.troopsNeeded} karių)`;
    case "DEF_UPDATE":
      return `Atnaujinta užklausa ${coordsStr} (${action.data.troopsNeeded} karių)`;
    case "TROOPS_SENT":
      return `Išsiųsta ${action.data.troops} karių į ${coordsStr}${action.data.didComplete ? " (užbaigta)" : ""}`;
    case "REQUEST_DELETED":
      return `Ištrinta užklausa ${coordsStr}`;
    case "ADMIN_UPDATE":
      return `Admin atnaujino ${coordsStr}`;
    default:
      return `Veiksmas ${coordsStr}`;
  }
}
