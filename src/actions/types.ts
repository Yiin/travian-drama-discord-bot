import { Client } from "discord.js";
import { GuildConfig } from "../config/guild-config";
import { DefenseRequest } from "../services/defense-requests";

/**
 * Context passed to every action - contains validated guild info
 */
export interface ActionContext {
  guildId: string;
  config: GuildConfig;
  client: Client;
  userId: string; // The user performing the action
}

/**
 * Result from config validation - either valid context or error
 */
export type ConfigValidation =
  | { valid: true; guildId: string; config: GuildConfig }
  | { valid: false; error: string };

/**
 * Base result type for successful actions
 */
export interface ActionSuccess {
  success: true;
  actionId: number; // For undo reference
  actionText: string; // Human-readable action description
}

/**
 * Failed action result with error message
 */
export interface ActionError {
  success: false;
  error: string;
}

// --- Sent Action Types ---

export interface SentActionInput {
  target: string; // Request ID or coordinates string
  troops: number;
  creditUserId: string; // User to credit (may differ from action performer)
}

export interface SentActionSuccess extends ActionSuccess {
  villageName: string;
  troopsSent: number;
  troopsNeeded: number;
  isComplete: boolean;
  coords: { x: number; y: number };
}

export type SentActionResult = SentActionSuccess | ActionError;

// --- Def Action Types ---

export interface DefActionInput {
  coords: string; // Coordinates string (will be parsed)
  troopsNeeded: number;
  message: string;
}

export interface DefActionSuccess extends ActionSuccess {
  requestId: number;
  villageName: string;
  playerName: string;
  allianceName?: string;
  isUpdate: boolean;
  coords: { x: number; y: number };
}

export type DefActionResult = DefActionSuccess | ActionError;

// --- DeleteDef Action Types ---

export interface DeleteDefActionInput {
  requestId: number;
}

export interface DeleteDefActionSuccess extends ActionSuccess {
  requestId: number;
  villageName: string;
  playerName: string;
  coords: { x: number; y: number };
}

export type DeleteDefActionResult = DeleteDefActionSuccess | ActionError;

// --- UpdateDef Action Types ---

export interface UpdateDefActionInput {
  requestId: number;
  troopsSent?: number;
  troopsNeeded?: number;
  message?: string;
}

export interface UpdateDefActionSuccess extends ActionSuccess {
  requestId: number;
  updatedFields: string[];
  wasCompleted: boolean;
  request: DefenseRequest;
}

export type UpdateDefActionResult = UpdateDefActionSuccess | ActionError;

// --- Undo Action Types ---

export interface UndoActionInput {
  actionId: number;
}

export interface UndoActionSuccess extends ActionSuccess {
  description: string; // What was undone
}

export type UndoActionResult = UndoActionSuccess | ActionError;
