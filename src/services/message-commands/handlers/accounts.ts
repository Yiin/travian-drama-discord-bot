import { TextChannel } from "discord.js";
import { CommandContext } from "../types";
import { parseNames, replyError } from "../utils";
import { cmd } from "../../../actions/messages";
import {
  setAccount,
  deleteAccount,
  getAccountForUser,
  addSitter,
  removeSitter,
  getAllPlayers,
} from "../../player-accounts";

export async function handleAccountLinkCommand(
  ctx: CommandContext,
  inGameName: string,
  forUserId?: string
): Promise<void> {
  const targetUserId = forUserId || ctx.message.author.id;
  const isSelf = targetUserId === ctx.message.author.id;
  const trimmedName = inGameName.trim();

  if (!trimmedName) {
    await replyError(ctx, "⚠️ **Enter a valid in-game name.**");
    return;
  }

  const previousName = getAccountForUser(ctx.guildId, targetUserId);
  setAccount(ctx.guildId, targetUserId, trimmedName);

  await ctx.message.react("✅");
  const who = isSelf ? "You are" : `<@${targetUserId}> is`;
  let content: string;
  if (previousName === trimmedName) {
    content = `✅ ${who} already linked to **${trimmedName}**.`;
  } else if (previousName) {
    content = `✅ ${who} now linked to **${trimmedName}** (was **${previousName}**).`;
  } else {
    content = `✅ ${who} now linked to **${trimmedName}**.`;
  }
  await ctx.message.reply({ content, allowedMentions: { parse: [] } });
}

export async function handleAccountUnlinkCommand(ctx: CommandContext, forUserId?: string): Promise<void> {
  const userId = forUserId || ctx.message.author.id;
  const isSelf = userId === ctx.message.author.id;

  const previousName = getAccountForUser(ctx.guildId, userId);

  if (!previousName) {
    await replyError(ctx, isSelf ? "⚠️ **You have no linked in-game account.**" : `⚠️ **<@${userId}> has no linked in-game account.**`);
    return;
  }

  deleteAccount(ctx.guildId, userId);
  await ctx.message.react("✅");
  await ctx.message.reply({
    content: isSelf ? `✅ Unlinked **${previousName}**.` : `✅ Unlinked **${previousName}** from <@${userId}>.`,
    allowedMentions: { parse: [] },
  });
}

export async function handleSitterSetCommand(
  ctx: CommandContext,
  namesInput: string
): Promise<void> {
  const userId = ctx.message.author.id;
  const names = parseNames(namesInput);

  if (names.length === 0) {
    await replyError(ctx, "⚠️ **Enter at least one player name.**");
    return;
  }

  const added = addSitter(ctx.guildId, userId, names);

  await ctx.message.react("✅");
  if (added.length === 0) {
    await ctx.message.reply(`You are already a sitter for: **${names.join("**, **")}**`);
  } else if (added.length === names.length) {
    await ctx.message.reply(`You are now a sitter for: **${added.join("**, **")}**`);
  } else {
    const alreadySitting = names.filter((n) => !added.includes(n));
    await ctx.message.reply(
      `Added as sitter: **${added.join("**, **")}**\nAlready sitting: **${alreadySitting.join("**, **")}**`
    );
  }
}

export async function handleSitterDelCommand(
  ctx: CommandContext,
  namesInput: string
): Promise<void> {
  const userId = ctx.message.author.id;
  const names = parseNames(namesInput);

  if (names.length === 0) {
    await replyError(ctx, "⚠️ **Enter at least one player name.**");
    return;
  }

  const removed = removeSitter(ctx.guildId, userId, names);

  await ctx.message.react("✅");
  if (removed.length === 0) {
    await ctx.message.reply(`Not sitting: **${names.join("**, **")}**`);
  } else if (removed.length === names.length) {
    await ctx.message.reply(`Removed as sitter: **${removed.join("**, **")}**`);
  } else {
    const notSitting = names.filter((n) => !removed.includes(n));
    await ctx.message.reply(
      `Removed: **${removed.join("**, **")}**\nNot sitting: **${notSitting.join("**, **")}**`
    );
  }
}

export async function handlePlayersCommand(ctx: CommandContext): Promise<void> {
  const players = getAllPlayers(ctx.guildId);

  if (players.length === 0) {
    await replyError(ctx, `⚠️ **No linked accounts yet.** Link yours with ${cmd("account link")}.`);
    return;
  }

  const lines: string[] = [];

  for (const player of players) {
    const ownerMentions = player.owners.map((id) => `<@${id}>`).join(", ");
    const sitterMentions = player.sitters.map((id) => `<@${id}>`).join(", ");

    let line = `**${player.name}**: `;

    if (player.owners.length > 0) {
      line += ownerMentions;
    } else {
      line += "_no owner_";
    }

    if (player.sitters.length > 0) {
      line += ` (sitters: ${sitterMentions})`;
    }

    lines.push(line);
  }

  const response = lines.join("\n");

  // Discord has a 2000 character limit for messages
  if (response.length > 1900) {
    const chunks: string[] = [];
    let currentChunk = "";

    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > 1900) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + line;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }

    await ctx.message.reply({ content: chunks[0], allowedMentions: { parse: [] } });
    for (let i = 1; i < chunks.length; i++) {
      await (ctx.message.channel as TextChannel).send({ content: chunks[i], allowedMentions: { parse: [] } });
    }
  } else {
    await ctx.message.reply({ content: response, allowedMentions: { parse: [] } });
  }
}
