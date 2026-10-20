# MemeCheckShield revenue pack — 2026-10-20

**Jojo ask:** «ساوي كلشي» for site revenue.

| | |
|---|---|
| Prod | https://memecheck.pages.dev |
| Preview | https://revenue-preview.memecheck.pages.dev  |
| Pay-to Phantom | `F29KLNySMghCZbpMqhNaR8k3jMUZHd485CHxX7x9Z9u5` |
| USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Source | `/workspace/cf-dist` → OSS `github.com/almasrem459-lab/memecheck` (`ae51686`) |
| Preview deploy | `93269720` · alias revenue-preview |
| Prod deploy | `85feb8ac` (Production / main) |

## Live now

| Surface | Status |
|---|---|
| **Get Verified** (75 USDC / 30d, Low-risk only) | UI modal + `/api/verified` on-chain USDC verify → KV `revenue:v1` |
| **Sponsored** homepage + smart strip | Labeled Sponsored; inventory via same API |
| **Advertise** `/advertise` | Prices + pay address (EN/AR) |
| **Pro waitlist** `/pro` | Free vs Pro; waitlist → `/api/feedback` `[pro_waitlist]` |
| **Buy/Sell Jupiter** | Still works; fee **off** until referral account set |
| **Telegram alert-worker** | Code ready; token **not** set |
| Payment ≠ score | Badge copy states score unchanged |

## Waiting on Jojo

1. **Jupiter `REFERRAL_ACCOUNT`** from https://referral.jup.ag → paste into `swap.js` (see `revenue-jupiter-setup-2026-10-20.md`).
2. **`TELEGRAM_BOT_TOKEN`** from @BotFather → `wrangler secret put` in `alert-worker`.
3. Optional: **`REVENUE_ADMIN_TOKEN`** Pages secret for manual approve if a tx fails auto-verify.
4. Optional: real terminal affiliate URLs in `revenue-cfg.js` → `TERMINAL_REFS`.

## Verified how-to (user)

1. Scan Solana CA on memecheck.pages.dev.
2. Only if result is **Low risk**, tap **Get Verified**.
3. Send **≥75 USDC** (SPL) to `F29KLNySMghCZbpMqhNaR8k3jMUZHd485CHxX7x9Z9u5` (optional memo = mint).
4. Paste tx signature → API verifies via public Solana RPC → listing stored 30 days.
5. Result shows **Verified / Sponsored listing** badge; risk points/level unchanged.
6. Fallback: Jojo pastes mint+tx for admin approve (`action: approve` + Bearer token).

## Ads how-to

- Homepage / smart **Sponsored** strip: **50 USDC / week**.
- Same pay address; claim with `kind: "sponsored"` or admin approve into `sponsored[]`.

## Bots

Paper **consensus-bot** + **majors-bot** left running (not stopped for this ship).

## Deploy habit

Preview branch `revenue-preview` → smoke QA → promote `--branch main` (or default prod) → push OSS.
