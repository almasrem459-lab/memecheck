# memecheck-chat

Separate Cloudflare Worker that hosts the **ChatRoom** Durable Object behind MemeCheck's `/chat` page.
The Pages project binds to it (`cf-dist/wrangler.toml` → `[[durable_objects.bindings]] CHAT / ChatRoom / script_name = "memecheck-chat"`),
and the Pages Functions `functions/api/chat.js` + `functions/api/chat-admin.js` are the only way in (`workers_dev = false`).

## Architecture
```
browser ──wss /api/chat?ws=1──▶ Pages Function (adds x-mc-ip from CF-Connecting-IP) ──DO binding──▶ ChatRoom "global" (SQLite DO)
        ◀── live broadcast (WebSocket Hibernation) ────────────────────────────────────────────────┘
fallback: GET /api/chat?since=<id> every 8 s (visible tab only) + POST /api/chat {op:'post'|'report'}
```
* One room = one Durable Object (`idFromName('global')`), SQLite storage (Workers Free). No KV.
* Keeps the newest 250 rows, shows the newest 200 visible messages on load.
* WebSocket Hibernation API: idle sockets cost no duration; `ping` → `pong` is an auto-response (no wake-up).
* IPs are never stored: only `sha256(salt|ip)`; the salt is generated inside the DO.

## Moderation (server side, `src/filter.js` + `src/index.js`)
* plain text only: tags/entities/invisible + bidi-override chars stripped; client renders with `textContent` only
* max 300 chars; long repeated chars collapsed; ALL-CAPS lowered
* rate limits per IP hash **and** per user id: 1 msg / 5 s, 20 msgs / 10 min
* links blocked except `memecheck.pages.dev` (incl. obfuscations like `t . me/x`, `evil(dot)com`, `hxxp`); bare platform names (pump.fun, dexscreener…) may be mentioned but not linked
* scam-phrase filter (EN + AR, matched on a squashed form so `s.e.n.d s o l` hits): DM me, send SOL, seed phrase, private key, wallet connect, airdrop claim, support team, WhatsApp, …
* slurs reject the message, mild swearing is masked
* duplicate suppression (same text from you in 10 min; same text 2× from anyone in 5 min)
* max 3 contract addresses per message
* reserved nicknames (admin / mod / support / team / MemeCheck / official …), plus a 4-hex ID tag derived from the user id so nicknames can't be impersonated
* 3 blocked scam/link/slur attempts in 10 min → automatic 1 h mute (IP)
* ⚑ report: 3 distinct reporter IPs auto-hide a message (10 reports / 10 min per IP)

## Admin
The token is the Worker secret `ADMIN_TOKEN` (`wrangler secret put ADMIN_TOKEN`), compared in constant time inside the DO.
```sh
T=$(cat /workspace/chat-admin-token.txt); A(){ curl -s -X POST https://memecheck.pages.dev/api/chat-admin -H "authorization: Bearer $T" -H 'content-type: application/json' -d "$1"; echo; }
A '{"action":"list","limit":30}'              # recent messages incl. hidden, report counts, author hash prefixes
A '{"action":"delete","id":123}'              # delete one message (also {"ids":[1,2,3]})
A '{"action":"delete_user","id":123}'         # delete every stored message by that message's author
A '{"action":"ban","id":123,"hours":24}'      # ban author's IP hash + user id, and delete their messages ("keep":true to keep them)
A '{"action":"bans"}'                         # active bans (key prefixes)
A '{"action":"unban","key":"i:53f4100565"}'   # lift a ban by key prefix from "bans"
A '{"action":"unhide","id":123}'              # restore a report-hidden message
A '{"action":"post","text":"Welcome!"}'       # official message with the "MemeCheck team" badge
A '{"action":"clear"}'                        # wipe the room
A '{"action":"stats"}'
```

## Deploy
```sh
cd chat-worker && npx wrangler deploy && npx wrangler secret put ADMIN_TOKEN   # once; before the Pages deploy that carries the binding
```
