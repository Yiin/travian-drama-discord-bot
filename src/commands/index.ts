import { Collection } from "discord.js";
import { Command } from "../types";
import { defCommand } from "./def";
import { deletedefCommand } from "./deletedef";
import { scoutCommand } from "./scout";
import { setchannelCommand } from "./setchannel";
import { setserverCommand } from "./setserver";
import { lookupCommand } from "./lookup";
import { sentCommand, stackCommand } from "./sent";
import { stackinfoCommand } from "./stackinfo";
import { updatedefCommand } from "./updatedef";
import { undoCommand } from "./undo";
import { setscoutroleCommand } from "./setscoutrole";

export const commands = new Collection<string, Command>();

function registerCommand(command: Command): void {
  commands.set(command.data.name, command);
}

registerCommand(defCommand);
registerCommand(deletedefCommand);
registerCommand(scoutCommand);
registerCommand(setchannelCommand);
registerCommand(setserverCommand);
registerCommand(lookupCommand);
registerCommand(sentCommand);
registerCommand(stackCommand);
registerCommand(stackinfoCommand);
registerCommand(updatedefCommand);
registerCommand(undoCommand);
registerCommand(setscoutroleCommand);
