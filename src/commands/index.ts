import { Collection } from "discord.js";
import { Command } from "../types";

/**
 * Command registry. `/help` is built from this at runtime: a command's `topic`
 * decides where it appears, and its subcommand descriptions become the help lines.
 */
export const commands = new Collection<string, Command>();

function registerCommand(command: Command): void {
  commands.set(command.data.name, command);
}

// Imports come after the collection so `help.ts` can import `commands` without a cycle at load time.
import { stackCommand } from "./stack";
import { defCommand } from "./def";
import { pushCommand } from "./push";
import { scoutCommand } from "./scout";
import { accountCommand } from "./account";
import { sitterCommand } from "./sitter";
import { lookupCommand } from "./lookup";
import { statsCommand } from "./stats";
import { undoCommand } from "./undo";
import { helpCommand } from "./help";
import { setupCommand } from "./setup";
import { reminderCommand } from "./reminder";
import { penisCommand } from "./penis";

registerCommand(stackCommand);
registerCommand(defCommand);
registerCommand(pushCommand);
registerCommand(scoutCommand);
registerCommand(accountCommand);
registerCommand(sitterCommand);
registerCommand(lookupCommand);
registerCommand(statsCommand);
registerCommand(undoCommand);
registerCommand(helpCommand);
registerCommand(setupCommand);
registerCommand(reminderCommand);
registerCommand(penisCommand);
