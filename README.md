# Drama: a Discord bot for Travian alliances

Drama runs an alliance's defense, scouting and resource pushes inside Discord. Members ask for troops or resources, report what they sent, and the bot keeps a live panel or thread up to date with the progress. It reads the Travian map, so every request shows the village name, its owner, and a button that opens the rally point in the game.

This page tells a Discord server admin how to add the bot, set it up, and run it without help. Every step names the exact button or command.

## What it does

- **Stack queue.** A long-term list of villages that need defense troops. One panel in one channel shows every open request with its progress. A request leaves the queue when it gets enough troops.
- **Defense calls.** One thread per incoming attack, with the landing time. Members report troops inside the thread. The card turns green when the troop limit is reached and grey when the attack has landed.
- **Scouting.** Ask the scouts to check a village. Scouts press "I'm going", give their arrival time, and post the report link. The bot pings the requester when the scouts arrive.
- **Resource pushes.** One thread per village that needs resources. Members report what they sent, and the bot tracks every account's total.
- **Stats.** Leaderboards for troops sent and resources pushed, per member, per player and per village.
- **Undo.** Every change has an Undo button. `/undo` reverses your last action.
- **Reminders.** Repeating messages posted to a channel at a set interval.
- **Confeds.** Several alliances can share one Discord server. Each one gets its own channels, queues and stats.
- **Permissions.** Pick which roles may create requests and which roles may manage anyone's request.

## Add the bot

You need the **Manage Server** permission on the Discord server.

1. Open this link: https://discord.com/oauth2/authorize?client_id=1451553256252641430
2. Pick your server and press **Authorize**. The link asks only for the permissions the bot uses: View Channels, Send Messages, Send Messages in Threads, Create Public Threads, Manage Threads, Read Message History and Embed Links.
3. The bot posts a welcome panel ("Thanks for adding Drama") in the server's system channel. If it cannot write there, it posts in the first text channel it can write to.

The slash commands appear on their own. If they do not show after a minute, press Ctrl+R in Discord (Cmd+R on a Mac), or restart the Discord app.

## Set it up

All setup happens on one panel. The welcome panel from the step above is that panel. To open it again at any time, run `/setup panel`. Only admins see and use `/setup`.

1. **Travian server.** Press **Set server** and type the server key. The key is the part of the game URL before `.travian.com`. For `https://ts31.x3.europe.travian.com`, the key is `ts31.x3.europe`. You can also paste the full URL; the bot cuts it down to the key. The bot then downloads the map for that server, and refreshes it every day.
2. **Channels.** Pick one text channel for each feature you want: Stack requests, Defense calls, Scouting, Resource pushes. You can start with one channel and add the others later. Use a separate channel for each feature.
3. **Scout role (optional).** Pick the role the bot mentions on every scout request. In **Server Settings → Roles**, turn on **Allow anyone to @mention this role** for it, or the mention does not ping.
4. **Timezone (optional).** Press **Set timezone** and type an IANA timezone name, for example `Europe/Vilnius`. Use the Travian server's timezone. The bot reads typed landing times (such as `14:30`) in this timezone. Without a timezone, it uses UTC.
5. **Permissions (optional).** Pick roles for two lists. See [Permissions](#permissions) below. Leave both empty to keep the defaults.
6. Press **Finish setup**. The button works once the server and at least one channel are set. The bot posts the empty stack panel in the stack channel, the "Request defense" hub in the defense-calls channel, and a one-line hint in the push and scout channels.
7. Press **Post account-link reminder**. It posts a message with **Add** and **Not playing** buttons, so every member can link their in-game account.

`/setup show` prints the current setup as a checklist. Every picker on the panel saves at once; there is no save button.

### Link accounts

Members link their Discord user to their in-game player name with `/account link`, or with the **Add** button on the account-link reminder. Defense calls and resource pushes need a linked account. If a member is not linked, the error message has a **Link account** button.

Sitters run `/sitter set` with the names of the accounts they sit.

### Permissions

Two role lists decide who may do what. Change them on the setup panel or with `/permissions add`, `/permissions remove` and `/permissions show`. Only members with the Administrator permission can change them.

- **Create requests** (`request`): who may create stack, defense-call, push and scout requests. Empty list: everyone.
- **Manage any request** (`manage`): who may change, close or delete anyone's request, edit other people's contributions, and undo other people's actions. Empty list: admins only.

Some rules always apply. Administrators can do everything. The member who created a request can always edit and close it. Anyone can report what they sent and undo their own actions.

## Use each feature

Most work happens through buttons on the bot's messages. Every slash command does the same from any channel. Replies to the member who acted are only visible to them. The panels and threads show the public result.

### Stack queue

The stack panel lives in the stack-requests channel and always stays the last message there. Each request shows the village, its owner, a progress bar, the note, and a **Send** button that opens the rally point in the game.

- Press **Request stack**, or run `/stack request` with the coordinates (`123|456`), the troops needed, and an optional note.
- Press **I sent troops**, or run `/stack sent`, to report troops. Pick the request, type the amount, and optionally pick another member under "Sent by" to credit them.
- Press **Edit**, or run `/stack edit`, to change troops sent, troops needed, or the note.
- `/stack move` changes a request's place in the queue. `/stack remove` deletes it. `/stack list` posts the panel again.

Every request has a fixed number, such as `#41`. Commands accept the number or the coordinates.

### Defense calls

The defense-calls channel holds a hub message with a **Request defense** button and the number of open calls.

1. Press **Request defense**, or run `/def request` with the coordinates, the landing time, an optional note, and an optional troop limit. The landing time can be `14:30`, `14:30:15`, or the text you copy from Travian's troop movements (`in 01:23:45 hrs. at 14:30:15`).
2. The bot opens a thread for the attack with a card at the top. The card shows the village, the landing time, and who sent what.
3. Inside the thread, members press **I sent troops** or run `/def sent`. **Sent for someone** credits another member. **Edit troops** or `/def edit` fixes a reported total; 0 removes it.
4. The card turns green ("Covered") when the troop limit is reached, and grey ("Landed") at the landing time.
5. Press **Close** or run `/def close` to close the call. The bot archives the thread and keeps the data. Undo reopens it.

### Scouting

1. Run `/scout request` with the coordinates and what to look for, for example `WWK or fake?`. The bot posts a card in the scouting channel and mentions the scout role.
2. A scout presses **I'm going** and types when the scouts land. The card lists everyone who is going.
3. When the scouts land, the bot pings the member who asked.
4. The scout presses **Report result**, or runs `/scout result`, and pastes the in-game report link. The card then shows a **Report** button.

### Resource pushes

1. Run `/push request` with the coordinates and the total resources needed. The bot opens a thread in the push channel with a card.
2. Inside the thread, members press **I sent resources** or run `/push sent`. The bot adds the amount to their linked account.
3. When the total is reached, the bot marks the thread with ✅ and posts a thank-you.
4. **Edit amount** or `/push edit` changes the total needed. **Close** or `/push close` archives the thread. `/push delete` removes the push and its thread for good and cannot be undone.

### Stats, lookup and undo

- `/stats leaderboard`, `/stats me`, `/stats user`, `/stats player`, `/stats village` and `/stats stacks` show defense stats.
- `/push stats leaderboard` and `/push stats player` show push stats.
- `/lookup` finds a village by coordinates or a player by name.
- Every confirmation has an **Undo** button. `/undo` reverses your most recent action, and `/undo` with an `id` reverses that action.
- `/help` lists every command inside Discord.

### Reminders

`/reminder add` posts a message to the current channel every N minutes between two times of day. The times are in UTC. `/reminder list` shows all reminders, and `/reminder delete` removes one by its number. Only admins can use `/reminder`.

## Confeds

One Discord server can host several confederations. Each confed is bound to a Discord category. Every channel in that category, and every thread in those channels, belongs to that confed. All other channels belong to the main confed.

1. Create a category for the confed, with its own channels inside it.
2. Run `/setup confed add` with the confed's name and the category.
3. Run `/setup panel` inside a channel of that category. It opens that confed's panel. Pick the confed's channels (they must be inside its category) and its scout role, then press **Finish setup**.

Each confed has its own requests, request numbers, undo history and stats. The Travian server, timezone, linked accounts, sitters, reminders and permissions are shared by the whole Discord server. Commands have no confed option: the bot picks the confed from the channel you run the command in. `/setup confed remove` removes a confed; its category goes back to the main confed.

## Command reference

Options in brackets are optional. "Admin" on a subcommand means a member with Administrator or Manage Channels. Discord shows `/setup` and `/reminder` only to members with Manage Server.

### Defense

| Command | What it does | Options |
| --- | --- | --- |
| `/stack request` | Add a village to the stacking queue | coords, troops, [note] |
| `/stack sent` | Report troops you sent to a queue request | target, troops, [for] |
| `/stack edit` | Change a request, or open its editor when no field is given | id, [troops_sent], [troops_needed], [note] |
| `/stack remove` | Remove a request from the queue | id |
| `/stack move` | Move a request to another position in the queue (1 is the top) | id, position |
| `/stack list` | Post the queue panel again | |
| `/def request` | Open a defense thread for an incoming attack | coords, landing, [note], [limit] |
| `/def sent` | Report troops you sent (inside the defense thread) | troops, [for] |
| `/def edit` | Fix your reported troops in this defense thread (0 removes them) | troops, [for] |
| `/def close` | Close this defense call and archive the thread | |

### Scouting

| Command | What it does | Options |
| --- | --- | --- |
| `/scout request` | Ask the scouts to check a village | coords, note |
| `/scout result` | Post the in-game report link for an open scout request | target, link |

### Pushes

| Command | What it does | Options |
| --- | --- | --- |
| `/push request` | Open a push thread for a village that needs resources | coords, amount |
| `/push sent` | Report resources you sent (inside the push thread) | amount, [for] |
| `/push edit` | Change how many resources this push needs (inside the thread) | amount |
| `/push close` | Close this push and archive the thread (requester or manager) | |
| `/push delete` | Delete this push and its thread for good (manager, no undo) | |
| `/push stats leaderboard` | Players ranked by total resources sent | |
| `/push stats player` | Push stats for one player | name |
| `/push stats edit` | Edit a player's push stats (admin) | player, amount |
| `/push stats transfer` | Move all push stats from one player to another (admin) | from, to |
| `/push contributor edit` | Edit a contributor's amount (in the push thread) | player, amount |
| `/push contributor transfer` | Move a contribution to another player (in the push thread) | from, to |

### You

| Command | What it does | Options |
| --- | --- | --- |
| `/account link` | Link an in-game account to yourself, or to another member | name, [user] |
| `/account unlink` | Remove the link between a Discord user and an in-game account | [user] |
| `/account rename` | Rename an in-game account everywhere it is stored (admin) | old, new |
| `/account reminder` | Post the account-link reminder with Add / Not playing buttons (admin) | |
| `/sitter set` | Mark yourself as a sitter for one or more players | names (comma-separated) |
| `/sitter del` | Stop being a sitter for one or more players | names (comma-separated) |

### Info

| Command | What it does | Options |
| --- | --- | --- |
| `/lookup` | Look up a village by coordinates or a player by name | query |
| `/stats leaderboard` | Members ranked by troops sent | |
| `/stats me` | Your own troops sent, per village | |
| `/stats user` | Troops sent by one member | user |
| `/stats player` | Defense collected by each village of a Travian player | name |
| `/stats village` | Who sent defense to one village | coords |
| `/stats stacks` | Villages ranked by defense collected | |
| `/stats players` | Linked accounts with their Discord users and sitters | |
| `/stats add` | Add or subtract troops in the stats without a request (admin) | coords, troops, [for] |
| `/stats reset` | Reset all defense stats; inside a confed's category, that confed's (admin) | |
| `/undo` | Undo your most recent action, or one action by its id | [id] |
| `/help` | List every command, or one topic in full | [topic] |

### Admin

| Command | What it does | Options |
| --- | --- | --- |
| `/setup server` | Set the Travian server the bot reads map data from | value (for example `ts31.x3.europe`) |
| `/setup channel` | Set the channel for one feature | type, value |
| `/setup timezone` | Set the timezone typed landing times are in | value (IANA name, or `clear` for UTC) |
| `/setup scoutrole` | Set the role mentioned on scout requests; leave empty to clear it | [role] |
| `/setup show` | Show the current setup | |
| `/setup panel` | Open the setup panel; inside a confed's category, that confed's panel | |
| `/setup confed add` | Add a confed bound to a category | name, category |
| `/setup confed remove` | Remove a confed; its category goes back to the main confed | name |
| `/reminder add` | Add a repeating reminder in this channel | text, every (minutes), from, to (24h, UTC) |
| `/reminder list` | List all reminders in this server | |
| `/reminder delete` | Delete a reminder by its id | id |
| `/permissions add` | Give a role the `request` or `manage` permission (Administrator only) | permission, role |
| `/permissions remove` | Take a permission from a role (Administrator only) | permission, role |
| `/permissions show` | Show which roles have each permission | |

## Troubleshooting

**The slash commands do not show.** The bot registers its commands when it starts, and they reach every server it is in. Wait a minute, then press Ctrl+R in Discord or restart the app. If `/setup` is missing but other commands show, you lack the Manage Server permission.

**"The bot is not set up" error.** An admin has not set the Travian server or the channel for that feature. Admins get an **Open setup** button on the error. Other members get a **Ping an admin** button.

**"Not linked" error.** Run `/account link` with your in-game player name, or press the **Link account** button on the error, then try again.

**The bot does not post in a channel, or cannot create threads.** A channel permission override, or a private channel, blocks it. In the channel settings, give the bot's role View Channel, Send Messages, Send Messages in Threads, Create Public Threads, Manage Threads, Read Message History and Embed Links.

**Villages show only coordinates, or `/lookup` finds nothing.** The server key is wrong or the map download failed. Run `/setup show` and check the key against the game URL. Set it again with `/setup server`; the bot downloads the map at once.

**Landing times are off by some hours.** The timezone does not match the Travian server. Set it with `/setup timezone`.

**Someone made a mistake.** Press **Undo** on the confirmation, or run `/undo`. Members with the `manage` permission can undo anyone's action by its id.

## Self-hosting

You can run your own copy of the bot instead of adding the shared one.

1. Create an application and a bot at https://discord.com/developers/applications. Under **Bot**, copy the bot token.
2. Clone this repository.
3. Put the token in a `.env` file next to `docker-compose.yml`: `DISCORD_TOKEN=your_bot_token`.
4. Run `docker compose up -d --build`.
5. Invite your bot with the `bot` and `applications.commands` scopes and the permissions integer `326417599488`.

The bot stores all data as JSON files in `/app/data`, which `docker-compose.yml` mounts as the `bot-data` volume. Back up that volume. The bot registers its slash commands globally every time it starts, so there is no separate register step.

To run it without Docker, use Node 24: `npm ci`, `npm run build`, then `DISCORD_TOKEN=... npm start`. `npm test` runs the tests.

## License

MIT. See [LICENSE](LICENSE).
