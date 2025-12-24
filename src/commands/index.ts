import { Collection } from "discord.js";
import { Command } from "../types";
import { accountCommand } from "./account";
import { addstatCommand } from "./addstat";
import { configureCommand } from "./configure";
import { defCommand } from "./def";
import { deletedefCommand } from "./deletedef";
import { dramaCommand } from "./drama";
import { playersCommand } from "./players";
import { scoutCommand } from "./scout";
import { sitterCommand } from "./sitter";
import { lookupCommand } from "./lookup";
import { sentCommand, stackCommand } from "./sent";
import { stackinfoCommand } from "./stackinfo";
import { statsCommand } from "./stats";
import { updatedefCommand } from "./updatedef";
import { undoCommand } from "./undo";
import { pushCommand } from "./push";

export const commands = new Collection<string, Command>();

function registerCommand(command: Command): void {
  commands.set(command.data.name, command);
}

registerCommand(accountCommand);
registerCommand(addstatCommand);
registerCommand(configureCommand);
registerCommand(defCommand);
registerCommand(deletedefCommand);
registerCommand(dramaCommand);
registerCommand(playersCommand);
registerCommand(scoutCommand);
registerCommand(sitterCommand);
registerCommand(lookupCommand);
registerCommand(sentCommand);
registerCommand(stackCommand);
registerCommand(stackinfoCommand);
registerCommand(statsCommand);
registerCommand(updatedefCommand);
registerCommand(undoCommand);
registerCommand(pushCommand);
