// Solana program-derived address (PDA) helper, dependency-free (Web Crypto SHA-256 + BigInt ed25519 on-curve check).
// Used to find a pump.fun bonding-curve account when the pump.fun API is unreachable from the edge.
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58dec(s){let n=0n;for(const c of s){const i=B58.indexOf(c);if(i<0)throw new Error('b58');n=n*58n+BigInt(i);}const out=[];while(n>0n){out.unshift(Number(n&255n));n>>=8n;}for(const c of s){if(c!=='1')break;out.unshift(0);}return Uint8Array.from(out);}
export function b58enc(b){let n=0n;for(const x of b)n=(n<<8n)+BigInt(x);let s='';while(n>0n){s=B58[Number(n%58n)]+s;n/=58n;}for(const x of b){if(x!==0)break;s='1'+s;}return s;}
const P=2n**255n-19n, D=(-121665n*inv(121666n))%P;
function mod(a){a%=P;return a<0n?a+P:a;}
function pw(b,e){let r=1n;b=mod(b);while(e>0n){if(e&1n)r=r*b%P;b=b*b%P;e>>=1n;}return r;}
function inv(a){return pw(a,P-2n);}
// true if 32 bytes decode to a valid ed25519 point (PDAs must be OFF the curve)
export function onCurve(bytes){let y=0n;for(let i=31;i>=0;i--)y=(y<<8n)+BigInt(bytes[i]);y&=(1n<<255n)-1n;if(y>=P)return false;
  const y2=y*y%P,u=mod(y2-1n),v=mod(D*y2+1n);if(u===0n)return true;const x2=u*inv(v)%P;return pw(x2,(P-1n)/2n)===1n;}
export async function findPda(seeds,programId){const prog=b58dec(programId);const tag=new TextEncoder().encode('ProgramDerivedAddress');
  for(let bump=255;bump>=0;bump--){const parts=[...seeds,Uint8Array.of(bump),prog,tag];const len=parts.reduce((s,p)=>s+p.length,0);const buf=new Uint8Array(len);let o=0;for(const p of parts){buf.set(p,o);o+=p.length;}
    const h=new Uint8Array(await crypto.subtle.digest('SHA-256',buf));if(!onCurve(h))return b58enc(h);}return null;}
