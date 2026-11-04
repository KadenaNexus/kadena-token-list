# Use the Kadena Token List in your app

[`kadena-token-list.js`](kadena-token-list.js) is a small client (one file, no dependencies) that downloads the list, caches it and answers "what is this token's name and logo?". It works in browsers, React Native and Node 18+.

Copy the file into your project, or load it from jsDelivr:

```
https://cdn.jsdelivr.net/gh/KadenaNexus/kadena-token-list@main/integration/kadena-token-list.js
```

TypeScript types: [`kadena-token-list.d.ts`](kadena-token-list.d.ts).

## Basics

```js
import { createTokenList } from './kadena-token-list.js';

const tokenList = createTokenList();            // refreshes once a day

const token = await tokenList.get('n_af86b32a5a32b5b416ec6ffa5e8b32312d1ed9ed.tokengo-anchor');
// { contract, name, symbol, decimals, logoURI, links, buyerChecks, ... } or null

const logo = await tokenList.logoFor(token.contract); // PNG URL or null
```

- Always look tokens up by the **full contract name** (`namespace.module`). Names and symbols are not unique, and copycats reuse them.
- If the download fails, the client keeps using the last good copy. With no copy at all, lookups return `null`, so your app falls back to what it shows today.
- `createTokenList({ onlyBuyerChecksPassed: true })` keeps only tokens with the TokenGo "Buyer checks passed" badge (locked liquidity, small creator share).

Options: `url`, `maxAgeMs` (default 24 h), `onlyBuyerChecksPassed`, `storage` (a persistent cache with `getItem`/`setItem`), `fetch`.

## Wallet (React Native)

Use your own whitelist first and the list for everything else:

```js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTokenList } from './kadena-token-list.js';

const tokenList = createTokenList({ storage: AsyncStorage });

export async function tokenDisplay(contract) {
  const own = myWhitelist[contract];             // what the wallet shows today
  if (own) return own;
  const t = await tokenList.get(contract);
  return t ? { name: t.name, symbol: t.symbol, logo: t.logoURI, decimals: t.decimals } : null;
}
```

## Token icon API (Node)

For a server that answers "which icon for this token?", check the list before the default icon:

```js
import { createTokenList } from './kadena-token-list.js';
const tokenList = createTokenList();

async function iconUrlFor(contract) {
  const local = localIcons[contract];            // existing static icons
  if (local) return `/public/token-icons/${local}`;
  return (await tokenList.logoFor(contract)) || '/public/token-icons/default.png';
}
```

## Exchange / dApp token picker (browser)

```js
const tokenList = createTokenList({ storage: window.localStorage });
const tokens = [...ownTokens, ...(await tokenList.all()).filter((t) => !ownTokens.some((o) => o.contract === t.contract))];
```

## What a listing means

A token is on the list when its contract is an unchanged TokenGo contract registered by its creator. Name, symbol and logo come from that contract and cannot be changed after launch. It is not an audit or an endorsement; `buyerChecks` says whether liquidity is locked and how much the creator can sell. See the [main README](../README.md).
