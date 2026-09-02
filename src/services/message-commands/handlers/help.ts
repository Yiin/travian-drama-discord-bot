import { CommandContext } from "../types";
import { HelpTopic } from "../../../types";
import { commands } from "../../../commands";
import { buildHelpEmbed, buildHelpButtons, isHelpTopic } from "../../help";

export async function handleHelpCommand(ctx: CommandContext, topicInput?: string): Promise<void> {
  const topic: HelpTopic | undefined = topicInput && isHelpTopic(topicInput) ? topicInput : undefined;
  await ctx.message.reply({
    embeds: [buildHelpEmbed(commands, topic)],
    components: buildHelpButtons(commands, topic),
  });
}
