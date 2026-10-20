# Environment variables & secrets — MemeCheckShield

**Never commit secrets.** Use Cloudflare Pages / Worker secrets or a local git-ignored `.dev.vars`.

| Name | Where | Required | Purpose |
|---|---|---|---|
| `HELIUS_KEY` | Pages secret / `.dev.vars` | optional (recommended) | Helius RPC + DAS for Solana deep checks, snipers/flows, DevRep creator fallback |
| `MEMECHECK_CACHE` | KV binding in `wrangler.toml` | yes for `/api/cache`, `/api/deep` | Shared scan-result cache (free tier write budget guarded in code) |
| `AI` | binding in `wrangler.toml` | optional | Workers AI for Ask AI / summaries |
| `ADMIN_TOKEN` | `memecheck-chat` Worker secret | chat admin only | `/api/chat-admin` |
| `TELEGRAM_BOT_TOKEN` | `memecheck-alert` Worker secret | for live Telegram alerts | From @BotFather — **ask Jojo; do not invent** |
| `ALERT_CRON_SECRET` | alert-worker secret | optional | Protects manual `POST /cron` |
| `MEMECHECK_ORIGIN` | alert-worker var | optional | Default `https://memecheck.pages.dev` |
| `REFERRAL_ACCOUNT` | constant in `swap.js` | optional | Jupiter referral; empty = no fee |
| `REVENUE_ADMIN_TOKEN` | Pages secret | optional | Manual approve for `/api/verified` when on-chain claim needs help |
| GA id | `index.html` | optional | Analytics |

See also: [SELF_HOST.md](./SELF_HOST.md) · live notes: https://memecheck.pages.dev/infra
