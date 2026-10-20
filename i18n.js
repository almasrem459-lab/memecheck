const f = (n, d = 1) => (n === null || n === undefined || isNaN(n)) ? '—' : (+n).toFixed(d);
const usd = (n) => n === null || n === undefined ? '—' : '$' + (n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : (+n).toFixed(n < 1 ? 8 : 2));
export { usd };
const age = (h, ar) => h < 24 ? `${f(h,1)} ${ar?'ساعة':'h'}` : `${f(h/24,0)} ${ar?'يوم':'days'}`;
export const T = {
 en: {
  heroH:'Check a meme coin before you buy', heroSub:'Paste a contract address. Free rug, honeypot, tax & dev checks in seconds.', scan:'Scan', chainsHint:'Chain is detected automatically', wcT:'What we check', wc1:'Honeypot & taxes', wc1d:'Can you sell? Hidden fees?', wc2:'Liquidity & holders', wc2d:'Pulled liquidity, whales, insider clusters', wc3:'Developer & snipers', wc3d:'Dev history, bundles, early buyers', proofT:'Rugs we caught', proofN:(n)=>`${n} tokens flagged High risk before they rugged`, proofSub:(a,b)=>`${a} in the live accuracy study · ${b} legacy records`, proofAll:'See all results', proofLoad:'Loading…', proofHigh:'High', proofRug:'rugged', newTokT:'New & trending tokens',
  dir:'ltr', title:'MemeCheckShield', tagline:'Free meme-coin safety checker for Solana, BNB Chain, Ethereum, Base & Arbitrum. Paste a contract address.', placeholder:'Paste token address (CA)…', check:'Check', chain:'Chain', detected:'Detected', solana:'Solana', evm:'EVM (BNB Chain / Ethereum / Base / Arbitrum, auto-detected)',
  checking:'Checking public sources…', invalid:'That does not look like a Solana mint or a 0x address (BNB Chain / Ethereum / Base / Arbitrum).', risk:'Risk', low:'Low risk', medium:'Medium risk', high:'High risk', extreme:'Extreme risk', unknown:'Risk unknown',
  riskPts:'risk points', market:'Market', price:'Price', mcap:'Market cap', fdv:'FDV', liq:'Liquidity', vol:'24h volume', txns:'24h buys / sells', change:'Price change', pairAge:'Pair age', holders:'Holders',
  findings:'Findings', topHolders:'Top holders (pools excluded)', flags:'Source risk flags', sources:'Data sources', ok:'OK', fail:'failed', empty:'no data',
  disclaimer:'Not financial advice. Automated checks can miss scams or flag legit tokens. Always do your own research.', lang:'العربية', viewDex:'View on DexScreener', pass:'PASS', warn:'WARN', failS:'FAIL', na:'N/A',
  ch1h24:'1h / 24h', waiting:(s)=>`Waiting for ${s}…`, partial:'Security checks still loading — score may change.', crashed:(v)=>`Already down ~${f(v,0)}% from its recent high — this coin crashed before your scan.`, shareX:'Share on X', copyCA:'Copy CA', copied:'Copied!', shareImg:'Share image', dlImg:'Download image', copyLink:'Copy link',
  recent:'Recent', watch:'Watchlist', star:'Add to watchlist', unstar:'Remove from watchlist', auto:'Auto-detect', clear:'Clear', autoChain:(c)=>`Auto-detected chain: ${c}`,
  shareText:(sym,lvl)=>`I checked $${sym} on MemeCheckShield: ${lvl} risk`, lvlWord:{low:'Low',medium:'Medium',high:'High',extreme:'Extreme',unknown:'Unknown'}, score:'Risk score',
  pumpOnly:'Dev / bundle / exit-trace checks: pump.fun (Solana) tokens only.', more:'More info', tagline2:'Check any meme coin on Solana, BNB Chain, Ethereum, Base or Arbitrum before you ape in. Rug, honeypot, dev & bundle checks. Free.', followX:'Follow on X', navMenu:'Menu', navChecker:'Checker', navWhales:'Whale buys', navSmart:'Smart money', navChat:'Community chat', navRugs:'Rugs we caught', navHow:'How the score works', rugsCta:'🚩 Rugs we caught', rugsSub:'See real tokens we flagged before they rugged', navOpenSrc:'Open source', showTrend:'Show trending / new tokens', hideTrend:'Hide list',
  shareRes:'Share result', newCheck:'New check', backHome:'Back to home', close:'Close', cardMaking:'Creating image…', shareNative:'Share…', cardTip:'Tip: download the image and attach it to your post on X.', cardWhy:'Top reasons', cardClean:'No major red flags from the automated checks', cardTag:'Meme-coin rug-risk check', cardNfa:'Not financial advice · DYOR', cardErr:'Could not create the image on this device.',
  curveLiq:'Bonding curve', unsup:'not supported on this chain', uniPool:(v)=>`🦄 Main pool: Uniswap${v?' '+v.toUpperCase():''}`, uniLink:'View pool on Uniswap', chainSw:'Also trades on:', chainSwT:(c)=>`Scan this token on ${c}`, fourCurve:(p)=>`🟡 Four.meme token, still on the bonding curve${p!=null?` (${p<1?f(p,2):f(p,0)}% to graduation)`:''}. Trades go through Four.meme until it graduates to PancakeSwap.`, fourGrad:'🟢 Four.meme token, graduated to PancakeSwap.', fourSrc:(s)=>`Detected via ${s}.`,
  r: {
   noPairs:()=>'No trading pairs found on DexScreener; market checks unavailable.',
   srcDex:()=>'DexScreener request failed; market checks unavailable.', srcRug:()=>'RugCheck request failed; Solana contract checks unavailable.', srcRugRpc:()=>'RugCheck unavailable; core contract checks read directly from the Solana chain (insider/LP data unavailable).', srcGoplus:()=>'GoPlus returned no data; contract checks unavailable.', srcHp:(p)=>p&&p.unsup?'Honeypot.is does not support Arbitrum; the honeypot and tax checks use GoPlus only.':p&&p.curve?'honeypot.is: no DEX pair to simulate yet (still on the bonding curve).':'honeypot.is returned no data; sell simulation unavailable.',
   liquidity:(p,s)=>p.curve?'Still on the Four.meme bonding curve: no DEX liquidity pool yet; price moves fast on small buys and sells.':s==='pass'?`Liquidity is ${usd(p.v)}, enough for normal trades.`:`Liquidity is only ${usd(p.v)}; prices can be moved easily and exits may be hard.`,
   age:(p,s)=>s==='pass'?`Pair has existed for ${age(p.h)}.`:s==='na'?'Pair creation time unknown.':`Pair is very new (${age(p.h)}); most rugs happen in the first day.`,
   drop:(p,s)=>p.crash?`Already down ~${f(p.v,0)}% from its ${p.grad?`recent high (pump.fun graduation price ${usd(p.grad)})`:'24h high'}: the crash happened before this scan.`:s==='pass'?`Price is ~${f(p.v,0)}% below its 24h high (approx.).`:`Price is ~${f(p.v,0)}% below its ${p.grad?`recent high (pump.fun graduation price ${usd(p.grad)})`:'24h high (approx.)'}; a sharp dump may have happened.`,
   pressure:(p,s)=>s==='pass'?`24h buys ${p.b} vs sells ${p.s}: balanced activity.`:`24h sells (${p.s}) far outnumber buys (${p.b}); holders may be exiting.`,
   volume:(p,s)=>s==='pass'?`24h volume is ${usd(p.v)}.`:`24h volume is only ${usd(p.v)}; the token is barely traded.`,
   mintAuth:(p,s)=>s==='pass'?'Mint authority is revoked; no one can create new tokens.':'Mint authority is ACTIVE; the creator can print unlimited tokens.',
   freezeAuth:(p,s)=>s==='pass'?'Freeze authority is revoked; your tokens cannot be frozen.':'Freeze authority is ACTIVE; the creator can freeze your wallet so you cannot sell.',
   lpLocked:(p,s)=>p.nft?`Uniswap ${String(p.pv||'v3').toUpperCase()}-style liquidity is held as NFT positions, so an LP lock can't be verified (info, not scored).`:p.eoa&&!p.old?`${f(p.eoa,0)}% of the ${String(p.pv||'v3').toUpperCase()} liquidity position sits in a regular wallet with no lock found; it could be withdrawn.`:p.curve?'Bonding curve: no LP tokens yet (Four.meme adds and burns liquidity at graduation).':p.old?`Old token with deep liquidity: LP lock (${f(p.v,0)}% locked/burned) is not a meaningful rug signal here.`:s==='na'?'LP lock status unknown (neutral).':p.pump&&s==='pass'?'pump.fun AMM liquidity: LP is burned at migration and cannot be pulled.':s==='pass'?`${f(p.v,0)}% of liquidity is locked or burned.`:p.v3?`Only ${f(p.v,0)}% of LP is locked (V3-style positions are often not lockable, but can be withdrawn).`:`Only ${f(p.v,0)}% of liquidity is locked; the developer could pull the liquidity.`,
   top10:(p,s)=>s==='na'?(p.curve?'Holder data not available while on the bonding curve.':'Holder data unavailable.'):s==='pass'?`Top 10 wallets hold ${f(p.v)}% of supply: reasonably spread.`:`Top 10 wallets hold ${f(p.v)}% of supply; a few wallets can crash the price.`,
   top1:(p,s)=>s==='pass'?`Largest single holder has ${f(p.v)}%.`:`One wallet holds ${f(p.v)}% of supply.`,
   insiders:(p,s)=>s==='na'?'Insider analysis unavailable.':s==='pass'?'No linked insider wallets detected.':`${p.n} linked insider wallets in ${p.nets} network(s) detected${p.pct!=null?`, holding ~${f(p.pct)}% of supply`:''}; coordinated dumping risk.`,
   creator:(p,s)=>{const w=p.who==='owner'?'Owner wallet':'Creator';return s==='pass'?`${w} holds ${f(p.v,2)}% of supply.`:`${w} still holds ${f(p.v)}% of supply and could dump it.`},
   mutable:(p,s)=>s==='pass'?'Token metadata is immutable.':'Token metadata can still be changed by the creator.',
   tax:(p,s)=>s==='na'?(p.curve?'Tax data not available while on the bonding curve.':'Tax data unavailable.'):s==='pass'?`Buy/sell tax ${f(p.b)}% / ${f(p.s)}%: none or low.`:`Buy/sell tax is ${f(p.b)}% / ${f(p.s)}%; you lose that much on every trade.`,
   rugged:()=>'RugCheck marks this token as RUGGED.',
   rcFlags:(p,s)=>s==='pass'?`RugCheck raised ${p.n} flag(s), none critical.`:`RugCheck raised ${p.d} danger-level flag(s).`,
   gpHoneypot:(p,s)=>s==='na'?'GoPlus honeypot check unavailable.':s==='pass'?'GoPlus: not a honeypot; selling appears possible.':'GoPlus: HONEYPOT; you will likely be unable to sell.',
   renounced:(p,s)=>s==='na'?'Ownership status unknown.':p.fm?'Owner is the Four.meme launch contract (normal while on the bonding curve).':s==='pass'?'Contract ownership is renounced.':'Contract still has an owner who may change settings.',
   mintable:(p,s)=>s==='na'?'Mint function status unknown.':s==='pass'?'No mint function; supply is fixed.':'Contract is mintable; the owner can create new tokens.',
   blacklist:(p,s)=>p.ren?'Blacklist code exists, but ownership is renounced so nobody can use it.':s==='na'?'Blacklist status unknown.':s==='pass'?'No blacklist function.':'Contract has a blacklist; the owner can block wallets from selling.',
   hiddenOwner:(p,s)=>s==='na'?'Hidden-owner status unknown.':s==='pass'?'No hidden owner.':'Contract has a hidden owner who keeps control.',
   takeBack:(p,s)=>s==='na'?'Ownership-reclaim status unknown.':s==='pass'?'Ownership cannot be taken back.':'Ownership can be reclaimed after "renouncing".',
   openSource:(p,s)=>s==='na'?'Source verification unknown.':s==='pass'?'Contract source code is verified.':'Contract source is NOT verified; hidden logic is possible.',
   proxy:(p,s)=>s==='na'?'Proxy status unknown.':s==='pass'?'Not an upgradeable proxy.':'Upgradeable proxy: the code can be changed later.',
   slippageMod:(p,s)=>p.ren?'Tax-change code exists, but ownership is renounced so nobody can change the taxes.':s==='na'?'Tax-modifiability unknown.':s==='pass'?'Taxes cannot be modified.':'Owner can change the taxes at any time.',
   tradingCooldown:(p,s)=>p.ren?'Cooldown code exists, but ownership is renounced so nobody can turn it on.':s==='na'?'Cooldown status unknown.':s==='pass'?'No trading cooldown.':'Contract has a trading cooldown that can restrict selling.',
   serialScammer:()=>'The same creator has deployed honeypots before.',
   honeypot:(p,s)=>s==='na'?(p.curve?'Sell simulation not available while on the bonding curve.':'Honeypot check unavailable.'):s==='pass'?`Not a honeypot: selling works (${p.src}).`:`HONEYPOT (${p.src})${p.reason?': '+p.reason:''}. You will likely be unable to sell.`,
   cannotBuy:()=>'Buying is blocked by the contract.',
   pausable:(p,s)=>p.ren?'Pause code exists, but ownership is renounced so nobody can pause trading.':s==='na'?'Pause status unknown.':s==='pass'?'Transfers cannot be paused.':'Owner can pause all transfers (nobody could sell).',
   devHistory:(p,s)=>s==='fail'?`Developer red flag: this creator launched ${p.total} other coins and ${p.bad} of ${p.checked} checked are dead or rugged.`:s==='warn'?`This creator's earlier coins: ${p.bad} of ${p.checked} checked are dead or rugged.`:!p.total?'Developer history: first coin from this creator wallet.':!p.old?`Developer history: ${p.total} other coins, all too new to judge.`:`Developer history: ${p.live} of ${p.old} earlier coins still live${p.bad?`, ${p.bad} dead`:''}.`,
   hpIs:(p,s)=>s==='na'?'honeypot.is simulation unavailable.':s==='pass'?'honeypot.is: buy and sell simulation succeeded.':`honeypot.is: HONEYPOT DETECTED (${p.reason}); selling fails or is blocked.`,
   hpTax:(p,s)=>s==='pass'?`Simulated tax buy ${f(p.b)}% / sell ${f(p.s)}%.`:`Simulated tax is high: buy ${f(p.b)}% / sell ${f(p.s)}%.`,
   hpRisk:(p,s)=>s==='pass'?`honeypot.is risk rating: ${p.v}.`:`honeypot.is risk rating: ${p.v}.`,
  }
 },
 ar: {
  heroH:'افحص عملة الميم قبل أن تشتري', heroSub:'الصق عنوان العقد. فحص مجاني للسحب والمصيدة والضرائب والمطوّر خلال ثوانٍ.', scan:'افحص', chainsHint:'يتم كشف الشبكة تلقائيًا', wcT:'ماذا نفحص', wc1:'المصيدة والضرائب', wc1d:'هل يمكنك البيع؟ رسوم مخفية؟', wc2:'السيولة والحاملون', wc2d:'سحب السيولة، الحيتان، شبكات المطّلعين', wc3:'المطوّر والقناصة', wc3d:'سجل المطوّر، الحزم، أوائل المشترين', proofT:'عمليات السحب التي رصدناها', proofN:(n)=>`${n} عملة صنّفناها عالية الخطورة قبل أن تُسحب سيولتها`, proofSub:(a,b)=>`${a} في دراسة الدقة الحالية · ${b} سجلات سابقة`, proofAll:'عرض كل النتائج', proofLoad:'جارٍ التحميل…', proofHigh:'عالية', proofRug:'سُحبت', newTokT:'عملات جديدة ورائجة',
  dir:'rtl', title:'MemeCheckShield', tagline:'أداة مجانية لفحص أمان عملات الميم على سولانا وسلسلة BNB وإيثريوم وBase وأربيتروم. الصق عنوان العقد.', placeholder:'الصق عنوان العملة (CA)…', check:'افحص', chain:'الشبكة', detected:'تم الكشف', solana:'سولانا', evm:'EVM (BNB Chain / إيثريوم / Base / أربيتروم، كشف تلقائي)',
  checking:'جارٍ الفحص من المصادر العامة…', invalid:'هذا لا يبدو عنوان سولانا أو عنوانًا يبدأ بـ 0x (BNB Chain / إيثريوم / Base / أربيتروم).', risk:'المخاطرة', low:'مخاطرة منخفضة', medium:'مخاطرة متوسطة', high:'مخاطرة عالية', extreme:'مخاطرة قصوى', unknown:'المخاطرة غير معروفة',
  riskPts:'نقاط مخاطرة', market:'السوق', price:'السعر', mcap:'القيمة السوقية', fdv:'القيمة المخففة بالكامل', liq:'السيولة', vol:'حجم التداول 24س', txns:'شراء / بيع 24س', change:'تغير السعر', pairAge:'عمر الزوج', holders:'الحاملون',
  findings:'النتائج', topHolders:'أكبر الحاملين (باستثناء المجمعات)', flags:'تحذيرات المصدر', sources:'مصادر البيانات', ok:'سليم', fail:'فشل', empty:'لا بيانات',
  disclaimer:'ليست نصيحة مالية. قد تفوّت الفحوصات الآلية عمليات احتيال أو تُنبّه على عملات سليمة. قم دائمًا ببحثك الخاص.', lang:'English', viewDex:'عرض على DexScreener', pass:'ناجح', warn:'تحذير', failS:'فشل', na:'غير متاح',
  ch1h24:'1س / 24س', waiting:(s)=>`بانتظار ${s}…`, partial:'فحوصات الأمان ما زالت قيد التحميل — قد تتغير النتيجة.', crashed:(v)=>`العملة منهارة أصلاً بنحو ${f(v,0)}% من أعلى سعر حديث — الانهيار حدث قبل فحصك.`, shareX:'شارك على X', copyCA:'نسخ العنوان', copied:'تم النسخ!', shareImg:'مشاركة صورة', dlImg:'تنزيل صورة', copyLink:'نسخ الرابط',
  recent:'عمليات البحث الأخيرة', watch:'قائمة المتابعة', star:'أضف لقائمة المتابعة', unstar:'أزل من قائمة المتابعة', auto:'كشف تلقائي', clear:'مسح', autoChain:(c)=>`الشبكة المكتشفة تلقائيًا: ${c}`,
  shareText:(sym,lvl)=>`I checked $${sym} on MemeCheckShield: ${lvl} risk`, lvlWord:{low:'Low',medium:'Medium',high:'High',extreme:'Extreme',unknown:'Unknown'}, score:'درجة المخاطرة',
  pumpOnly:'فحوصات المطوّر / الحزم / تتبّع الخروج: لعملات pump.fun (سولانا) فقط.', more:'مزيد من المعلومات', tagline2:'افحص أي عملة ميم على سولانا أو سلسلة BNB أو إيثريوم أو Base أو أربيتروم قبل أن تشتري. فحص السحب والمصيدة والمطوّر والحزم. مجانًا.', followX:'تابعنا على X', navMenu:'القائمة', navChecker:'الفاحص', navWhales:'حيتان', navSmart:'الأموال الذكية', navChat:'غرفة النقاش', navRugs:'عمليات السحب التي رصدناها', navHow:'كيف يعمل التقييم', rugsCta:'🚩 عمليات السحب التي رصدناها', rugsSub:'شاهد عملات حقيقية نبّهنا إليها قبل أن تُسحب سيولتها', navOpenSrc:'مفتوح المصدر', showTrend:'عرض العملات الرائجة / الجديدة', hideTrend:'إخفاء القائمة',
  shareRes:'مشاركة النتيجة', newCheck:'فحص جديد', backHome:'العودة للرئيسية', close:'إغلاق', cardMaking:'جارٍ إنشاء الصورة…', shareNative:'مشاركة…', cardTip:'نصيحة: نزّل الصورة وأرفقها بمنشورك على X.', cardWhy:'أهم الأسباب', cardClean:'لا توجد تحذيرات كبيرة من الفحوصات الآلية', cardTag:'فحص مخاطر سحب عملات الميم', cardNfa:'ليست نصيحة مالية · ابحث بنفسك', cardErr:'تعذّر إنشاء الصورة على هذا الجهاز.',
  curveLiq:'منحنى الترابط', unsup:'غير مدعوم على هذه الشبكة', uniPool:(v)=>`🦄 المجمع الرئيسي: Uniswap${v?' '+v.toUpperCase():''}`, uniLink:'عرض المجمع على Uniswap', chainSw:'متداولة أيضًا على:', chainSwT:(c)=>`افحص هذه العملة على ${c}`, fourCurve:(p)=>`🟡 عملة من Four.meme، ما زالت على منحنى الترابط${p!=null?` (${p<1?f(p,2):f(p,0)}% نحو التخرّج)`:''}. التداول يتم عبر Four.meme حتى تنتقل إلى PancakeSwap.`, fourGrad:'🟢 عملة من Four.meme، انتقلت (تخرّجت) إلى PancakeSwap.', fourSrc:(s)=>`تم الكشف عبر ${s}.`,
  r: {
   noPairs:()=>'لم يتم العثور على أزواج تداول في DexScreener؛ فحوصات السوق غير متاحة.',
   srcDex:()=>'فشل طلب DexScreener؛ فحوصات السوق غير متاحة.', srcRug:()=>'فشل طلب RugCheck؛ فحوصات عقد سولانا غير متاحة.', srcRugRpc:()=>'RugCheck غير متاح؛ تمت قراءة فحوصات العقد الأساسية مباشرة من شبكة سولانا (بيانات المطلعين/السيولة غير متاحة).', srcGoplus:()=>'لم يُرجع GoPlus بيانات؛ فحوصات العقد غير متاحة.', srcHp:(p)=>p&&p.unsup?'Honeypot.is لا يدعم أربيتروم؛ فحص المصيدة والضريبة يعتمد على GoPlus فقط.':p&&p.curve?'honeypot.is: لا يوجد زوج تداول للمحاكاة بعد (ما زالت على منحنى الترابط).':'لم يُرجع honeypot.is بيانات؛ محاكاة البيع غير متاحة.',
   liquidity:(p,s)=>p.curve?'ما زالت على منحنى الترابط في Four.meme: لا يوجد مجمع سيولة على منصة تداول بعد؛ السعر يتحرك بسرعة مع الصفقات الصغيرة.':s==='pass'?`السيولة ${usd(p.v)}، وهي كافية للتداول العادي.`:`السيولة ${usd(p.v)} فقط؛ يمكن تحريك السعر بسهولة وقد يصعب الخروج.`,
   age:(p,s)=>s==='pass'?`عمر الزوج ${age(p.h,1)}.`:s==='na'?'وقت إنشاء الزوج غير معروف.':`الزوج جديد جدًا (${age(p.h,1)})؛ معظم عمليات السحب تحدث في اليوم الأول.`,
   drop:(p,s)=>p.crash?`العملة منهارة أصلاً بنحو ${f(p.v,0)}% من ${p.grad?`أعلى سعر حديث (سعر التخرّج من pump.fun ${usd(p.grad)})`:'أعلى سعر خلال 24 ساعة'}: الانهيار حدث قبل هذا الفحص.`:s==='pass'?`السعر أقل بنحو ${f(p.v,0)}% من أعلى سعر خلال 24 ساعة (تقريبي).`:`السعر أقل بنحو ${f(p.v,0)}% من ${p.grad?`أعلى سعر حديث (سعر التخرّج من pump.fun ${usd(p.grad)})`:'أعلى سعر خلال 24 ساعة (تقريبي)'}؛ ربما حدث انهيار حاد.`,
   pressure:(p,s)=>s==='pass'?`عمليات الشراء ${p.b} مقابل البيع ${p.s} خلال 24 ساعة: نشاط متوازن.`:`عمليات البيع (${p.s}) تفوق الشراء (${p.b}) بكثير؛ قد يكون الحاملون يخرجون.`,
   volume:(p,s)=>s==='pass'?`حجم التداول خلال 24 ساعة ${usd(p.v)}.`:`حجم التداول خلال 24 ساعة ${usd(p.v)} فقط؛ العملة بالكاد تُتداول.`,
   mintAuth:(p,s)=>s==='pass'?'صلاحية السك ملغاة؛ لا أحد يستطيع إنشاء عملات جديدة.':'صلاحية السك مفعّلة؛ يستطيع المنشئ طباعة عملات بلا حدود.',
   freezeAuth:(p,s)=>s==='pass'?'صلاحية التجميد ملغاة؛ لا يمكن تجميد عملاتك.':'صلاحية التجميد مفعّلة؛ يستطيع المنشئ تجميد محفظتك فلا تستطيع البيع.',
   lpLocked:(p,s)=>p.nft?`السيولة من نوع Uniswap ${String(p.pv||'v3').toUpperCase()} محفوظة كمراكز NFT، لذلك لا يمكن التحقق من قفلها (معلومة، لا تدخل في التقييم).`:p.eoa&&!p.old?`${f(p.eoa,0)}% من مركز سيولة ${String(p.pv||'v3').toUpperCase()} في محفظة عادية دون قفل؛ يمكن سحبها.`:p.curve?'منحنى الترابط: لا توجد رموز سيولة بعد (Four.meme تضيف السيولة وتحرقها عند التخرّج).':p.old?`عملة قديمة بسيولة عميقة: قفل السيولة (${f(p.v,0)}% مقفلة/محروقة) ليس مؤشر سحب مهمًا هنا.`:s==='na'?'حالة قفل السيولة غير معروفة (محايد).':p.pump&&s==='pass'?'سيولة pump.fun AMM: رموز السيولة محروقة عند الانتقال ولا يمكن سحبها.':s==='pass'?`${f(p.v,0)}% من السيولة مقفلة أو محروقة.`:p.v3?`${f(p.v,0)}% فقط من السيولة مقفلة (مراكز V3 غالبًا لا تُقفل لكن يمكن سحبها).`:`${f(p.v,0)}% فقط من السيولة مقفلة؛ قد يسحب المطوّر السيولة.`,
   top10:(p,s)=>s==='na'?(p.curve?'بيانات الحاملين غير متاحة أثناء منحنى الترابط.':'بيانات الحاملين غير متاحة.'):s==='pass'?`أكبر 10 محافظ تملك ${f(p.v)}% من المعروض: توزيع معقول.`:`أكبر 10 محافظ تملك ${f(p.v)}% من المعروض؛ قلة من المحافظ قد تُسقط السعر.`,
   top1:(p,s)=>s==='pass'?`أكبر حامل منفرد يملك ${f(p.v)}%.`:`محفظة واحدة تملك ${f(p.v)}% من المعروض.`,
   insiders:(p,s)=>s==='na'?'تحليل المطلعين غير متاح.':s==='pass'?'لم تُكتشف محافظ مطلعين مترابطة.':`تم اكتشاف ${p.n} محفظة مطلعين مترابطة في ${p.nets} شبكة${p.pct!=null?` تملك نحو ${f(p.pct)}% من المعروض`:''}؛ خطر بيع منسق.`,
   creator:(p,s)=>p.who==='owner'?(s==='pass'?`محفظة المالك تملك ${f(p.v,2)}% من المعروض.`:`محفظة المالك ما زالت تملك ${f(p.v)}% من المعروض وقد تبيعها.`):s==='pass'?`المنشئ يملك ${f(p.v,2)}% من المعروض.`:`المنشئ ما زال يملك ${f(p.v)}% من المعروض وقد يبيعها.`,
   mutable:(p,s)=>s==='pass'?'بيانات العملة الوصفية غير قابلة للتعديل.':'يستطيع المنشئ تعديل بيانات العملة الوصفية.',
   tax:(p,s)=>s==='na'?(p.curve?'بيانات الضريبة غير متاحة أثناء منحنى الترابط.':'بيانات الضريبة غير متاحة.'):s==='pass'?`ضريبة الشراء/البيع ${f(p.b)}% / ${f(p.s)}%: معدومة أو منخفضة.`:`ضريبة الشراء/البيع ${f(p.b)}% / ${f(p.s)}%؛ تخسر هذه النسبة في كل صفقة.`,
   rugged:()=>'يصنّف RugCheck هذه العملة كعملية سحب (Rugged).',
   rcFlags:(p,s)=>s==='pass'?`أصدر RugCheck ${p.n} تحذيرًا، لا شيء منها خطير.`:`أصدر RugCheck ${p.d} تحذيرًا بمستوى خطر.`,
   gpHoneypot:(p,s)=>s==='na'?'فحص مصيدة GoPlus غير متاح.':s==='pass'?'GoPlus: ليست مصيدة؛ يبدو أن البيع ممكن.':'GoPlus: مصيدة (Honeypot)؛ على الأرجح لن تتمكن من البيع.',
   renounced:(p,s)=>s==='na'?'حالة الملكية غير معروفة.':p.fm?'المالك هو عقد الإطلاق في Four.meme (أمر طبيعي أثناء منحنى الترابط).':s==='pass'?'تم التخلي عن ملكية العقد.':'للعقد مالك ما زال قادرًا على تغيير الإعدادات.',
   mintable:(p,s)=>s==='na'?'حالة دالة السك غير معروفة.':s==='pass'?'لا توجد دالة سك؛ المعروض ثابت.':'العقد قابل للسك؛ يستطيع المالك إنشاء عملات جديدة.',
   blacklist:(p,s)=>p.ren?'كود القائمة السوداء موجود، لكن الملكية متخلّى عنها فلا يمكن لأحد استخدامه.':s==='na'?'حالة القائمة السوداء غير معروفة.':s==='pass'?'لا توجد قائمة سوداء.':'يحتوي العقد على قائمة سوداء؛ يستطيع المالك منع محافظ من البيع.',
   hiddenOwner:(p,s)=>s==='na'?'حالة المالك المخفي غير معروفة.':s==='pass'?'لا يوجد مالك مخفي.':'للعقد مالك مخفي يحتفظ بالسيطرة.',
   takeBack:(p,s)=>s==='na'?'حالة استعادة الملكية غير معروفة.':s==='pass'?'لا يمكن استعادة الملكية.':'يمكن استعادة الملكية بعد "التخلي" عنها.',
   openSource:(p,s)=>s==='na'?'حالة التحقق من الكود غير معروفة.':s==='pass'?'كود العقد المصدري موثّق.':'كود العقد غير موثّق؛ قد يحتوي منطقًا مخفيًا.',
   proxy:(p,s)=>s==='na'?'حالة الوكيل غير معروفة.':s==='pass'?'ليس عقد وكيل قابلًا للترقية.':'عقد وكيل قابل للترقية: يمكن تغيير الكود لاحقًا.',
   slippageMod:(p,s)=>p.ren?'كود تعديل الضريبة موجود، لكن الملكية متخلّى عنها فلا يمكن لأحد تغيير الضرائب.':s==='na'?'إمكانية تعديل الضريبة غير معروفة.':s==='pass'?'لا يمكن تعديل الضرائب.':'يستطيع المالك تغيير الضرائب في أي وقت.',
   tradingCooldown:(p,s)=>p.ren?'كود فترة التهدئة موجود، لكن الملكية متخلّى عنها فلا يمكن لأحد تفعيله.':s==='na'?'حالة فترة التهدئة غير معروفة.':s==='pass'?'لا توجد فترة تهدئة للتداول.':'للعقد فترة تهدئة قد تقيّد البيع.',
   serialScammer:()=>'نفس المنشئ نشر عقود مصيدة من قبل.',
   honeypot:(p,s)=>s==='na'?(p.curve?'محاكاة البيع غير متاحة أثناء منحنى الترابط.':'فحص المصيدة غير متاح.'):s==='pass'?`ليست مصيدة: البيع يعمل (${p.src}).`:`مصيدة (Honeypot) (${p.src})${p.reason?': '+p.reason:''}. على الأرجح لن تتمكن من البيع.`,
   cannotBuy:()=>'العقد يمنع الشراء.',
   pausable:(p,s)=>p.ren?'كود الإيقاف موجود، لكن الملكية متخلّى عنها فلا يمكن لأحد إيقاف التداول.':s==='na'?'حالة إيقاف التحويلات غير معروفة.':s==='pass'?'لا يمكن إيقاف التحويلات.':'يستطيع المالك إيقاف كل التحويلات (لن يتمكن أحد من البيع).',
   devHistory:(p,s)=>s==='fail'?`تحذير المطوّر: أطلق هذا المنشئ ${p.total} عملة أخرى، و${p.bad} من ${p.checked} تم فحصها ميتة أو مسحوبة.`:s==='warn'?`عملات المنشئ السابقة: ${p.bad} من ${p.checked} تم فحصها ميتة أو مسحوبة.`:!p.total?'سجل المطوّر: أول عملة من محفظة هذا المنشئ.':!p.old?`سجل المطوّر: ${p.total} عملة أخرى، كلها أحدث من أن يُحكم عليها.`:`سجل المطوّر: ${p.live} من ${p.old} عملة سابقة ما زالت نشطة${p.bad?`، و${p.bad} ميتة`:''}.`,
   hpIs:(p,s)=>s==='na'?'محاكاة honeypot.is غير متاحة.':s==='pass'?'honeypot.is: نجحت محاكاة الشراء والبيع.':`honeypot.is: تم اكتشاف مصيدة (${p.reason})؛ البيع يفشل أو محظور.`,
   hpTax:(p,s)=>s==='pass'?`الضريبة المحاكاة: شراء ${f(p.b)}% / بيع ${f(p.s)}%.`:`الضريبة المحاكاة مرتفعة: شراء ${f(p.b)}% / بيع ${f(p.s)}%.`,
   hpRisk:(p)=>`تقييم مخاطر honeypot.is: ${({low:'منخفض',medium:'متوسط',high:'مرتفع','very low':'منخفض جدًا','very high':'مرتفع جدًا',honeypot:'مصيدة'})[String(p.v).toLowerCase()]||p.v}.`,
  }
 }
};

// Smart money page, "Bots" section (bots-ui.js). SIMULATED paper trading only.
const pctS = (x) => (x > 0 ? '+' : '') + (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) + '%';
export const BOTS = {
 en: {
  h: 'Paper-trading bots', pill: 'SIMULATED PAPER TRADING',
  banner: '<b>Simulated paper trading. Not financial advice.</b> These bots never trade real money and hold no keys. They record what would have happened buying $20 per signal at the price we observed, plus 2% fees/slippage on each side. Each bot starts from a virtual $1,000. Simulated results are not real returns and do not predict the future.',
  loading: 'Loading bots…', none: 'Bot data is not available yet. Check back later.',
  updated: (a) => `Updated ${a}`, tick: (a) => `last price check ${a}`,
  paused: (a) => `Bot data paused. The simulation has not sent an update for a while (last snapshot ${a}). The numbers below are from that snapshot.`,
  sorted: 'Sorted by total PnL. Tap a bot to see its trades.',
  equity: 'Equity', fromBank: (b) => `from $${b}`, pnl: 'Total PnL', win: 'Win rate', counts: 'Open / closed',
  rejectedN: (n) => `${n} rejected`, sparkT: 'Equity over time (closed trades)',
  show: 'Show trades', hide: 'Hide trades',
  openH: 'Open positions', closedH: 'Closed trades', closedLast: (n, t) => n < t ? `last ${n} of ${t}` : `${t}`, rejH: 'Rejected by the filter, and how they did afterwards',
  noOpen: 'No open positions right now.', noClosed: 'No closed trades yet.', noRej: 'No coins rejected yet.', filterOff: 'Filter off: this bot buys without the MemeCheckShield check, so nothing is rejected.',
  bought: 'Bought', sold: 'Sold', rejected: 'Rejected', held: 'held', entry: 'Entry', now: 'Now', value: 'Value', cost: 'cost', mcap: 'MC', price: 'price', left: (p) => `${p}% still held`,
  exit: 'Exit', partials: 'Partial sells', wallets: 'Triggering wallets', weight: 'weight',
  after: 'Afterwards (vs price at rejection)', xNow: 'now', xMax: 'peak', xMin: 'low', x1h: '1 h', x6h: '6 h', x24h: '24 h',
  mcLv: { low: 'Low risk', medium: 'Medium risk', high: 'High risk', extreme: 'Extreme risk', unknown: 'Not scanned' }, pts: 'pts',
  scan: 'Full scan', score: 'signal score', chase: 'price vs first wallet buy',
  title(c) {
    if (c.kind === 'scalper') return 'Solo scalper (new coins ~$30K MC)';
    if (c.kind === 'wq') return 'Quality-weighted consensus' + ({ strict: ', strict filter', basic: ', basic filter', none: ', no filter' }[c.gate] || '') + (c.accel ? ' + momentum' : '');
    if (c.kind === 'instant') return `Instant copy (top ${c.top})` + (c.size ? ', strict filter + size' : ', basic filter');
    return `${c.n}-wallet consensus` + (c.filter ? ', MemeCheckShield filter on' : ', no filter');
  },
  rule(c) {
    const gate = { strict: 'strict MemeCheckShield filter (Low risk only, plus dev, holder and sniper checks)', basic: 'MemeCheckShield filter on (skips High/Extreme)', none: 'MemeCheckShield filter off' };
    if (c.kind === 'scalper') {
      const lo = c.mc_lo != null ? Math.round(c.mc_lo / 1000) + 'K' : '18K';
      const hi = c.mc_hi != null ? Math.round(c.mc_hi / 1000) + 'K' : '45K';
      return `Watches brand-new Solana memes near ~$30K market cap (band $${lo}–$${hi}). Paper-buys only when MemeCheckShield risk is low or medium (never high/extreme), liquidity is decent, the coin is a few minutes to ~2 h old, and top-10 holders are not too concentrated.`;
    }
    if (c.kind === 'wq') return `Buys when ${c.min_n}+ quality-weighted top wallets (combined score ${c.score}+) buy within ${c.window_min} min, if the price is not already up more than ${Math.round(c.chase * 100)}% and MC is $15K–$500K; ${gate[c.gate] || ''}` + (c.accel ? '; only when buying is speeding up' : '') + '.';
    if (c.kind === 'instant') return `Copies a buy by any of the top ${c.top} quality wallets (seen within ${c.fresh_min} min of the buy)` + (c.chase ? `, if the price is not up more than ${Math.round(c.chase * 100)}% and MC is $15K–$500K` : '') + `; ${gate[c.gate] || ''}.`;
    const chase = c.chase != null ? `, only if price is not already up more than ${Math.round(c.chase * 100)}% from the first consensus print` : '';
    const liq = c.min_liq != null ? `, liquidity ≥ $${Math.round(c.min_liq).toLocaleString('en-US')}` : '';
    return `Buys when ${c.n}+ top wallets buy within ${c.window_min} min${chase}${liq}; MemeCheckShield filter ${c.filter ? 'on (skips High/Extreme risk)' : 'off'}.`;
  },
  exits(c) {
    if (c.exits === 'scalp') return 'Scalp exits: half at +30%, rest at +60% or a tight trailing stop; −18% stop before TP1; 2 h max hold.';
    if (c.exits === 'smart') return 'Sells: half at +60%, a quarter at +150%; then trail ~22% under the peak; −28% stop before TP1; follows wallets when ~40% of trigger weight sells; 8 h max.';
    if (c.exits === 'instant') return 'Sells: when the copied wallet sells; −40% stop; 12 h max.';
    return 'Sells: half at 2x, a quarter at 4x; −40% stop (break-even after the first take-profit); follows the wallets out; 12 h max.';
  },
  why(r) {
    let m;
    if ((m = /^stop_-(\d+)%$/.exec(r))) return `Stop-loss: price fell ${m[1]}% below entry`;
    if (r === 'stop_breakeven') return 'Stopped at break-even after taking profit';
    if ((m = /^trail_stop_-(\d+)%_from_peak$/.exec(r))) return `Trailing stop: fell ${m[1]}% from its peak`;
    if ((m = /^follow_sell_([\d.]+)\/([\d.]+)_weight$/.exec(r))) return `Followed the wallets out: wallets with ${m[1]} of ${m[2]} signal weight sold`;
    if ((m = /^follow_sell_(\d+)\/(\d+)$/.exec(r))) return `Followed the wallets out: ${m[1]} of ${m[2]} trigger wallets sold`;
    if (r === 'follow_sell_wallet') return 'Followed the copied wallet out: it sold';
    if ((m = /^time_stop_(\d+)h$/.exec(r))) return `Time limit: closed after ${m[1]} h`;
    if (r === 'dead_no_price') return 'No price for 45 min: counted as dead ($0)';
    if ((m = /^tp\d_\+(\d+)%$/.exec(r))) return `Take-profit at +${m[1]}%`;
    return r || '—';
  },
  rej(r) {
    let m;
    if ((m = /^memecheck_(\w+)$/.exec(r))) return `MemeCheckShield rated it ${(this.mcLv[m[1]] || m[1])}`;
    if ((m = /^top10_([\d.]+)%$/.exec(r))) return `Top 10 holders control ${m[1]}% (too concentrated for the scalper)`;
    if (!/^strict:/.test(r)) return r || '—';
    const one = (x) => {
      let k;
      if ((k = /^level_(\w+)$/.exec(x))) return `MemeCheckShield ${this.mcLv[k[1]] || k[1]} (strict needs Low)`;
      if ((k = /^serial_launcher_(\d+)$/.exec(x))) return `creator launched ${(+k[1]).toLocaleString('en')} coins`;
      if ((k = /^dev_history_(\w+)$/.exec(x))) return k[1] === 'fail' ? "creator's past coins mostly died or rugged" : "many of the creator's past coins died";
      if ((k = /^dev_holds_([\d.]+)%$/.exec(x))) return `dev holds ${k[1]}%`;
      if ((k = /^top1_([\d.]+)%$/.exec(x))) return `largest holder has ${k[1]}%`;
      if ((k = /^top10_([\d.]+)%$/.exec(x))) return `top 10 holders have ${k[1]}%`;
      if (x === 'holders_unknown') return 'holder data unavailable';
      if ((k = /^snipers_\w+_([\d.]+)%$/.exec(x))) return `snipers hold ${k[1]}%`;
      return 'risk flag: ' + x.replace(/_/g, ' ');
    };
    return 'Strict filter: ' + r.slice(7).split(',').filter(Boolean).map(one).join('; ');
  },
  x: (v) => v == null ? '—' : `×${v >= 10 ? v.toFixed(0) : v.toFixed(2)} (${pctS((v - 1) * 100)})`,
  dur: (s) => s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`,
  ago: (s) => s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`,
  locale: 'en-GB',
  foot: 'Simulated paper trading for research. Not financial advice. Wallet names are public labels and may be wrong.',
 },
 ar: {
  h: 'روبوتات التداول الورقي', pill: 'تداول ورقي محاكى',
  banner: '<b>تداول ورقي محاكى. ليست نصيحة مالية.</b> هذه الروبوتات لا تتداول بأموال حقيقية ولا تملك أي مفاتيح. هي تسجّل ما كان سيحدث لو اشترينا بـ 20$ لكل إشارة بالسعر الذي رصدناه، مع 2% رسوم/انزلاق في كل اتجاه. يبدأ كل روبوت برصيد افتراضي قدره 1,000$. النتائج المحاكاة ليست أرباحًا حقيقية ولا تتنبأ بالمستقبل.',
  loading: 'جارٍ تحميل الروبوتات…', none: 'بيانات الروبوتات غير متاحة بعد. عد لاحقًا.',
  updated: (a) => `آخر تحديث ${a}`, tick: (a) => `آخر فحص للأسعار ${a}`,
  paused: (a) => `بيانات الروبوتات متوقفة مؤقتًا. لم ترسل المحاكاة تحديثًا منذ فترة (آخر لقطة ${a}). الأرقام أدناه من تلك اللقطة.`,
  sorted: 'مرتبة حسب إجمالي الربح/الخسارة. اضغط على روبوت لرؤية صفقاته.',
  equity: 'الرصيد', fromBank: (b) => `من ${b}$`, pnl: 'إجمالي الربح/الخسارة', win: 'نسبة الربح', counts: 'مفتوحة / مغلقة',
  rejectedN: (n) => `${n} مرفوضة`, sparkT: 'الرصيد عبر الزمن (الصفقات المغلقة)',
  show: 'عرض الصفقات', hide: 'إخفاء الصفقات',
  openH: 'الصفقات المفتوحة', closedH: 'الصفقات المغلقة', closedLast: (n, t) => n < t ? `آخر ${n} من ${t}` : `${t}`, rejH: 'رفضها الفلتر، وكيف كان أداؤها بعد ذلك',
  noOpen: 'لا توجد صفقات مفتوحة حاليًا.', noClosed: 'لا توجد صفقات مغلقة بعد.', noRej: 'لم تُرفض أي عملة بعد.', filterOff: 'الفلتر معطّل: هذا الروبوت يشتري دون فحص MemeCheckShield، لذا لا يرفض شيئًا.',
  bought: 'شراء', sold: 'بيع', rejected: 'رُفضت', held: 'مدة الاحتفاظ', entry: 'الدخول', now: 'الآن', value: 'القيمة', cost: 'التكلفة', mcap: 'القيمة السوقية', price: 'السعر', left: (p) => `ما زال ${p}% محتفظًا به`,
  exit: 'الخروج', partials: 'بيع جزئي', wallets: 'المحافظ المحفِّزة', weight: 'الوزن',
  after: 'بعد الرفض (مقارنة بسعر لحظة الرفض)', xNow: 'الآن', xMax: 'الأعلى', xMin: 'الأدنى', x1h: 'ساعة', x6h: '6 س', x24h: '24 س',
  mcLv: { low: 'مخاطرة منخفضة', medium: 'مخاطرة متوسطة', high: 'مخاطرة مرتفعة', extreme: 'مخاطرة شديدة', unknown: 'لم تُفحص' }, pts: 'نقطة',
  scan: 'فحص كامل', score: 'نقاط الإشارة', chase: 'السعر مقارنة بأول شراء لمحفظة',
  title(c) {
    if (c.kind === 'scalper') return 'مضارب منفرد (عملات جديدة ~30K$ قيمة سوقية)';
    if (c.kind === 'wq') return 'إجماع مرجّح بالجودة' + ({ strict: '، فلتر صارم', basic: '، فلتر أساسي', none: '، بلا فلتر' }[c.gate] || '') + (c.accel ? ' + زخم' : '');
    if (c.kind === 'instant') return `نسخ فوري (أفضل ${c.top})` + (c.size ? '، فلتر صارم + حجم' : '، فلتر أساسي');
    return `إجماع ${c.n} محافظ` + (c.filter ? '، فلتر MemeCheckShield مفعّل' : '، بلا فلتر');
  },
  rule(c) {
    const gate = { strict: 'فلتر MemeCheckShield صارم (مخاطرة منخفضة فقط، مع فحص المطوّر والحاملين والقنّاصين)', basic: 'فلتر MemeCheckShield مفعّل (يتجنب المرتفعة/الشديدة)', none: 'فلتر MemeCheckShield معطّل' };
    if (c.kind === 'scalper') {
      return 'يراقب عملات ميم سولانا الجديدة قرب قيمة سوقية ~30K$. يشتري ورقيًا فقط إذا كانت مخاطرة MemeCheckShield منخفضة أو متوسطة (أبدًا مرتفعة/شديدة)، مع سيولة مقبولة، وعمر بضع دقائق إلى ~ساعتين، ودون تركز كبير لدى أكبر 10 حاملين.';
    }
    if (c.kind === 'wq') return `يشتري عندما تشتري ${c.min_n}+ من أفضل المحافظ المرجّحة بالجودة (بنقاط إجمالية ${c.score}+) خلال ${c.window_min} دقيقة، إذا لم يرتفع السعر أكثر من ${Math.round(c.chase * 100)}% وكانت القيمة السوقية بين 15K$ و500K$؛ ${gate[c.gate] || ''}` + (c.accel ? '؛ فقط عندما يتسارع الشراء' : '') + '.';
    if (c.kind === 'instant') return `ينسخ شراء أي محفظة من أفضل ${c.top} محافظ بالجودة (إذا رُصد خلال ${c.fresh_min} دقائق من الشراء)` + (c.chase ? `، إذا لم يرتفع السعر أكثر من ${Math.round(c.chase * 100)}% وكانت القيمة السوقية بين 15K$ و500K$` : '') + `؛ ${gate[c.gate] || ''}.`;
    const chase = c.chase != null ? `، فقط إذا لم يرتفع السعر أكثر من ${Math.round(c.chase * 100)}% عن أول طباعة إجماع` : '';
    const liq = c.min_liq != null ? `، سيولة ≥ ${Math.round(c.min_liq).toLocaleString('en-US')}$` : '';
    return `يشتري عندما تشتري ${c.n}+ من أفضل المحافظ خلال ${c.window_min} دقيقة${chase}${liq}؛ فلتر MemeCheckShield ${c.filter ? 'مفعّل (يتجنب المخاطرة المرتفعة/الشديدة)' : 'معطّل'}.`;
  },
  exits(c) {
    if (c.exits === 'scalp') return 'خروج المضاربة: النصف عند +30%، والباقي عند +60% أو وقف متحرك ضيق؛ وقف −18% قبل أول جني أرباح؛ ساعتان كحد أقصى.';
    if (c.exits === 'smart') return 'البيع: النصف عند +60%، وربع عند +150%؛ ثم وقف متحرك ~22% تحت القمة؛ وقف −28% قبل ذلك؛ يتبع المحافظ عند بيع ~40% من وزن الإشارة؛ 8 ساعات كحد أقصى.';
    if (c.exits === 'instant') return 'البيع: عندما تبيع المحفظة المنسوخة؛ وقف −40%؛ 12 ساعة كحد أقصى.';
    return 'البيع: النصف عند 2x، والربع عند 4x؛ وقف −40% (عند سعر الدخول بعد أول جني ربح)؛ يتبع المحافظ عند بيعها؛ 12 ساعة كحد أقصى.';
  },
  why(r) {
    let m;
    if ((m = /^stop_-(\d+)%$/.exec(r))) return `وقف خسارة: هبط السعر ${m[1]}% تحت سعر الدخول`;
    if (r === 'stop_breakeven') return 'خروج عند سعر الدخول بعد جني جزء من الربح';
    if ((m = /^trail_stop_-(\d+)%_from_peak$/.exec(r))) return `وقف متحرك: هبط ${m[1]}% من القمة`;
    if ((m = /^follow_sell_([\d.]+)\/([\d.]+)_weight$/.exec(r))) return `تبع المحافظ في البيع: باعت محافظ وزنها ${m[1]} من ${m[2]}`;
    if ((m = /^follow_sell_(\d+)\/(\d+)$/.exec(r))) return `تبع المحافظ في البيع: باعت ${m[1]} من ${m[2]} محافظ محفِّزة`;
    if (r === 'follow_sell_wallet') return 'تبع المحفظة المنسوخة: باعت';
    if ((m = /^time_stop_(\d+)h$/.exec(r))) return `حد زمني: أُغلقت بعد ${m[1]} ساعة`;
    if (r === 'dead_no_price') return 'لا سعر لمدة 45 دقيقة: اعتُبرت ميتة (0$)';
    if ((m = /^tp\d_\+(\d+)%$/.exec(r))) return `جني ربح عند +${m[1]}%`;
    return r || '—';
  },
  rej(r) {
    let m;
    if ((m = /^memecheck_(\w+)$/.exec(r))) return `صنّفها MemeCheckShield: ${(this.mcLv[m[1]] || m[1])}`;
    if ((m = /^top10_([\d.]+)%$/.exec(r))) return `أكبر 10 حاملين يتحكمون في ${m[1]}% (تركّز عالٍ للمضارب)`;
    if (!/^strict:/.test(r)) return r || '—';
    const one = (x) => {
      let k;
      if ((k = /^level_(\w+)$/.exec(x))) return `MemeCheckShield: ${this.mcLv[k[1]] || k[1]} (الصارم يتطلب منخفضة)`;
      if ((k = /^serial_launcher_(\d+)$/.exec(x))) return `المنشئ أطلق ${(+k[1]).toLocaleString('en')} عملة`;
      if ((k = /^dev_history_(\w+)$/.exec(x))) return k[1] === 'fail' ? 'معظم عملات المنشئ السابقة ماتت أو سُحبت' : 'كثير من عملات المنشئ السابقة ماتت';
      if ((k = /^dev_holds_([\d.]+)%$/.exec(x))) return `المطوّر يملك ${k[1]}%`;
      if ((k = /^top1_([\d.]+)%$/.exec(x))) return `أكبر حامل يملك ${k[1]}%`;
      if ((k = /^top10_([\d.]+)%$/.exec(x))) return `أكبر 10 حاملين يملكون ${k[1]}%`;
      if (x === 'holders_unknown') return 'بيانات الحاملين غير متاحة';
      if ((k = /^snipers_\w+_([\d.]+)%$/.exec(x))) return `القنّاصون يملكون ${k[1]}%`;
      return 'علامة خطر: ' + x.replace(/_/g, ' ');
    };
    return 'الفلتر الصارم: ' + r.slice(7).split(',').filter(Boolean).map(one).join('؛ ');
  },
  x: (v) => v == null ? '—' : `×${v >= 10 ? v.toFixed(0) : v.toFixed(2)} (${pctS((v - 1) * 100)})`,
  dur: (s) => s < 3600 ? `${Math.max(1, Math.round(s / 60))} د` : s < 86400 ? `${(s / 3600).toFixed(1)} س` : `${(s / 86400).toFixed(1)} يوم`,
  ago: (s) => s < 60 ? 'الآن' : s < 3600 ? `منذ ${Math.floor(s / 60)} د` : s < 86400 ? `منذ ${Math.floor(s / 3600)} س` : `منذ ${Math.floor(s / 86400)} يوم`,
  locale: 'ar-EG-u-nu-latn',
  foot: 'تداول ورقي محاكى لأغراض البحث. ليست نصيحة مالية. أسماء المحافظ تسميات عامة وقد تكون خاطئة.',
 }
};
