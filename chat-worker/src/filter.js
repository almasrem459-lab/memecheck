// Moderation filters for MemeCheck chat (pure functions, unit-testable with plain node).
// Policy: plain text only, 300 chars, no URLs except memecheck.pages.dev, contract addresses always allowed.
export const MAX_LEN = 300;
export const SOL_RE = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![1-9A-HJ-NP-Za-km-z])/g;
export const EVM_RE = /(?<![0-9a-zA-Z])0x[0-9a-fA-F]{40}(?![0-9a-zA-Z])/g;
const isSol = (s) => /[A-Z]/.test(s) && /[a-z]/.test(s);   // a 32-44 char base58 run with mixed case = an address, not a long word

// invisible / bidi-override characters (used to spoof text direction or hide links) and control chars
const INVIS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0E\uFEFF\uFFA0\uFFF0-\uFFFB]/g;

// Plain-text sanitiser: drops tags and entities-as-markup, invisible chars, newlines; collapses whitespace and long repeats.
export function clean(s, max = MAX_LEN) {
  s = String(s ?? '').normalize('NFKC').replace(INVIS, '');
  s = s.replace(/<\/?[a-z!?][^>]*>?/gi, ' ').replace(/[<>]/g, ' ');            // strip anything tag-like, then any stray brackets
  s = s.replace(/&(#x?[0-9a-f]+|[a-z]{2,8});/gi, ' ');                          // no HTML entities either
  s = s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/(.)\1{7,}/gu, '$1$1$1$1$1$1').trim();
  return s.length > max ? null : s;                                             // too long -> caller rejects (we don't silently cut)
}

export function addresses(s) {
  const out = [];
  for (const m of s.matchAll(EVM_RE)) out.push(m[0]);
  for (const m of s.matchAll(SOL_RE)) if (isSol(m[0])) out.push(m[0]);
  return out;
}

// --- links ---
const OWN = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*memecheck\.pages\.dev(?:\/[^\s]*)?/gi;
const NAMES = /\b(?:pump\.fun|four\.meme|letsbonk\.fun|bonk\.fun|believe\.app|moonshot\.(?:money|cc)|raydium\.io|jup\.ag|pancakeswap\.finance|uniswap\.org|dexscreener\.com|solscan\.io|etherscan\.io|bscscan\.com|basescan\.org|arbiscan\.io)\b(?!\s*\/)/gi; // bare platform NAMES are fine to mention; with a path they are links
const TLD = 'com|net|org|io|xyz|app|me|gg|co|fun|site|online|club|live|pro|top|vip|link|finance|world|info|biz|ai|sh|to|cc|ly|tv|us|uk|ru|cn|ws|dev|page|pages|website|store|shop|money|cash|exchange|claim|airdrop|tech|cloud|network|lat|icu|buzz|click|space|digital|global|events|today|zone|one|fi|sbs|cfd|bond|run|meme|ag|art|lol|wtf|bet|win|ink|tg|ms|gl|is|ac|ph|im|su|eu|de|fr|nl|ch|ca|au|in|br|tk|ml|ga|cf|gq|pw|cx|ninja|rocks|asia|host|press|land|plus|red|blue|gold|limited|ltd|best|work|life|guru|center|company|support|help|services|wallet|crypto|nft|dao|eth|sol|bnb|base';
const DOMAIN = new RegExp(`(?:^|[^a-z0-9@-])[a-z0-9][a-z0-9-]{0,62}(?:\\.[a-z0-9-]{1,63})*\\.(?:${TLD})(?![a-z0-9-])`, 'i');
const SHORT = /\b(?:t\.me|telegram\.(?:me|dog)|discord\.(?:gg|com)|wa\.me|bit\.ly|tinyurl|goo\.gl|cutt\.ly|is\.gd|linktr\.ee)\b/i;
export function squashDots(s) {
  return s.toLowerCase().replace(/\s*(?:\(\s*dot\s*\)|\[\s*dot\s*\]|\{\s*dot\s*\}|\[\s*\.\s*\]|\(\s*\.\s*\)|\s+dot\s+|。|．|｡)\s*/g, '.')
    .replace(/\s*\.\s*/g, '.').replace(/\s*\/\s*/g, '/').replace(/h\s*t\s*t\s*p\s*(s?)\s*:/g, 'http$1:');
}
export function hasLink(s) {
  const t = squashDots(s.replace(OWN, ' ').replace(NAMES, ' '));
  return /(?:https?:|www\.|:\/\/|\bftp:|\bdata:|javascript:)/i.test(t) || SHORT.test(t) || DOMAIN.test(t);
}

// --- scam phrases (matched on a squashed form: letters/digits only, so "s.e.n.d  s o l" still hits) ---
const SCAM = ['airdropclaim', 'claimairdrop', 'claimyour', 'claimfree', 'claimnow', 'freeairdrop', 'sendsol', 'sendeth', 'sendbnb', 'sendusdt', 'sendusdc', 'sendme',
  'dmme', 'pmme', 'inboxme', 'messageme', 'msgme', 'textme', 'dmforhelp', 'dmfor', 'checkdm', 'checkyourdm', 'walletconnect', 'connectyourwallet', 'connectwallet', 'validatewallet',
  'syncwallet', 'rectifywallet', 'seedphrase', 'secretphrase', 'recoveryphrase', 'privatekey', 'mnemonic', '12words', '24words', 'twelvewords', 'doubleyour', '2xyour',
  'guaranteedprofit', 'guaranteedreturn', 'freesol', 'freeeth', 'freebnb', 'freecrypto', 'giveaway', 'recoverfunds', 'recoveryour', 'fundrecovery', 'recoveryservice',
  'supportteam', 'customersupport', 'contactsupport', 'contactadmin', 'adminwill', 'whatsapp', 'telegramme', 'addmeon', 'joinmygroup', 'joinourgroup', 'vipsignal', 'vipgroup',
  'pumpgroup', 'signalgroup', 'drainer', 'presalelive', 'buypresale', 'investwithme', 'accountmanager',
  // Arabic
  'راسلني', 'راسلنى', 'كلمنيخاص', 'تواصلمعي', 'تواصلمعى', 'خاصي', 'العبارةالسرية', 'عبارةالاسترداد', 'الكلماتالسرية', 'المفتاحالخاص', 'كلماتالاسترجاع', 'اربطمحفظتك', 'ربطالمحفظة',
  'ايردروبمجاني', 'إيردروبمجاني', 'احصلعلىايردروب', 'ارسلسولانا', 'أرسلسولانا', 'ارسللي', 'أرسللي', 'ضاعفاموالك', 'ربحمضمون', 'الدعمالفني', 'خدمةالعملاء', 'واتساب', 'واتس'];
export const squash = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')
  .replace(/[@4]/g, 'a').replace(/3/g, 'e').replace(/(?<=[a-z])0|0(?=[a-z])/g, 'o').replace(/(?<=[a-z])1|1(?=[a-z])/g, 'i').replace(/\$/g, 's');
export function scamHit(s) {
  const t = squash(s.replace(SOL_RE, ' ').replace(EVM_RE, ' '));   // addresses are random base58 and could contain anything
  return SCAM.find(p => t.includes(p)) || null;
}

// --- bad words: slurs reject the message; mild swearing is masked (degen chat swears; "shitcoin" stays) ---
const SLURS = /\b(?:n[i1!]gg(?:er|a|ah|uh)s?|f[a4@]gg?(?:ot|ots|s)?|k[i1]ke|sp[i1]c|ch[i1]nk|tr[a4]nny|retards?|r[e3]t[a4]rd)\b|(?:شرموط|منيوك|قحبة|متناك|يلعن\s*دين)/i;
const MILD = /\b(?:fuck(?:ing|er|ed)?|motherfucker|cunt|bitch(?:es)?|whore|slut|dick(?:head)?|asshole|bastard|wanker)\b|(?:^|\s)(?:كس|زب|طيز)(?=\s|$)/giu;
export function badWords(s) {
  if (SLURS.test(s)) return { reject: true };
  let masked = false; const t = s.replace(MILD, (m) => { masked = true; const lead = m.match(/^\s*/)[0]; return lead + '*'.repeat(Math.min(6, m.trim().length)); });
  return { reject: false, text: t, masked };
}

// --- nicknames: 2-24 chars, letters/digits/space/#._-, nothing that impersonates staff ---
const RESERVED = /(admin|adm1n|moderat|mod\b|^mod|staff|support|official|memecheck|meme\s*check|team|helpdesk|helper|system|bot\b|owner|dev\s*team|مشرف|ادارة|إدارة|الإدارة|الدعم|رسمي|ميمتشيك)/i;
export function cleanNick(n) {
  const s = clean(n, 40); if (!s) return { err: 'nick' };
  const v = s.replace(/[^\p{L}\p{N} #._-]/gu, '').replace(/\s{2,}/g, ' ').trim();
  if (v.length < 2 || v.length > 24) return { err: 'nick' };
  if (RESERVED.test(v) || RESERVED.test(squash(v)) || hasLink(v) || scamHit(v) || SLURS.test(v) || addresses(v).length) return { err: 'nick_reserved' };
  return { nick: v };
}

// Full check of one chat message; returns { text } or { err }.
export function checkMessage(raw) {
  if (typeof raw !== 'string') return { err: 'empty' };
  if (raw.trim().length > MAX_LEN) return { err: 'too_long' };
  let s = clean(raw); if (s === null) return { err: 'too_long' }; if (!s) return { err: 'empty' };
  if (addresses(s).length > 3) return { err: 'too_many_ca' };
  if (hasLink(s)) return { err: 'link' };
  if (scamHit(s)) return { err: 'scam' };
  const b = badWords(s); if (b.reject) return { err: 'bad_word' };
  s = b.text;
  const letters = s.replace(/[^A-Za-z]/g, ''); if (letters.length >= 12 && letters === letters.toUpperCase() && !addresses(s).length) s = s.toLowerCase(); // no SHOUTING
  return { text: s };
}
export const norm = (s) => squash(s.replace(SOL_RE, (m) => m.slice(0, 6))).slice(0, 120);   // for duplicate detection
