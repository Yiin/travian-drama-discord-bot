# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Run bot in development mode (ts-node)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled bot (production)
npm run register     # Register slash commands with Discord
```

## Architecture

Discord bot for Travian: Legends defense/scout coordination using discord.js v14 with slash commands.

**Entry Points:**
- `src/index.ts` - Bot client, event handlers, command dispatch, starts map scheduler
- `src/register-commands.ts` - Registers slash commands with Discord API

**Command System:**
- Commands in `src/commands/*.ts` export a `Command` object with `data` (SlashCommandBuilder) and `execute` function
- Registered in `src/commands/index.ts` via `registerCommand()`
- Command type defined in `src/types.ts`

**Services:**
- `src/services/map-data.ts` - Downloads/parses Travian map.sql files, stores in SQLite (sql.js), provides village lookups by coordinates
- `src/services/map-scheduler.ts` - Daily auto-update of map data for all configured servers
- `src/services/defense-requests.ts` - Manages defense request data (add/update/remove requests, track troops sent)
- `src/services/defense-message.ts` - Builds and updates the global defense message embed

**Configuration:**
- `src/config/guild-config.ts` - Per-guild settings (defense/scout channels, server key)
- Data stored in `data/guilds.json` and `data/defense-requests.json`

**Travian Server Key Format:**
- Short form only: `ts30.x3.europe` (not full URL)
- Full URL constructed via `getFullServerUrl()`: `https://{key}.travian.com`

## Adding New Commands

1. Create `src/commands/yourcommand.ts` exporting a `Command` object
2. Import and call `registerCommand()` in `src/commands/index.ts`
3. Run `npm run register` to update Discord

## Key Patterns

**Defense Request Flow:**
1. `/def` adds request to `defense-requests.json` and calls `updateGlobalMessage()`
2. Global message is a single embed that gets edited (not recreated)
3. `/sent` reports troops, updates totals, removes when complete
4. First request shows ➡️ arrow to indicate priority

**Map Data Flow:**
1. `/setserver` saves server key and triggers initial map.sql download
2. `map-data.ts` parses SQL INSERT statements into SQLite database
3. `getVillageAt(serverKey, x, y)` returns village info including `targetMapId` for rally links
