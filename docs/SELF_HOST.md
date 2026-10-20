# Self-host guide — MemeCheckShield

Requirements: Node 18+ (22 recommended), [Wrangler](https://developers.cloudflare.com/workers/wrangler/), a Cloudflare account.

## 1. Clone & local preview

```bash
git clone https://github.com/almasrem459-lab/memecheck.git
cd memecheck
cp .dev.vars.example .dev.vars   # optional HELIUS_KEY
npm i -g wrangler                # or use npx
wrangler pages dev . --kv MEMECHECK_CACHE
# open http://localhost:8788
```

Without `HELIUS_KEY` the app still works on public Solana RPCs (slower, more rate limits).

## 2. Create Pages project + KV

```bash
wrangler kv namespace create MEMECHECK_CACHE
# paste the id into wrangler.toml [[kv_namespaces]]
wrangler pages project create memecheck
wrangler pages secret put HELIUS_KEY --project-name memecheck
wrangler pages deploy . --project-name memecheck
```

## 3. Optional workers

| Worker | Folder | Purpose |
|---|---|---|
| Community chat | `chat-worker/` | Durable Object for `/chat` (Pages binds `CHAT`) |
| Smart money cron | `smart-worker/` | Refreshes `/api/smart` KV |
| Telegram alerts | `alert-worker/` | `/watch` CA alerts — needs `TELEGRAM_BOT_TOKEN` from Jojo |

Chat binding is already in root `wrangler.toml` (`script_name = "memecheck-chat"`). Deploy chat-worker before relying on `/chat`.

## 4. Accuracy tracker (ops)

Hourly evidence job lives outside the static site (operator box). It regenerates `rugs.html`, `accuracy-daily.json`, `accuracy-monthly.json`. Public URLs:

- https://memecheck.pages.dev/rugs
- https://memecheck.pages.dev/report
- https://memecheck.pages.dev/api/accuracy

## 5. Branding

Product brand: **MemeCheckShield**. Live site: https://memecheck.pages.dev

## 6. Safety

- No secrets in git
- Do not invent paid spend or Telegram tokens
- Paper trading bots on `/smart` are separate — leave them alone unless asked
