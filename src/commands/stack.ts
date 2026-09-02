import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
} from "discord.js";
import { Command } from "../types";
import {
  validateDefenseConfig,
  executeStackAction,
  executeSentAction,
  executeDeleteDefAction,
  executeUpdateDefAction,
  executeMoveAction,
} from "../actions";
import { withRetry } from "../utils/retry";
import { getStackPanelUrl, updateGlobalMessage } from "../services/defense-message";
import { getAllRequests } from "../services/defense-requests";
import { getVillageAt } from "../services/map-data";
import { buildStackEditor } from "../services/button-handlers/stack-edit";
import { confirmationEdit, asConfirm, errors } from "../actions/messages";
import { stackChoiceLabel, filterChoices } from "../utils/choices";
import { guildCommand } from "./shared";

export const stackCommand: Command = {
  topic: "defense",
  summary: "Long-term stacking queue: ask for troops, report what you sent, reorder the queue",
  data: guildCommand("stack", "Stacking queue: request troops or report troops you sent")
    .addSubcommand((sub) =>
      sub
        .setName("request")
        .setDescription("Add a village to the stacking queue")
        .addStringOption((opt) =>
          opt.setName("coords").setDescription("Village coordinates, for example 123|456").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("troops").setDescription("How many troops are needed").setRequired(true).setMinValue(1)
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("Short note, for example: anti cav").setMaxLength(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("sent")
        .setDescription("Report troops you sent to a queue request")
        .addStringOption((opt) =>
          opt
            .setName("target")
            .setDescription("Pick the request (or type its id or coordinates)")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("troops").setDescription("How many troops you sent").setRequired(true).setMinValue(1)
        )
        .addUserOption((opt) =>
          opt.setName("for").setDescription("Credit another member instead of yourself")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Change a request, or open its editor when no field is given")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Request to edit").setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("troops_sent").setDescription("Set the troops sent so far").setMinValue(0)
        )
        .addIntegerOption((opt) =>
          opt.setName("troops_needed").setDescription("Set the troops needed").setMinValue(1)
        )
        .addStringOption((opt) => opt.setName("note").setDescription("Replace the note").setMaxLength(100))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a request from the queue")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Request to remove").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("move")
        .setDescription("Move a request to another position in the queue")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Request to move").setRequired(true).setAutocomplete(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("position").setDescription("New position, 1 is the top").setRequired(true).setMinValue(1)
        )
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Re-post the queue panel")),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    const choices = await stackRequestChoices(guildId);
    const filtered = filterChoices(choices, String(focused.value));
    if (focused.name === "target") {
      await interaction.respond(filtered.map((c) => ({ name: c.name, value: c.value })));
    } else {
      await interaction.respond(filtered.map((c) => ({ name: c.name, value: Number(c.value) })));
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const validation = validateDefenseConfig(interaction.guildId);
    if (!validation.valid) {
      await interaction.reply({ content: validation.error, flags: MessageFlags.Ephemeral });
      return;
    }
    const context = {
      guildId: validation.guildId,
      config: validation.config,
      client: interaction.client,
      userId: interaction.user.id,
    };
    const panelUrl = () => getStackPanelUrl(validation.guildId);

    switch (interaction.options.getSubcommand()) {
      case "request": {
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeStackAction(context, {
          coords: interaction.options.getString("coords", true),
          troopsNeeded: interaction.options.getInteger("troops", true),
          message: interaction.options.getString("note") ?? "",
        });
        await reply(interaction, result, panelUrl());
        return;
      }
      case "sent": {
        const creditUser = interaction.options.getUser("for") ?? interaction.user;
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeSentAction(context, {
          target: interaction.options.getString("target", true),
          troops: interaction.options.getInteger("troops", true),
          creditUserId: creditUser.id,
        });
        await reply(interaction, result, panelUrl());
        return;
      }
      case "edit": {
        const requestId = interaction.options.getInteger("id", true);
        const troopsSent = interaction.options.getInteger("troops_sent") ?? undefined;
        const troopsNeeded = interaction.options.getInteger("troops_needed") ?? undefined;
        const note = interaction.options.getString("note") ?? undefined;

        if (troopsSent === undefined && troopsNeeded === undefined && note === undefined) {
          const editor = await buildStackEditor(validation.guildId, requestId);
          await interaction.reply(
            editor
              ? { ...editor, flags: MessageFlags.Ephemeral }
              : { content: errors.notFound("request", requestId), flags: MessageFlags.Ephemeral }
          );
          return;
        }

        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeUpdateDefAction(context, { requestId, troopsSent, troopsNeeded, message: note });
        await reply(interaction, result, panelUrl());
        return;
      }
      case "remove": {
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeDeleteDefAction(context, {
          requestId: interaction.options.getInteger("id", true),
        });
        await reply(interaction, result, panelUrl());
        return;
      }
      case "move": {
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeMoveAction(context, {
          requestId: interaction.options.getInteger("id", true),
          toPosition: interaction.options.getInteger("position", true),
        });
        await reply(interaction, result, panelUrl());
        return;
      }
      case "list": {
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        await updateGlobalMessage(interaction.client, validation.guildId);
        await interaction.editReply(
          confirmationEdit("✅ Queue panel re-posted.", { panelUrl: panelUrl() })
        );
        return;
      }
    }
  },
};

type Outcome =
  | { success: true; actionId?: number; actionText: string; confirmText?: string }
  | { success: false; error: string };

async function reply(interaction: ChatInputCommandInteraction, result: Outcome, panelUrl?: string): Promise<void> {
  if (!result.success) {
    await interaction.editReply({ content: result.error });
    return;
  }
  await interaction.editReply(
    confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
      actionId: result.actionId,
      panelUrl,
    })
  );
}

/** Open queue requests as `{ name, value }` choices, in priority order. */
export async function stackRequestChoices(guildId: string): Promise<{ name: string; value: string }[]> {
  const validation = validateDefenseConfig(guildId);
  if (!validation.valid) return [];
  const requests = getAllRequests(guildId);
  const choices: { name: string; value: string }[] = [];
  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    const village = await getVillageAt(validation.config.serverKey!, request.x, request.y);
    choices.push({
      name: stackChoiceLabel(request, village?.villageName, i === 0),
      value: String(request.id),
    });
  }
  return choices;
}
