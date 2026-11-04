// Kadena Token List builder: reads every token registered with TokenGo from
// the chain, keeps those whose contract is an unchanged TokenGo template
// registered by its creator, and describes them for wallets and dApps.
// Read-only: only /local calls, nothing is signed or sent.
import { readFileSync } from 'node:fs';
import { createClient, Pact } from '@kadena/client';

export const NETWORK = 'mainnet01';
export const NODE = process.env.KADENA_NODE || 'https://api.chainweb-community.org';
export const REGISTRY = 'n_f60324bfd1bfa96d6e82e8357a077a2bc67d59e8.tokengo';
export const LOCKER = 'n_f60324bfd1bfa96d6e82e8357a077a2bc67d59e8.tokengo-locker';
export const LIST_CHAIN = '2';
export const RAW_BASE = 'https://raw.githubusercontent.com/KadenaNexus/kadena-token-list/main';
export const TOKEN_PAGE = 'https://tokengo.kadena.ws/token/';

const clients = {};
const client = (chain) => (clients[chain] ??= createClient(`${NODE}/chainweb/0.0/${NETWORK}/chain/${chain}/pact`));

// Pact numbers can come back as {decimal: "…"} or {int: n}.
export const plain = (v) => {
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    if ('decimal' in v && Object.keys(v).length === 1) return Number(v.decimal);
    if ('int' in v && Object.keys(v).length === 1) return Number(v.int);
    if ('timep' in v || 'time' in v) return v.timep || v.time;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  }
  return v;
};

export async function read(code, { chain = LIST_CHAIN, data = {} } = {}) {
  let b = Pact.builder.execution(code).setMeta({ chainId: chain, gasLimit: 150000 }).setNetworkId(NETWORK);
  for (const [k, v] of Object.entries(data)) b = b.addData(k, v);
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await client(chain).local(b.createTransaction(), { preflight: false, signatureVerification: false });
      if (r.result.status !== 'success') throw Object.assign(new Error(r.result.error?.message || 'Pact error'), { pact: true });
      return plain(r.result.data);
    } catch (e) {
      if (e.pact || attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
}

// ---------------------------------------------------------------------------
// Template check: the deployed module must be exactly what the TokenGo
// template renders from the module's own constants (same rule as the token
// page on tokengo.kadena.ws).
// ---------------------------------------------------------------------------
const TEMPLATES = {
  v2: readFileSync(new URL('../templates/token-v2.pact', import.meta.url), 'utf8'),
  v1: readFileSync(new URL('../templates/token-v1.pact', import.meta.url), 'utf8'),
};
const pactString = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
const pactDecimal = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid supply: ${value}`);
  const s = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 12 });
  return s.includes('.') ? s : `${s}.0`;
};
const pactSocials = (socials) => {
  const e = Object.entries(socials || {}).filter(([, v]) => v);
  return e.length ? `{${e.map(([k, v]) => `"${pactString(k)}": "${pactString(v)}"`).join(', ')}}` : '{}';
};
const unescape = (s) => s.replace(/\\(["\\])/g, '$1');
const strField = (code, key) => {
  const m = code.match(new RegExp(`"${key}": "((?:[^"\\\\]|\\\\.)*)"`));
  return m ? unescape(m[1]) : null;
};

export function parseTemplate(code) {
  const mod = code.match(/^\s*\(module ([a-zA-Z][\w-]*) GOVERNANCE/);
  const ns = code.match(/\(enforce-keyset "([^"]+)\.gov"\)/);
  const supply = code.match(/\(defconst TOTAL-SUPPLY:decimal ([0-9.]+)\)/);
  const chain = code.match(/\(defconst SUPPLY-CHAIN:string "(\d+)"\)/);
  const chains = code.match(/\(defconst DEPLOYED-CHAINS:\[string\] \[([^\]]*)\]\)/);
  const socialsBlock = code.match(/"socials": (\{[^}]*\})/);
  if (!mod || !ns || !supply || !chain || !chains || !socialsBlock) return null;
  const socials = {};
  for (const m of socialsBlock[1].matchAll(/"((?:[^"\\]|\\.)*)": "((?:[^"\\]|\\.)*)"/g)) socials[unescape(m[1])] = unescape(m[2]);
  return {
    moduleName: mod[1], ns: ns[1], symbol: strField(code, 'symbol'), name: strField(code, 'name'),
    description: strField(code, 'description'), logo: strField(code, 'img'), supply: Number(supply[1]),
    supplyChain: chain[1], chains: [...chains[1].matchAll(/"(\d+)"/g)].map((m) => m[1]), socials,
  };
}

function render(p, version) {
  const r = {
    '{{MODULE}}': p.moduleName, '{{NAMESPACE}}': p.ns, '{{SYMBOL}}': pactString(p.symbol), '{{NAME}}': pactString(p.name || p.symbol),
    '{{DESCRIPTION}}': pactString(p.description), '{{IMAGE_URL}}': pactString(p.logo), '{{SOCIALS}}': pactSocials(p.socials),
    '{{SUPPLY}}': pactDecimal(p.supply), '{{SUPPLY_CHAIN}}': `"${p.supplyChain}"`, '{{DEPLOYED_CHAINS}}': `[${p.chains.map((c) => `"${c}"`).join(' ')}]`,
  };
  let code = TEMPLATES[version];
  for (const [k, v] of Object.entries(r)) code = code.split(k).join(v);
  if (code.includes('{{')) throw new Error('unreplaced placeholder');
  return code.slice(0, code.lastIndexOf('(create-table accounts-table)')).trim();
}

export function matchesTemplate(code) {
  const p = parseTemplate(code || '');
  if (!p) return { ok: false };
  for (const version of Object.keys(TEMPLATES)) {
    try { if (render(p, version) === String(code).trim()) return { ok: true, parsed: p, version }; } catch { /* next */ }
  }
  return { ok: false };
}

// ---------------------------------------------------------------------------
// Buyer checks (same rule as the "Buyer checks passed" badge on TokenGo):
// at least 80% of the Mercatus pool locked in the TokenGo locker by locks made
// for 90+ days (or forever) with more than 30 days left, and the creator
// holding 20% or less of the supply freely.
// ---------------------------------------------------------------------------
export const RULE = { MIN_LOCKED: 0.8, MIN_LOCK_DAYS: 90, SOON_DAYS: 30, CREATOR_MAX: 0.2 };
const DAY = 86400000;
const ms = (t) => new Date(t).getTime();

export function lockSummary(locks, lpSupply, now = Date.now()) {
  const active = locks.filter((l) => !l.withdrawn && (l.forever || ms(l.unlock) > now));
  const counts = active.filter((l) => (l.forever || ms(l.unlock) - ms(l.created) >= RULE.MIN_LOCK_DAYS * DAY)
    && (l.forever || ms(l.unlock) - now > RULE.SOON_DAYS * DAY));
  const share = (ls) => (lpSupply > 0 ? Math.min(1, ls.reduce((t, l) => t + Number(l.lp), 0) / lpSupply) : 0);
  const timed = active.filter((l) => !l.forever).map((l) => l.unlock).sort((a, b) => ms(a) - ms(b));
  return { lockedShare: share(active), qualifyingShare: share(counts), lockedUntil: timed[0] || (active.length ? 'forever' : null) };
}

export async function buyerChecks({ module, creator, supply, supplyChain }, now = Date.now()) {
  if (supplyChain !== LIST_CHAIN) return { passed: false, lockedShare: 0, lockedUntil: null, creatorFreeShare: null };
  const r = await read(`
    (let ((pool (if (kaddex.exchange.pair-exists ${module} coin)
                  (let* ((key (kaddex.exchange.get-pair-key ${module} coin)))
                    {"exists": true, "lp": (kaddex.tokens.total-supply key)})
                  {"exists": false, "lp": 0.0})))
      {"pool": pool,
       "locks": (${LOCKER}.locks-for-token "${module}"),
       "creator": (try 0.0 (${module}.get-balance "${creator}"))})`);
  const s = r.pool.exists ? lockSummary(r.locks, r.pool.lp, now) : { lockedShare: 0, qualifyingShare: 0, lockedUntil: null };
  const creatorFreeShare = supply > 0 ? Number(r.creator) / supply : null;
  const passed = r.pool.exists && s.qualifyingShare >= RULE.MIN_LOCKED && creatorFreeShare !== null && creatorFreeShare <= RULE.CREATOR_MAX;
  return { passed, lockedShare: round(s.lockedShare), lockedUntil: s.lockedUntil, creatorFreeShare: creatorFreeShare === null ? null : round(creatorFreeShare) };
}
const round = (x) => Math.round(x * 10000) / 10000;

// "n_af86b3….tokengo-anchor" -> "tokengo-anchor-af86b3.png" (same file names
// as the TokenGo listing kit), so two tokens with the same name never share one.
export function logoFileName(module) {
  const [ns, ...rest] = String(module).split('.');
  const name = rest.join('.') || ns;
  const tag = ns.startsWith('n_') ? `-${ns.slice(2, 8)}` : '';
  return `${name}${tag}.png`.replace(/[^A-Za-z0-9._-]/g, '-');
}

// Links stored in the contract, under fixed names.
export function links(socials = {}) {
  const out = {};
  if (socials.website) out.website = socials.website;
  if (socials.x) out.x = socials.x;
  if (socials.telegram) out.telegram = socials.telegram;
  return out;
}
