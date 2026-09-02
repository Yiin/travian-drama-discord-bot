/**
 * Text-command patterns. The documented prefix is `!`; `/` is accepted too because
 * Discord sends a plain message when someone types a slash command without picking it.
 */

// !sent <id|coords> <troops> [@user]      (stack requests channel)
// !sent id: 41 troops: 200 [user: @user]
export const SENT_PATTERN = /^[\/!]sent\s+(#?\d+|.+?)\s+(\d+)(?:\s+<@!?(\d+)>)?\s*$/i;
export const SENT_VERBOSE_PATTERN = /^[\/!]sent\s+(?:id|target):\s*(\S+)\s+troops:\s*(\d+)(?:\s+user:\s*<@!?(\d+)>)?\s*$/i;

// !sent <troops> [@user]                    (inside a defense-call thread)
export const DEFCALL_SENT_PATTERN = /^[\/!]sent\s+(\d+)(?:\s+<@!?(\d+)>)?\s*$/i;

// !stack <coords> <troops> [note]           (coords may be "51 -32" or "51|-32")
export const STACK_PATTERN = /^[\/!]stack\s+(?!(?:remove|move|list|edit)\b)(.+?)\s+(\d+)(?:\s+(.+))?\s*$/i;

// !remove <id>  (alias: !stack remove <id>)
export const REMOVE_PATTERN = /^[\/!](?:remove|stack\s+remove)\s+#?(\d+)\s*$/i;

// !move <id> <position>  (alias: !stack move <id> <position>)
export const MOVE_PATTERN = /^[\/!](?:move|stack\s+move)\s+#?(\d+)\s+(\d+)\s*$/i;

// !stack list
export const STACK_LIST_PATTERN = /^[\/!]stack\s+list\s*$/i;

// !undo [id]
export const UNDO_PATTERN = /^[\/!]undo(?:\s+#?(\d+))?\s*$/i;

// !def <coords> <landing> [note] [limit: N]
//   !def 123|456 12:30:45
//   !def 51 -32 12:30 my note
//   !def 51 -32 12:30 my note limit: 5000
export const DEF_PATTERN = /^[\/!]def\s+(\S+(?:\s+-?\d+)?)\s+(\S+?)(?:\s+(?!limit:)(.+?))?(?:\s+limit:\s*([\d,. ]+?))?\s*$/i;

// !close
export const CLOSE_PATTERN = /^[\/!]close\s*$/i;

// !scout <coords> <note>
export const SCOUT_PATTERN = /^[\/!]scout\s+(\S+(?:\s+-?\d+)?)\s+(.+)$/i;
export const SCOUT_VERBOSE_PATTERN = /^[\/!]scout\s+coords:\s*(\S+)\s+(?:note|message):\s*(.+)$/i;

// !lookup <coords|player>
export const LOOKUP_PATTERN = /^[\/!]lookup\s+(.+?)\s*$/i;

// !help [topic]
export const HELP_PATTERN = /^[\/!]help(?:\s+(defense|scouting|pushes|you|info|admin))?\s*$/i;

// !setup server <key> | channel <type> #channel | scoutrole [@role|clear] | timezone <name|clear> | show
export const SETUP_SERVER_PATTERN = /^[\/!]setup\s+server\s+(\S+)\s*$/i;
export const SETUP_CHANNEL_PATTERN = /^[\/!]setup\s+channel\s+(defense|stack|scout|defcalls|push)\s+(?:<#)?(\d+)>?\s*$/i;
export const SETUP_SCOUTROLE_PATTERN = /^[\/!]setup\s+scoutrole(?:\s+(?:(?:<@&)?(\d+)>?|(clear)))?\s*$/i;
export const SETUP_TIMEZONE_PATTERN = /^[\/!]setup\s+timezone\s+(.+?)\s*$/i;
export const SETUP_SHOW_PATTERN = /^[\/!]setup(?:\s+show)?\s*$/i;

// !stats ...
export const STATS_LEADERBOARD_PATTERN = /^[\/!]stats\s+leaderboard\s*$/i;
export const STATS_ME_PATTERN = /^[\/!]stats\s+me\s*$/i;
export const STATS_USER_PATTERN = /^[\/!]stats\s+user\s+<@!?(\d+)>\s*$/i;
export const STATS_PLAYER_PATTERN = /^[\/!]stats\s+player\s+(.+?)\s*$/i;
export const STATS_VILLAGE_PATTERN = /^[\/!]stats\s+village\s+(.+?)\s*$/i;
export const STATS_STACKS_PATTERN = /^[\/!]stats\s+stacks\s*$/i;
export const STATS_PLAYERS_PATTERN = /^[\/!]stats\s+players\s*$/i;
export const STATS_ADD_PATTERN = /^[\/!]stats\s+add\s+(.+?)\s+(-?\d+)(?:\s+<@!?(\d+)>)?\s*$/i;
export const STATS_RESET_PATTERN = /^[\/!]stats\s+reset\s*$/i;

// !account link <name> [@user] | unlink [@user]
export const ACCOUNT_LINK_USER_PATTERN = /^[\/!]account\s+link\s+(.+?)\s+<@!?(\d+)>\s*$/i;
export const ACCOUNT_LINK_PATTERN = /^[\/!]account\s+link\s+(.+?)\s*$/i;
export const ACCOUNT_UNLINK_PATTERN = /^[\/!]account\s+unlink(?:\s+<@!?(\d+)>)?\s*$/i;

// !sitter set <names> | del <names>
export const SITTER_SET_PATTERN = /^[\/!]sitter\s+set\s+(.+?)\s*$/i;
export const SITTER_DEL_PATTERN = /^[\/!]sitter\s+del\s+(.+?)\s*$/i;
