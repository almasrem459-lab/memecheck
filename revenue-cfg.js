// MemeCheckShield revenue config (client + docs). Payment never changes risk score.
// Jupiter referral account is SEPARATE from the Phantom pay-to wallet — see /workspace/revenue-jupiter-setup-2026-10-20.md
export const PAY_TO = 'F29KLNySMghCZbpMqhNaR8k3jMUZHd485CHxX7x9Z9u5';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const VERIFY_PRICE_USDC = 75;
export const AD_PRICE_USDC_WEEK = 50;
export const VERIFY_DAYS = 30;
export const AD_DAYS_DEFAULT = 7;
// Terminal affiliate codes — leave empty until Jojo provides real codes (no invented refs).
export const TERMINAL_REFS = {
  // e.g. axiom: 'https://axiom.trade/@memecheck',
  // e.g. photon: 'https://photon-sol.tinyastro.io/en/r/@memecheck',
};
export const FEE_NOTE_WHEN_OFF = {
  en: 'Swap fee (0.5%) activates when the Jupiter referral account is set',
  ar: 'تفعَّل رسوم التبادل (0.5%) عند ضبط حساب إحالة Jupiter',
};
