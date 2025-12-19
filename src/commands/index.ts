import { Collection } from "discord.js";
import { Command } from "../types";
import { defCommand } from "./def";
import { scoutCommand } from "./scout";
import { setchannelCommand } from "./setchannel";
import { setserverCommand } from "./setserver";
import { lookupCommand } from "./lookup";
import { sentCommand } from "./sent";
import { updatedefCommand } from "./updatedef";

export const commands = new Collection<string, Command>();

function registerCommand(command: Command): void {
  commands.set(command.data.name, command);
}

registerCommand(defCommand);
registerCommand(scoutCommand);
registerCommand(setchannelCommand);
registerCommand(setserverCommand);
registerCommand(lookupCommand);
registerCommand(sentCommand);
registerCommand(updatedefCommand);
