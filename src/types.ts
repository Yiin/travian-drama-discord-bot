import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

/** Section of `/help` a command belongs to. Commands without a topic never appear in help. */
export type HelpTopic = "defense" | "scouting" | "pushes" | "you" | "info" | "admin";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  /** Where the command is listed in `/help`. Leave unset to keep it out of help. */
  topic?: HelpTopic;
  /** One line shown in `/help` next to the command name. */
  summary?: string;
}
