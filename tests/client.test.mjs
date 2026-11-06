import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenList, LIST_URL } from '../integration/kadena-token-list.js';

const LIST = {
  network: 'mainnet01',
  tokens: [
    { contract: 'n_a.good', name: 'Good', symbol: 'G', logoURI: 'https://x/good.png', buyerChecks: { passed: true } },
    { contract: 'n_b.new', name: 'New', symbol: 'N', logoURI: null, buyerChecks: { passed: false } },
  ],
};
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const counting = (impl) => { const f = async (...a) => { f.calls += 1; return impl(...a); }; f.calls = 0; return f; };

test('looks tokens up by full contract name only', async () => {
  const fetch = counting(async (url) => { assert.equal(url, LIST_URL); return ok(LIST); });
  const list = createTokenList({ fetch });
  assert.equal(await list.logoFor('n_a.good'), 'https://x/good.png');
  assert.equal(await list.logoFor('n_b.new'), null);
  assert.equal(await list.get('Good'), null);
  assert.equal((await list.all()).length, 2);
  assert.equal(fetch.calls, 1, 'one download, then the cache');
});

test('can keep only tokens with the Buyer checks passed badge', async () => {
  const list = createTokenList({ fetch: async () => ok(LIST), onlyBuyerChecksPassed: true });
  assert.deepEqual((await list.all()).map((t) => t.contract), ['n_a.good']);
  assert.equal(await list.get('n_b.new'), null);
});

test('refreshes after maxAge; a failed refresh keeps the last good list', async () => {
  let fail = false;
  const fetch = counting(async () => (fail ? { ok: false, status: 503 } : ok(LIST)));
  const list = createTokenList({ fetch, maxAgeMs: 0 });
  assert.equal(await list.logoFor('n_a.good'), 'https://x/good.png');
  fail = true;
  assert.equal(await list.logoFor('n_a.good'), 'https://x/good.png');
  assert.ok(fetch.calls >= 2);
});

test('with no network and no cache, lookups return null instead of throwing', async () => {
  const list = createTokenList({ fetch: async () => { throw new Error('offline'); } });
  assert.equal(await list.get('n_a.good'), null);
  assert.deepEqual(await list.all(), []);
});

test('a persistent cache is used before the network', async () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  await createTokenList({ fetch: async () => ok(LIST), storage }).all();
  const offline = createTokenList({ fetch: async () => { throw new Error('offline'); }, storage });
  assert.equal(await offline.logoFor('n_a.good'), 'https://x/good.png');
});

test('works against the real list file in this repository', async () => {
  const { readFileSync } = await import('node:fs');
  const real = JSON.parse(readFileSync(new URL('../tokens/mainnet.json', import.meta.url), 'utf8'));
  const list = createTokenList({ fetch: async () => ok(real) });
  // The list can be empty (every token hidden); the client must still work.
  assert.equal((await list.all()).length, real.tokens.length);
  for (const t of real.tokens) {
    assert.equal((await list.get(t.contract)).symbol, t.symbol);
    assert.equal(await list.logoFor(t.contract), t.logoURI);
  }
  assert.equal(await list.get('n_0000000000000000000000000000000000000000.not-listed'), null);
});
