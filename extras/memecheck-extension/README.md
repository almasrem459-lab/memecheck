# MemeCheckShield browser badge (MV3) — not published

Shows the MemeCheckShield verdict (No major red flags / Medium / High / Extreme + points) as a small badge on
DexScreener, pump.fun and Photon token pages. Click → `https://memecheck.pages.dev/token/<ca>`.

- Read-only: only talks to `https://memecheck.pages.dev` (`/api/deep?kind=core`, server-computed + cached). No wallet access, no page data sent except the token address.
- Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → this folder.
- Not submitted to the Chrome Web Store (needs a developer account + listing assets + review).
- Note: `/api/deep` is rate-limited per IP (30/min).
