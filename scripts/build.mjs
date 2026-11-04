// Rebuilds tokens/mainnet.json and logos/ from the chain.
//   node scripts/build.mjs           write the list
//   node scripts/build.mjs --check   fail if the committed list is out of date
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  LIST_CHAIN, RAW_BASE, REGISTRY, TOKEN_PAGE, buyerChecks, links, logoFileName, matchesTemplate, read,
} from './lib.mjs';

const root = new URL('..', import.meta.url);
const path = (p) => new URL(p, root);
const hidden = new Set(JSON.parse(readFileSync(path('hidden.json'), 'utf8')).hidden.map((h) => h.contract));

const names = await read(`(${REGISTRY}.list-tokens)`);
const rows = [];
for (let i = 0; i < names.length; i += 50) {
  rows.push(...await read(`(map (lambda (k) (+ {"module": k} (${REGISTRY}.get-token k))) (read-msg "names"))`, { data: { names: names.slice(i, i + 50) } }));
}

const tokens = [];
const skipped = [];
mkdirSync(path('logos/'), { recursive: true });
for (const row of rows.sort((a, b) => String(a.created).localeCompare(String(b.created)))) {
  const module = row.module;
  if (hidden.has(module)) { skipped.push([module, 'hidden']); continue; }
  const code = await read(`(at "code" (describe-module "${module}"))`, { chain: row['supply-chain'] || LIST_CHAIN });
  const tpl = matchesTemplate(code);
  if (!tpl.ok) { skipped.push([module, 'not an unchanged TokenGo contract']); continue; }
  const p = tpl.parsed;
  const ns = module.split('.')[0];
  const creatorNs = await read(`(ns.create-principal-namespace (at "guard" (coin.details "${row.creator}")))`).catch(() => null);
  if (creatorNs !== ns) { skipped.push([module, 'not registered by its creator']); continue; }

  let logoURI = null;
  const m = /^data:image\/[\w+.-]+;base64,(.+)$/.exec(p.logo || '');
  if (m) {
    const file = logoFileName(module);
    const png = await sharp(Buffer.from(m[1], 'base64')).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const target = path(`logos/${file}`);
    if (!existsSync(target) || !readFileSync(target).equals(png)) writeFileSync(target, png);
    logoURI = `${RAW_BASE}/logos/${file}`;
  }

  const checks = await buyerChecks({ module, creator: row.creator, supply: p.supply, supplyChain: p.supplyChain });
  tokens.push({
    contract: module,
    name: p.name,
    symbol: p.symbol,
    decimals: 12,
    description: p.description || '',
    logoURI,
    supplyChain: p.supplyChain,
    chains: p.chains,
    totalSupply: p.supply,
    creator: row.creator,
    launched: row.created,
    template: `tokengo-${tpl.version}`,
    links: links(p.socials),
    tokenPage: `${TOKEN_PAGE}${module}`,
    buyerChecks: checks,
  });
}

const list = {
  name: 'Kadena Token List',
  description: 'Tokens launched with TokenGo (tokengo.kadena.ws): unchanged TokenGo contracts registered by their creator. Generated from the Kadena chain every day.',
  network: 'mainnet01',
  version: 1,
  count: tokens.length,
  tokens,
};
const out = `${JSON.stringify(list, null, 2)}\n`;
const file = path('tokens/mainnet.json');
const before = existsSync(file) ? readFileSync(file, 'utf8') : '';

if (process.argv.includes('--check')) {
  if (before !== out) { console.error('tokens/mainnet.json is out of date: run node scripts/build.mjs'); process.exit(1); }
  console.log('List is up to date.');
} else {
  writeFileSync(file, out);
  console.log(`${tokens.length} tokens listed${before === out ? ' (no change)' : ''}.`);
}
for (const [mod, why] of skipped) console.log(`skipped ${mod}: ${why}`);
