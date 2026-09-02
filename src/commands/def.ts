import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { Command } from "../types";
import { getGuildConfig } from "../config/guild-config";
import {
  executeDefCallRequestAction,
  executeDefCallSentAction,
  executeDefCallCloseAction,
} from "../actions";
import { getRequestByChannelId } from "../services/def-calls";
import { isAdmin } from "../utils/permissions";
import { withRetry } from "../utils/retry";
import { errors, confirmationEdit, asConfirm, channelUrl } from "../actions/messages";
import { guildCommand, requireGuild } from "./shared";

export const defCommand: Command = {
  topic: "defense",
  summary: "Defense calls: one thread per incoming attack, report troops inside it",
  data: guildCommand("def", "Defense calls: open a thread for an incoming attack")
    .addSubcommand((sub) =>
      sub
        .setName("request")
        .setDescription("Open a defense thread for an incoming attack")
        .addStringOption((opt) =>
          opt.setName("coords").setDescription("Village coordinates, for example 123|456").setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("landing")
            .setDescription("When the attack lands: HH:MM, HH:MM:SS, or the Travian text")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("Short note, for example: WW from the north").setMaxLength(200)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("limit")
            .setDescription("Troop limit; the thread is marked ✅ when reached")
            .setMinValue(1)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("sent")
        .setDescription("Report troops you sent (use inside the defense thread)")
        .addIntegerOption((opt) =>
          opt.setName("troops").setDescription("How many troops you sent").setRequired(true).setMinValue(1)
        )
        .addUserOption((opt) =>
          opt.setName("for").setDescription("Credit another member instead of yourself")
        )
    )
    .addSubcommand((sub) => sub.setName("close").setDescription("Close this defense thread")),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = await requireGuild(interaction);
    if (!guildId) return;

    const config = getGuildConfig(guildId);
    const context = { guildId, config, client: interaction.client, userId: interaction.user.id };

    switch (interaction.options.getSubcommand()) {
      case "request": {
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeDefCallRequestAction(context, {
          coords: interaction.options.getString("coords", true),
          landing: interaction.options.getString("landing", true),
          comment: interaction.options.getString("note") ?? undefined,
          troopsNeeded: interaction.options.getInteger("limit") ?? undefined,
        });
        if (!result.success) {
          await interaction.editReply({ content: result.error });
          return;
        }
        await interaction.editReply(
          confirmationEdit(result.confirmText ?? asConfirm(result.actionText), {
            actionId: result.actionId,
            panelUrl: channelUrl(guildId, result.channelId),
            panelLabel: "Open thread",
          })
        );
        return;
      }
      case "sent": {
        const requestData = getRequestByChannelId(guildId, interaction.channelId);
        if (!requestData) {
          await interaction.reply({ content: errors.notInThread("defense"), flags: MessageFlags.Ephemeral });
          return;
        }
        const creditUser = interaction.options.getUser("for");
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeDefCallSentAction(context, {
          requestId: requestData.requestId,
          troops: interaction.options.getInteger("troops", true),
          creditUserId: creditUser?.id,
        });
        if (!result.success) {
          await interaction.editReply({ content: result.error });
          return;
        }
        await interaction.editReply(
          confirmationEdit(result.confirmText ?? asConfirm(result.actionText), { actionId: result.actionId })
        );
        return;
      }
      case "close": {
        const requestData = getRequestByChannelId(guildId, interaction.channelId);
        if (!requestData) {
          await interaction.reply({ content: errors.notInThread("defense"), flags: MessageFlags.Ephemeral });
          return;
        }
        await withRetry(() => interaction.deferReply({ flags: MessageFlags.Ephemeral }));
        const result = await executeDefCallCloseAction(
          context,
          { requestId: requestData.requestId },
          { isAdmin: isAdmin(interaction.member as GuildMember | null) }
        );
        try {
          await interaction.editReply(
            result.success
              ? confirmationEdit(result.confirmText ?? asConfirm(result.actionText))
              : { content: result.error }
          );
        } catch {
          // the thread may already be gone
        }
        return;
      }
    }
  },
};
