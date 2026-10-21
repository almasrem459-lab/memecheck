# Infra & rate limits (M2)

Live summary: https://memecheck.pages.dev/infra

## Free tier today

- Cloudflare Pages + Functions + Cache API
- Workers KV (`MEMECHECK_CACHE`) with a daily write-budget guard
- Helius key present as Pages secret (free/dev plan) + public RPC fallbacks

## Caching shipped to cut rate limits

- Proxy edge TTLs increased (pump.fun, RugCheck, GoPlus, DexScreener, GeckoTerminal)
- Stale-while-error up to 24h on proxy
- Soft-degrade (never raw 429) on snipers / liquidity flows
- Accuracy JSON + `/api/accuracy` edge-cached

## What paid would unlock (not purchased)

- Helius paid: webhooks, higher RPS, tx tracing for **dev sell speed** + **funded wallets**
- CF Workers paid: steadier cron / DO for Telegram alerts under load
- Larger KV/R2 launch index for Solana-wide DevRep

Everything runs on free tiers; paid upgrades are optional.
