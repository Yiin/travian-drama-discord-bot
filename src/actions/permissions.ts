import { GuildConfig, Permission } from "../config/guild-config";
import { errors } from "./messages";
import { ActionContext } from "./types";

/**
 * Two role lists per guild decide who may do what:
 *
 * - `request`: create stack, def-call, push and scout requests. Empty list: everyone.
 * - `manage`: change, close or delete any request, edit other people's
 *   contributions, undo other people's actions. Empty list: admins only.
 *
 * Administrators and bot owners pass both. The requester may always edit and
 * close their own request, and anyone may undo their own action. Reporting sent
 * troops or resources needs no permission.
 */

type Actor = Pick<ActionContext, "config" | "userId" | "roleIds" | "isAdministrator">;

export function permissionRoles(config: GuildConfig, permission: Permission): string[] {
  return config.permissions?.[permission] ?? [];
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  if (actor.isAdministrator) return true;
  const roles = permissionRoles(actor.config, permission);
  if (roles.length === 0) return permission === "request";
  return roles.some((id) => actor.roleIds.includes(id));
}

/**
 * Error text when the actor may not do this, or `null` when allowed.
 * Pass `requesterId` when the target is a request: its requester always passes.
 */
export function checkPermission(actor: Actor, permission: Permission, requesterId?: string): string | null {
  if (requesterId !== undefined && requesterId === actor.userId) return null;
  if (hasPermission(actor, permission)) return null;
  return errors.permissionDenied(permission, permissionRoles(actor.config, permission), requesterId !== undefined);
}

/** Error text when the actor may not undo this action, or `null` when allowed. */
export function checkUndoPermission(actor: Actor, actionUserId: string): string | null {
  if (actionUserId === actor.userId || hasPermission(actor, "manage")) return null;
  return errors.undoNotYours(permissionRoles(actor.config, "manage"));
}

/** `everyone` / `admins only` / `@A, @B`, for `/permissions show` and `/setup show`. */
export function describePermission(config: GuildConfig, permission: Permission): string {
  const roles = permissionRoles(config, permission);
  if (roles.length > 0) return roles.map((id) => `<@&${id}>`).join(", ");
  return permission === "request" ? "everyone" : "admins only";
}

export const PERMISSION_LABEL: Record<Permission, string> = {
  request: "Create requests",
  manage: "Manage any request",
};

/** Both lists plus what they allow, for `/permissions show` and `/setup show`. */
export function buildPermissionSummary(config: GuildConfig): string {
  return [
    "**Permissions**",
    `**${PERMISSION_LABEL.request}** (\`request\`): ${describePermission(config, "request")}`,
    `**${PERMISSION_LABEL.manage}** (\`manage\`): ${describePermission(config, "manage")}`,
    "-# Requesters can always edit and close their own requests. Anyone can report what they sent and undo their own actions. Administrators can do everything.",
  ].join("\n");
}
