# MemeCheckShield Telegram rug-alert bot (M3)

Always-on Cloudflare Worker. Users `/watch` a Solana CA; the worker alerts on:

- **Liquidity pull** (≥50% liq drop, or pair disappearance)
- **Large dump** (≥40% price drop — free-tier proxy for large sells / possible dev dump)
- **Risk upgrade** (MemeCheckShield level increases via `/api/deep`)

Exact **dev-sell** detection needs paid Helius webhooks — documented on `/infra`. Until then dump/liq proxies fire.

## Setup (needs Jojo's bot token)

1. Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy token.
2. **Do not commit the token.** Ask Jojo / parent to provide it, then:

```bash
cd alert-worker
wrangler secret put TELEGRAM_BOT_TOKEN
# optional: wrangler secret put ALERT_CRON_SECRET
wrangler deploy
```

3. Set Telegram webhook to `https://<worker-host>/telegram`:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://memecheck-alert.<account>.workers.dev/telegram"
```

4. In Telegram: `/start` → `/watch <CA>`.

## Commands

| Command | Action |
|---|---|
| `/watch <CA>` | Start watching |
| `/unwatch <CA>` | Stop |
| `/list` | Your watches |
| `/help` | Help |

## Health

`GET /health` → `{ telegram: true/false, origin }`. If `telegram: false`, the token secret is missing.

## Status this ship

Worker + docs are in the OSS repo. **TELEGRAM_BOT_TOKEN is not set** — parent should request it from Jojo before production alerts.
