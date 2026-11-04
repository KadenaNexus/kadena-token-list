import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lockSummary, logoFileName, links, matchesTemplate, parseTemplate } from '../scripts/lib.mjs';

// A module rendered from the v2 template, as TokenGo deploys it.
const v2 = readFileSync(new URL('../templates/token-v2.pact', import.meta.url), 'utf8');
const fill = (t, o = {}) => {
  const r = { '{{MODULE}}': 'demo-coin', '{{NAMESPACE}}': 'n_0123456789abcdef0123456789abcdef01234567', '{{SYMBOL}}': 'DEMO', '{{NAME}}': 'Demo Coin',
    '{{DESCRIPTION}}': 'A \\"quoted\\" test', '{{IMAGE_URL}}': 'data:image/png;base64,AAAA', '{{SOCIALS}}': '{"website": "https://example.com"}',
    '{{SUPPLY}}': '1000000.0', '{{SUPPLY_CHAIN}}': '"2"', '{{DEPLOYED_CHAINS}}': '["2"]', ...o };
  let c = t;
  for (const [k, v] of Object.entries(r)) c = c.split(k).join(v);
  return c.slice(0, c.lastIndexOf('(create-table accounts-table)')).trim();
};

test('an unchanged TokenGo module is recognised, with its fields', () => {
  const code = fill(v2);
  const r = matchesTemplate(code);
  assert.equal(r.ok, true);
  assert.equal(r.version, 'v2');
  assert.deepEqual({ name: r.parsed.name, symbol: r.parsed.symbol, supply: r.parsed.supply, chains: r.parsed.chains, socials: r.parsed.socials },
    { name: 'Demo Coin', symbol: 'DEMO', supply: 1000000, chains: ['2'], socials: { website: 'https://example.com' } });
  assert.equal(parseTemplate(code).description, 'A "quoted" test');
});

test('any change to the code is refused', () => {
  const code = fill(v2);
  assert.equal(matchesTemplate(code.replace('(enforce (<= amount balance) "Insufficient funds")', '(enforce true "x")')).ok, false);
  assert.equal(matchesTemplate(`${code}\n(defun mint () 1)`).ok, false);
  assert.equal(matchesTemplate('(module x GOVERNANCE)').ok, false);
});

test('locks: only long, unexpired locks with time left count for the badge', () => {
  const now = Date.parse('2026-11-04T00:00:00Z');
  const lock = (o) => ({ lp: 40, forever: false, withdrawn: false, created: '2026-11-01T00:00:00Z', unlock: '2027-02-01T00:00:00Z', ...o });
  const s = lockSummary([lock(), lock({ lp: 40, unlock: '2026-11-20T00:00:00Z' }), lock({ lp: 10, forever: true }), lock({ lp: 10, withdrawn: true })], 100, now);
  assert.equal(s.lockedShare, 0.9);
  assert.equal(s.qualifyingShare, 0.5);
  assert.equal(s.lockedUntil, '2026-11-20T00:00:00Z');
  assert.equal(lockSummary([], 0, now).lockedUntil, null);
});

test('logo names include the namespace; links use fixed names', () => {
  assert.equal(logoFileName('n_af86b32a5a32b5b416ec6ffa5e8b32312d1ed9ed.tokengo-anchor'), 'tokengo-anchor-af86b3.png');
  assert.deepEqual(links({ website: 'https://a', x: 'https://x.com/a', other: 'y' }), { website: 'https://a', x: 'https://x.com/a' });
});

test('the committed list has the fields wallets rely on', () => {
  const list = JSON.parse(readFileSync(new URL('../tokens/mainnet.json', import.meta.url), 'utf8'));
  assert.equal(list.network, 'mainnet01');
  assert.equal(list.count, list.tokens.length);
  for (const t of list.tokens) {
    assert.match(t.contract, /^[\w-]+\.[\w-]+$/);
    assert.ok(t.name && t.symbol);
    assert.equal(t.decimals, 12);
    assert.ok(t.logoURI === null || t.logoURI.startsWith('https://raw.githubusercontent.com/KadenaNexus/kadena-token-list/main/logos/'));
    assert.equal(typeof t.buyerChecks.passed, 'boolean');
  }
});
