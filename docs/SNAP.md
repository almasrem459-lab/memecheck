# MetaMask Snap

**Status:** Snap MVP source ready (not yet listed in the MetaMask Snaps directory).

| Item | Location |
|---|---|
| Snap monorepo | https://github.com/almasrem459-lab/memecheck-snap |
| Insight API | `GET /api/snap-insight?chain=&ca=` (+ optional `to`/`data` for approve decode) |
| Shared reasons | `risk-insight.js` (site + Snap API; Solana Risk insight card) |
| Flask install | Snap README — requires MetaMask Flask on the developer machine |

### Solana parity

New severity / reason logic for the Snap is implemented in `risk-insight.js` and shown on Solana (and EVM) result pages as the **Risk insight** card. Unlimited ERC-20 approve is Snap/tx-context; Solana mirrors with the **pre-sign authority** tip when mint/freeze authority is active.

### Demo without Flask

See `memecheck-snap/demo/` HTML mock + API curl examples. This CI/box does not run MetaMask Flask.
