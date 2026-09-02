import { formatResources, formatTroops } from "./format";

/**
 * Labels for autocomplete choices and select options.
 * Discord caps labels at 100 characters; these stay well below that.
 */

export interface StackChoiceInput {
  id: number;
  x: number;
  y: number;
  troopsSent: number;
  troopsNeeded: number;
}

/** `#41 · Capital (12|-45) · 1,200/5,000` (leading `➡️` for the priority request). */
export function stackChoiceLabel(
  request: StackChoiceInput,
  villageName: string | undefined,
  isPriority = false
): string {
  const name = villageName ? `${villageName} ` : "";
  const label = `#${request.id} · ${name}(${request.x}|${request.y}) · ${formatTroops(request.troopsSent)}/${formatTroops(request.troopsNeeded)}`;
  return clip(isPriority ? `➡️ ${label}` : label);
}

export interface PushChoiceInput {
  id: number;
  x: number;
  y: number;
  resourcesSent: number;
  resourcesNeeded: number;
}

/** `#9 · Capital (12|-45) · 250k/500k` */
export function pushChoiceLabel(request: PushChoiceInput, villageName: string | undefined): string {
  const name = villageName ? `${villageName} ` : "";
  return clip(
    `#${request.id} · ${name}(${request.x}|${request.y}) · ${formatResources(request.resourcesSent)}/${formatResources(request.resourcesNeeded)}`
  );
}

/** Case-insensitive "contains" filter, capped at Discord's 25 choices. */
export function filterChoices<T extends { name: string; value: string }>(
  choices: T[],
  typed: string
): T[] {
  const needle = typed.trim().toLowerCase();
  const matches = needle ? choices.filter((c) => c.name.toLowerCase().includes(needle)) : choices;
  return matches.slice(0, 25);
}

function clip(label: string): string {
  return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}
