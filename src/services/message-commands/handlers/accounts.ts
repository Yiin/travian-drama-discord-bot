import { TextChannel } from "discord.js";
import { CommandContext } from "../types";
import { parseNames } from "../utils";
import {
  setAccount,
  deleteAccount,
  getAccountForUser,
  addSitter,
  removeSitter,
  getAllPlayers,
} from "../../player-accounts";

export async function handleAccountSetCommand(
  ctx: CommandContext,
  inGameName: string
): Promise<void> {
  const userId = ctx.message.author.id;
  const trimmedName = inGameName.trim();

  if (!trimmedName) {
    await ctx.message.reply("Nurodyk savo žaidimo vardą.");
    return;
  }

  const previousName = getAccountForUser(ctx.guildId, userId);
  setAccount(ctx.guildId, userId, trimmedName);

  await ctx.message.react("✅");
  if (previousName && previousName !== trimmedName) {
    await ctx.message.reply(`Atnaujinta: **${previousName}** → **${trimmedName}**`);
  } else if (previousName === trimmedName) {
    await ctx.message.reply(`Jau esi priskirtas prie **${trimmedName}**.`);
  } else {
    await ctx.message.reply(`Dabar esi priskirtas prie žaidimo paskyros **${trimmedName}**.`);
  }
}

export async function handleAccountDelCommand(ctx: CommandContext): Promise<void> {
  const userId = ctx.message.author.id;

  const previousName = getAccountForUser(ctx.guildId, userId);

  if (!previousName) {
    await ctx.message.reply("Neturi priskirtos žaidimo paskyros.");
    return;
  }

  deleteAccount(ctx.guildId, userId);
  await ctx.message.react("✅");
  await ctx.message.reply(`Pašalinta priskyrimas prie **${previousName}**.`);
}

export async function handleSitterSetCommand(
  ctx: CommandContext,
  namesInput: string
): Promise<void> {
  const userId = ctx.message.author.id;
  const names = parseNames(namesInput);

  if (names.length === 0) {
    await ctx.message.reply("Nurodyk bent vieną žaidėjo vardą.");
    return;
  }

  const added = addSitter(ctx.guildId, userId, names);

  await ctx.message.react("✅");
  if (added.length === 0) {
    await ctx.message.reply(`Jau esi siteris: **${names.join("**, **")}**`);
  } else if (added.length === names.length) {
    await ctx.message.reply(`Dabar esi siteris: **${added.join("**, **")}**`);
  } else {
    const alreadySitting = names.filter((n) => !added.includes(n));
    await ctx.message.reply(
      `Pridėta kaip siteris: **${added.join("**, **")}**\nJau buvai: **${alreadySitting.join("**, **")}**`
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
    await ctx.message.reply("Nurodyk bent vieną žaidėjo vardą.");
    return;
  }

  const removed = removeSitter(ctx.guildId, userId, names);

  await ctx.message.react("✅");
  if (removed.length === 0) {
    await ctx.message.reply(`Nebuvai siteris: **${names.join("**, **")}**`);
  } else if (removed.length === names.length) {
    await ctx.message.reply(`Pašalinta kaip siteris: **${removed.join("**, **")}**`);
  } else {
    const notSitting = names.filter((n) => !removed.includes(n));
    await ctx.message.reply(
      `Pašalinta: **${removed.join("**, **")}**\nNebuvai siteris: **${notSitting.join("**, **")}**`
    );
  }
}

export async function handlePlayersCommand(ctx: CommandContext): Promise<void> {
  const players = getAllPlayers(ctx.guildId);

  if (players.length === 0) {
    await ctx.message.reply(
      "Nėra užregistruotų žaidėjų. Naudok `/account set` priskirti save prie žaidimo paskyros."
    );
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
      line += "_nėra savininko_";
    }

    if (player.sitters.length > 0) {
      line += ` (siteriai: ${sitterMentions})`;
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

    await ctx.message.reply({ content: chunks[0] });
    for (let i = 1; i < chunks.length; i++) {
      await (ctx.message.channel as TextChannel).send({ content: chunks[i] });
    }
  } else {
    await ctx.message.reply({ content: response });
  }
}
