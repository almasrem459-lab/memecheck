# Jupiter Ultra referral setup (Jojo) — 2026-10-20

**Phantom pay wallet ≠ Jupiter referral account.**

| Role | Value |
|---|---|
| Payments (Verified / ads) | `F29KLNySMghCZbpMqhNaR8k3jMUZHd485CHxX7x9Z9u5` |
| Swap fee referral | *(empty — waiting on Jojo)* |
| Fee bps in code | `REFERRAL_FEE_BPS = 50` (0.5%) in `swap.js` |

## Steps for Jojo

1. Open https://referral.jup.ag while connected with the Phantom that should **receive** swap fees.
2. Create / open a **Ultra referral account** (this is a program account pubkey, not your wallet address).
3. Fund / create the required **referral token accounts** for fee mints you care about (at least SOL / USDC as Jupiter docs require).
4. Copy the **referral account pubkey** (base58).
5. Send that pubkey to the agent / paste into `swap.js`:

```js
export const REFERRAL_ACCOUNT = '<paste_referral_account_pubkey_here>';
```

6. Redeploy Pages (preview → QA → prod). With a valid account, `FEE_ON` becomes true, the Jupiter plugin sends `referralAccount` + `referralFee: 50`, and the UI shows “Includes 0.5% MemeCheckShield fee”.
7. Safety already in code: if Jupiter rejects the referral probe, swaps still work **without** fee (never fail the swap).

## Do NOT

- Put seed phrases anywhere.
- Use the Phantom payment address as `REFERRAL_ACCOUNT` (Jupiter will reject / no fee).
- Invent a referral id.

## UI copy while empty

Fee line stays hidden. Docs / advertise copy: «fee activates when referral account is set».
