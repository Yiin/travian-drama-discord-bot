import { getGuildConfig, Permission, setPermissionRoles } from "../config/guild-config";
import { errors, success } from "./messages";
import { describePermission, permissionRoles } from "./permissions";
import { ActionContext, ActionError } from "./types";

/**
 * Change a permission role list. Shared by `/permissions add|remove` and the
 * setup panel pickers. Only Administrators and bot owners may do this.
 * Not undoable: run the opposite command instead.
 */
export type PermissionChange =
  | { permission: Permission; add: string }
  | { permission: Permission; remove: string }
  | { permission: Permission; set: string[] };

export type PermissionChangeResult = { success: true; confirmText: string } | ActionError;

export function executePermissionChangeAction(
  context: Pick<ActionContext, "guildId" | "config" | "isAdministrator">,
  change: PermissionChange
): PermissionChangeResult {
  if (!context.isAdministrator) {
    return { success: false, error: errors.administratorOnly() };
  }

  const { permission } = change;
  const current = permissionRoles(context.config, permission);
  let next: string[];
  if ("add" in change) {
    if (current.includes(change.add)) return { success: false, error: errors.roleAlreadyListed(permission, change.add) };
    next = [...current, change.add];
  } else if ("remove" in change) {
    if (!current.includes(change.remove)) return { success: false, error: errors.roleNotListed(permission, change.remove) };
    next = current.filter((id) => id !== change.remove);
  } else {
    next = [...new Set(change.set)];
  }

  setPermissionRoles(context.guildId, permission, next);
  const updated = getGuildConfig(context.guildId);
  return {
    success: true,
    confirmText: success.text(`Updated \`${permission}\`.`, `Now: ${describePermission(updated, permission)}.`),
  };
}
