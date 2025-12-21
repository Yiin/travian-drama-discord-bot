import { Collection } from "discord.js";
import { Command } from "../types";
import { configureCommand } from "./configure";
import { defCommand } from "./def";
import { deletedefCommand } from "./deletedef";
import { dramaCommand } from "./drama";
import { scoutCommand } from "./scout";
import { lookupCommand } from "./lookup";
import { sentCommand, stackCommand } from "./sent";
import { stackinfoCommand } from "./stackinfo";
import { updatedefCommand } from "./updatedef";
import { undoCommand } from "./undo";

export const commands = new Collection<string, Command>();

function registerCommand(command: Command): void {
  commands.set(command.data.name, command);
}

registerCommand(configureCommand);
registerCommand(defCommand);
registerCommand(deletedefCommand);
registerCommand(dramaCommand);
registerCommand(scoutCommand);
registerCommand(lookupCommand);
registerCommand(sentCommand);
registerCommand(stackCommand);
registerCommand(stackinfoCommand);
registerCommand(updatedefCommand);
registerCommand(undoCommand);
