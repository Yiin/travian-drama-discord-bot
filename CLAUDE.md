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

1. **Slash commands** (`src/commands/*.ts`) — registered via `npm run register`. Each exports a `Command` (`src/types.ts`: `data` + `execute` + optional `autocomplete`, plus `topic` and `summary` for `/help`). Aggregated in `src/commands/index.ts` via `registerCommand()`. Dispatched from `Events.InteractionCreate` in `src/index.ts`. Commands are grouped by feature with subcommands: `/stack request|sent|edit|remove|move|list`, `/def request|sent|close`, `/push request|sent|edit|close|delete|contributor …|stats …`, `/scout request`, `/account link|unlink|rename|reminder`, `/sitter set|del`, `/lookup`, `/stats leaderboard|me|user|player|village|stacks|players|add|reset`, `/undo`, `/help`, `/setup server|channel|timezone|scoutrole|show`, `/reminder add|list|delete`. Build every command with `guildCommand()` from `src/commands/shared.ts` (sets guild-only contexts). Admin-only top-level commands (`/setup`, `/reminder`) carry `setDefaultMemberPermissions(ManageGuild)`; admin subcommands inside mixed groups use `requireAdmin()` at runtime. Option names: `note` for free text, `for` when crediting another member, `limit` for a troop cap. Options that pick a request use autocomplete (`stackRequestChoices()`, labels from `src/utils/choices.ts`).
2. **Text commands** (`src/services/message-commands/`) — the same operations typed as plain messages with the `!` prefix (`!sent 41 200`, `!stack 12|-45 5000 note`, `!def 12|-45 14:30`, `!help`, `!setup …`). `handleTextCommand` fires on both `MessageCreate` and `MessageUpdate`, splits the message into lines, and `router.ts` regex-matches each line against `patterns.ts` to route into `handlers/`. Editing a message undoes what it did before and re-runs the new content.
3. **Button + modal interactions** (`src/services/button-handlers/`) — interactive embeds (defense "SEND", scout "going/done", push, stack edit). `src/index.ts` switches on `customId` / prefix to dispatch to handlers. Modal IDs and button ID prefixes are exported as constants from `button-handlers/index.ts`; reuse them rather than hardcoding strings.

Action functions in `src/actions/*.action.ts` (e.g. `executeDefAction`, `executeSentAction`, `executePushRequestAction`) take an `ActionContext` (`{ guildId, config, client, userId }`) plus a typed input, validate, mutate persisted state, update embed messages, record history, and return a discriminated `{ success: true, ... } | { success: false, error }`. When adding a new operation, put the logic here and call it from whichever surfaces should expose it — do not duplicate logic into a command file.

`src/actions/validation.ts` and `src/actions/push-validation.ts` hold the shared pre-flight checks (config present, target resolvable, account linked, coords parseable). Use them; don't re-implement.

### Persisted state

Everything is JSON files in `data/` (mounted as a Docker volume in `docker-compose.yml`). There is no database server — `sql.js` is only used as an in-memory parser for Travian's `map.sql`.

- `data/guilds.json` — per-guild config (defense channel, scout channel, scout role, server key) via `src/config/guild-config.ts`
- `data/defense-requests.json` — stack queue (`/stack`) requests + per-user troop credits (`src/services/defense-requests.ts`)
- `data/def-calls.json` — defense calls (`/def`), one thread each (`src/services/def-calls.ts`)
- `data/push-requests.json` — active resource-push requests + per-account contributions (`src/services/push-requests.ts`)

Stack, def-call and push requests carry a **stable `id`** from a per-guild `nextId` counter. Every lookup, customId, thread name, action-history entry and user-facing `#41` uses that id; queue position is array order and is shown separately. Records written before ids existed are migrated on first load (`migrateIds()` in each service), which also expires the old undo history via `src/services/history-expiry.ts`.
- `data/action-history.json` — last 50 actions, used by `/undo` (`src/services/action-history.ts`). Every mutating action records an entry so it can be reversed.
- `data/player-accounts.json` — Discord user ↔ in-game account mapping (`src/services/player-accounts.ts`)
- `data/stats.json`, `data/population-history.json` — leaderboard / population tracking
- `data/maps/*.db` — SQLite (sql.js) snapshots of Travian map data, one per server

### Map data

`src/services/map-data.ts` downloads `map.sql` from `https://{serverKey}.travian.com/map.sql`, parses INSERT statements into a sql.js DB, and exposes `getVillageAt(serverKey, x, y)` returning village info including `targetMapId` (used to build rally-point links). `src/services/map-scheduler.ts` re-runs this daily for every configured server. `/setup server` triggers an initial download.

### Single global embeds

Both defense and push systems maintain **one continuously-edited embed message per guild** (not new messages per request). `src/services/defense-message.ts` and `src/services/push-message.ts` build and `editMessage()` these embeds. The first request shows ➡️ as the priority marker. After any state change, the action layer calls the corresponding `updateGlobalMessage()` — don't post new messages.

### Travian server key format

Short form only: `ts31.x3.europe`. The full URL is built by `getFullServerUrl()` → `https://{key}.travian.com`. Never store full URLs.

## Adding new functionality

- **New slash command:** add a subcommand to the matching group in `src/commands/`, or create `src/commands/yourcommand.ts` with `guildCommand()`, a `topic` and a `summary`, and call `registerCommand()` in `src/commands/index.ts`; run `npm run register`. `/help` (`src/services/help.ts`) is generated from the registry, so subcommand descriptions are the help text. If it mutates state, the `execute` handler should be a thin wrapper that builds an `ActionContext`, calls an `executeXxxAction`, and renders the result with `confirmationEdit()`.
- **New text-command alias:** add a regex to `src/services/message-commands/patterns.ts`, a handler in `handlers/`, and a route in `router.ts`. Reuse the same action function the slash command uses.
- **New button/modal:** add ID constants and handler in `src/services/button-handlers/`, export from its `index.ts`, and add a dispatch branch in the `InteractionCreate` listener in `src/index.ts`.
- **New undoable action type:** add the type to `ActionType` in `src/services/action-history.ts` and implement reversal in `executeUndoAction` (`src/actions/undo.action.ts`).

## User-facing language

UI strings are in **English**. A vitest (`src/__tests__/no-lithuanian.test.ts`) fails the build on Lithuanian leftovers.

- **Errors and confirmations** live only in `src/actions/messages.ts`. Errors read `⚠️ **What went wrong.** How to fix it.` and name the fix as a clickable command mention via `cmd("stack sent")`. Successes read `✅ What changed. New state.` Slash and modal replies use `confirmation()` / `confirmationEdit()`, which add an **Undo** button (`undo:<actionId>`) and a jump link. Never write a new error string inline.
- **Numbers** are formatted only through `src/utils/format.ts`: `formatTroops()` → `1,200`, `formatResources()` → `500k` / `1.2M`, arrows are `ARROW` (`→`).
- **Replies to the actor are ephemeral.** Public output goes to the live panels and the audit line the panel posts (with `SuppressNotifications`).
- **Text commands** use the `!` prefix in docs and help (`/`-prefixed plain text is still accepted). Each message owns the actions it produced (`messageActions` in action history): editing a message undoes them and re-runs the new content. Failures react ❌ and reply with a message that deletes itself after 30 s; nothing fails silently.
- Vocabulary: accounts are **linked / unlinked**, never "associated". The free-text field on a request is a **note**.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
