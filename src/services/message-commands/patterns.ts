// Pattern: /sent or /stack (or !sent, !stack) followed by target and troops, optional user mention
// Simple format: /sent 1 200 or !sent 123|456 200 or !sent 123 -456 200 or !stack 1 200 @user
export const SENT_PATTERN = /^[\/!](?:sent|stack)\s+(.+?)\s+(\d+)(?:\s+<@!?(\d+)>)?\s*$/i;
// Verbose format: /sent id: 1 troops: 200 or !sent target: 123|456 troops: 200 user: @user
export const SENT_VERBOSE_PATTERN = /^[\/!](?:sent|stack)\s+(?:id|target):\s*(\S+)\s+troops:\s*(\d+)(?:\s+user:\s*<@!?(\d+)>)?\s*$/i;

// Pattern: /scout or !scout followed by coords and message
// Coords can be space-separated: !scout 51 -32 message here
export const SCOUT_PATTERN = /^[\/!]scout\s+(\S+(?:\s+-?\d+)?)\s+(.+)$/i;
// Verbose format: /scout coords: 123|456 message: some text
export const SCOUT_VERBOSE_PATTERN = /^[\/!]scout\s+coords:\s*(\S+)\s+message:\s*(.+)$/i;

// Pattern: /def or !def followed by coords, troops, and optional message
// Coords can be space-separated: !def 51 -32 5000 or !def 51|-32 5000 message
export const DEF_PATTERN = /^[\/!]def\s+(.+?)\s+(\d+)(?:\s+(.+))?\s*$/i;

// Pattern: /deletedef or !deletedef followed by ID
export const DELETEDEF_PATTERN = /^[\/!]deletedef\s+(\d+)\s*$/i;

// Pattern: /lookup or !lookup followed by coords (can be space-separated)
export const LOOKUP_PATTERN = /^[\/!]lookup\s+(.+?)\s*$/i;

// Pattern: /stackinfo or !stackinfo (no parameters)
export const STACKINFO_PATTERN = /^[\/!]stackinfo\s*$/i;

// Pattern: /updatedef or !updatedef followed by ID and optional params
// Format: !updatedef 1 troops_sent: 500 troops_needed: 2000 message: some text
export const UPDATEDEF_PATTERN = /^[\/!]updatedef\s+(\d+)(?:\s+(.+))?$/i;

// Pattern: /undo or !undo followed by action ID
export const UNDO_PATTERN = /^[\/!]undo\s+(\d+)\s*$/i;

// Pattern: /drama or !drama with optional language (en/lt)
export const DRAMA_PATTERN = /^[\/!]drama(?:\s+(en|lt))?\s*$/i;

// Pattern: /configure or !configure with subcommands
// !configure server ts31.x3.europe
// !configure channel defense #channel (or channel ID)
// !configure channel scout #channel
// !configure scoutrole @role (or role ID, or "clear")
export const CONFIGURE_SERVER_PATTERN = /^[\/!]configure\s+server\s+(\S+)\s*$/i;
export const CONFIGURE_CHANNEL_PATTERN = /^[\/!]configure\s+channel\s+(defense|scout)\s+(?:<#)?(\d+)>?\s*$/i;
export const CONFIGURE_SCOUTROLE_PATTERN = /^[\/!]configure\s+scoutrole(?:\s+(?:(?:<@&)?(\d+)>?|(clear)))?\s*$/i;

// Pattern: /stats or !stats with subcommands
// !stats leaderboard
// !stats user @user
// !stats player PlayerName
// !stats village 123|456
// !stats stacks
// !stats reset
export const STATS_LEADERBOARD_PATTERN = /^[\/!]stats\s+leaderboard\s*$/i;
export const STATS_USER_PATTERN = /^[\/!]stats\s+user\s+<@!?(\d+)>\s*$/i;
export const STATS_PLAYER_PATTERN = /^[\/!]stats\s+player\s+(.+?)\s*$/i;
export const STATS_VILLAGE_PATTERN = /^[\/!]stats\s+village\s+(.+?)\s*$/i;
export const STATS_STACKS_PATTERN = /^[\/!]stats\s+stacks\s*$/i;
export const STATS_RESET_PATTERN = /^[\/!]stats\s+reset\s*$/i;

// Pattern: /addstat or !addstat followed by coords, troops (can be negative), and optional user mention
// !addstat 123|456 5000 or !addstat 123 -456 -500 @user
export const ADDSTAT_PATTERN = /^[\/!]addstat\s+(.+?)\s+(-?\d+)(?:\s+<@!?(\d+)>)?\s*$/i;

// Pattern: /account or !account with subcommands
// !account set PlayerName
// !account del
export const ACCOUNT_SET_PATTERN = /^[\/!]account\s+set\s+(.+?)\s*$/i;
export const ACCOUNT_DEL_PATTERN = /^[\/!]account\s+del\s*$/i;

// Pattern: /sitter or !sitter with subcommands
// !sitter set Player1, Player2
// !sitter del Player1, Player2
export const SITTER_SET_PATTERN = /^[\/!]sitter\s+set\s+(.+?)\s*$/i;
export const SITTER_DEL_PATTERN = /^[\/!]sitter\s+del\s+(.+?)\s*$/i;

// Pattern: /players or !players
export const PLAYERS_PATTERN = /^[\/!]players\s*$/i;
