# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Run bot in development mode (ts-node)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled bot (production)
npm run register     # Register slash commands with Discord (dev)
npm run register:prod  # Register slash commands from compiled dist/
npm run migrate      # Run src/migrate-map-data.ts (one-off map data migration)
npm test             # Run all vitest tests
npx vitest run path/to/file.test.ts   # Run a single test file
```

This project uses **npm** (not bun) — there is a `package-lock.json` and the Dockerfile relies on `npm ci`. Do not introduce a `bun.lockb`.

## Architecture

Discord bot for Travian: Legends defense, scout, and resource-push coordination using discord.js v14. Three parallel command surfaces all dispatch into the same actions layer.

### Three command surfaces, one actions layer

The bot accepts the same operations through three independent input paths. All three converge on `src/actions/` so business logic lives in one place.

1. **Slash commands** (`src/commands/*.ts`) — registered via `npm run register`. Each exports a `Command` (`src/types.ts`: `data` + `execute` + optional `autocomplete`). Aggregated in `src/commands/index.ts` via `registerCommand()`. Dispatched from `Events.InteractionCreate` in `src/index.ts`.
2. **Text commands** (`src/services/message-commands/`) — slash-style commands typed as plain messages (e.g. `/sent id: 1 troops: 200`). `handleTextCommand` fires on both `MessageCreate` and `MessageUpdate`, splits the message into lines, and `router.ts` regex-matches each line against `patterns.ts` to route into `handlers/`. Editing a message re-runs the command.
3. **Button + modal interactions** (`src/services/button-handlers/`) — interactive embeds (defense "SEND", scout "going/done", push, stack edit). `src/index.ts` switches on `customId` / prefix to dispatch to handlers. Modal IDs and button ID prefixes are exported as constants from `button-handlers/index.ts`; reuse them rather than hardcoding strings.

Action functions in `src/actions/*.action.ts` (e.g. `executeDefAction`, `executeSentAction`, `executePushRequestAction`) take an `ActionContext` (`{ guildId, config, client, userId }`) plus a typed input, validate, mutate persisted state, update embed messages, record history, and return a discriminated `{ success: true, ... } | { success: false, error }`. When adding a new operation, put the logic here and call it from whichever surfaces should expose it — do not duplicate logic into a command file.

`src/actions/validation.ts` and `src/actions/push-validation.ts` hold the shared pre-flight checks (config present, target resolvable, account linked, coords parseable). Use them; don't re-implement.

### Persisted state

Everything is JSON files in `data/` (mounted as a Docker volume in `docker-compose.yml`). There is no database server — `sql.js` is only used as an in-memory parser for Travian's `map.sql`.

- `data/guilds.json` — per-guild config (defense channel, scout channel, scout role, server key) via `src/config/guild-config.ts`
- `data/defense-requests.json` — active `/def` requests + per-user troop credits (`src/services/defense-requests.ts`)
- `data/push-requests.json` — active resource-push requests + per-account contributions (`src/services/push-requests.ts`)
- `data/action-history.json` — last 50 actions, used by `/undo` (`src/services/action-history.ts`). Every mutating action records an entry so it can be reversed.
- `data/player-accounts.json` — Discord user ↔ in-game account mapping (`src/services/player-accounts.ts`)
- `data/stats.json`, `data/population-history.json` — leaderboard / population tracking
- `data/maps/*.db` — SQLite (sql.js) snapshots of Travian map data, one per server

### Map data

`src/services/map-data.ts` downloads `map.sql` from `https://{serverKey}.travian.com/map.sql`, parses INSERT statements into a sql.js DB, and exposes `getVillageAt(serverKey, x, y)` returning village info including `targetMapId` (used to build rally-point links). `src/services/map-scheduler.ts` re-runs this daily for every configured server. `/setserver` (or `/configure server`) triggers an initial download.

### Single global embeds

Both defense and push systems maintain **one continuously-edited embed message per guild** (not new messages per request). `src/services/defense-message.ts` and `src/services/push-message.ts` build and `editMessage()` these embeds. The first request shows ➡️ as the priority marker. After any state change, the action layer calls the corresponding `updateGlobalMessage()` — don't post new messages.

### Travian server key format

Short form only: `ts31.x3.europe`. The full URL is built by `getFullServerUrl()` → `https://{key}.travian.com`. Never store full URLs.

## Adding new functionality

- **New slash command:** create `src/commands/yourcommand.ts`, call `registerCommand()` in `src/commands/index.ts`, run `npm run register`. If it mutates state, the `execute` handler should be a thin wrapper that builds an `ActionContext`, calls an `executeXxxAction`, and renders the result.
- **New text-command alias:** add a regex to `src/services/message-commands/patterns.ts`, a handler in `handlers/`, and a route in `router.ts`. Reuse the same action function the slash command uses.
- **New button/modal:** add ID constants and handler in `src/services/button-handlers/`, export from its `index.ts`, and add a dispatch branch in the `InteractionCreate` listener in `src/index.ts`.
- **New undoable action type:** add the type to `ActionType` in `src/services/action-history.ts` and implement reversal in `executeUndoAction` (`src/actions/undo.action.ts`).

## User-facing language

UI strings (replies, embed labels, error messages) are in **English** (e.g. `"An error occurred!"`, `SEND`). Match the existing tone and language when adding new messages.
