// Kadena Token List client: look up a Kadena token's name and logo from
// https://github.com/KadenaNexus/kadena-token-list.
//
// One file, no dependencies. Works in browsers, React Native and Node 18+
// (anything with fetch). Copy it into your app, or load it from
// https://cdn.jsdelivr.net/gh/KadenaNexus/kadena-token-list@main/integration/kadena-token-list.js
//
//   import { createTokenList } from './kadena-token-list.js';
//   const list = createTokenList();                       // all listed tokens
//   const logo = await list.logoFor('n_af86….tokengo-anchor');   // URL or null
//   const token = await list.get('n_af86….tokengo-anchor');      // full entry or null
//
// Match on the full contract name only. Names and symbols are not unique.

export const LIST_URL = 'https://raw.githubusercontent.com/KadenaNexus/kadena-token-list/main/tokens/mainnet.json';
const DAY = 24 * 3600 * 1000;

/**
 * @param {object} [options]
 * @param {string}  [options.url]                 list URL (default: the mainnet list)
 * @param {number}  [options.maxAgeMs]            refresh after this long (default 24 h)
 * @param {boolean} [options.onlyBuyerChecksPassed] list only tokens with the "Buyer checks passed" badge
 * @param {{getItem(k:string):any, setItem(k:string,v:string):any}} [options.storage]
 *        optional persistent cache (localStorage, or AsyncStorage in React Native)
 * @param {typeof fetch} [options.fetch]          custom fetch (default: global fetch)
 */
export function createTokenList(options = {}) {
  const {
    url = LIST_URL, maxAgeMs = DAY, onlyBuyerChecksPassed = false, storage = null,
    fetch: fetcher = (...a) => globalThis.fetch(...a),
  } = options;
  const KEY = `kadena-token-list:${url}`;
  let cache = null; // { at, byContract }
  let pending = null;

  const index = (list) => {
    const byContract = new Map();
    for (const t of Array.isArray(list?.tokens) ? list.tokens : []) {
      if (typeof t?.contract !== 'string') continue;
      if (onlyBuyerChecksPassed && t.buyerChecks?.passed !== true) continue;
      byContract.set(t.contract, t);
    }
    return byContract;
  };

  const fromStorage = async () => {
    if (!storage) return null;
    try {
      const raw = await storage.getItem(KEY);
      if (!raw) return null;
      const { at, list } = JSON.parse(raw);
      return { at, byContract: index(list) };
    } catch { return null; }
  };

  async function refresh() {
    const res = await fetcher(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Kadena Token List: HTTP ${res.status}`);
    const list = await res.json();
    if (list?.network && list.network !== 'mainnet01' && url === LIST_URL) throw new Error('Kadena Token List: unexpected network');
    cache = { at: Date.now(), byContract: index(list) };
    if (storage) { try { await storage.setItem(KEY, JSON.stringify({ at: cache.at, list })); } catch { /* storage full or blocked */ } }
    return cache;
  }

  // The current list: from memory, then storage, then the network. A failed
  // refresh keeps serving the last good copy; with none, lookups return null.
  async function load() {
    if (!cache) cache = await fromStorage();
    if (cache && Date.now() - cache.at < maxAgeMs) return cache;
    pending ??= refresh().catch(() => cache).finally(() => { pending = null; });
    return (await pending) || { at: 0, byContract: new Map() };
  }

  return {
    /** The list entry for CONTRACT (e.g. "n_….tokengo-anchor"), or null. */
    async get(contract) { return (await load()).byContract.get(String(contract)) || null; },
    /** Logo URL (PNG, at most 256 px) for CONTRACT, or null. */
    async logoFor(contract) { return (await this.get(contract))?.logoURI || null; },
    /** Every listed token. */
    async all() { return [...(await load()).byContract.values()]; },
    /** Fetch the list now, ignoring the cache age. */
    async refresh() { const c = await refresh(); return c.byContract.size; },
  };
}
