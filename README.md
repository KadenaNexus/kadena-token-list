# Kadena Token List

A public list of tokens launched with [TokenGo](https://tokengo.kadena.ws), the no-code token launcher by Kadena Nexus, for wallets, explorers and dApps that want to show these tokens with their name and logo.

The list is **generated from the Kadena chain every day**. Nobody adds tokens by hand, and there is nothing to submit: a token launched and registered with TokenGo appears here within a day.

## For wallets and dApps

| What | URL |
|---|---|
| List | `https://raw.githubusercontent.com/KadenaNexus/kadena-token-list/main/tokens/mainnet.json` |
| Logos | `https://raw.githubusercontent.com/KadenaNexus/kadena-token-list/main/logos/<file>.png` (the `logoURI` of each token) |

Both are served with `Access-Control-Allow-Origin: *`. Logos are PNG, at most 256 × 256 px.

### Format

```json
{
  "name": "Kadena Token List",
  "network": "mainnet01",
  "version": 1,
  "count": 1,
  "tokens": [
    {
      "contract": "n_af86b32a5a32b5b416ec6ffa5e8b32312d1ed9ed.tokengo-anchor",
      "name": "TokenGo Anchor",
      "symbol": "ANCHOR",
      "decimals": 12,
      "description": "…",
      "logoURI": "https://raw.githubusercontent.com/KadenaNexus/kadena-token-list/main/logos/tokengo-anchor-af86b3.png",
      "supplyChain": "2",
      "chains": ["2"],
      "totalSupply": 1000000,
      "creator": "k:…",
      "launched": "2026-10-31T19:13:12Z",
      "template": "tokengo-v2",
      "links": { "website": "https://…", "x": "https://x.com/…", "telegram": "https://t.me/…" },
      "tokenPage": "https://tokengo.kadena.ws/token/…",
      "buyerChecks": { "passed": false, "lockedShare": 0.0516, "lockedUntil": "2027-01-30T06:58:59Z", "creatorFreeShare": 0.7899 }
    }
  ]
}
```

- **`contract`** is the token's full module name: the key to match on. Names and symbols are not unique; never match on them.
- **`chains`** are the chains the token is deployed on; **`supplyChain`** holds the supply at launch.
- **`decimals`** is the precision of every TokenGo token (12).
- **`logoURI`** is `null` when the token has no logo.
- **`buyerChecks.passed`** is the same rule as the "Buyer checks passed" badge on TokenGo: at least 80% of the Mercatus pool locked in the TokenGo locker by locks made for 90 days or more (or forever) with more than 30 days left, and the creator holding 20% or less of the supply freely. A wallet can choose to show only those tokens. `lockedShare` is the share of pool liquidity locked now, `lockedUntil` the earliest unlock date (or `"forever"`), and `creatorFreeShare` the share of supply in the creator's wallet that is not vesting.

## Which tokens are listed

Every token in the TokenGo registry (`n_f60324bfd1bfa96d6e82e8357a077a2bc67d59e8.tokengo`, chain 2) that passes both checks:

1. **Unchanged TokenGo contract.** The code on chain is exactly what the TokenGo template in [`templates/`](templates/) renders from the token's own name, symbol, supply and links: fixed supply minted once, no mint or admin functions, no pause, blacklist or transfer tax. Nobody can change it.
2. **Registered by its creator.** The account that registered the token owns the namespace the contract was deployed in.

Name, symbol, description, logo and links come from the token's own contract (`general-info`); they are fixed at launch and cannot be edited later.

Tokens reported as scams can be kept off the list in [`hidden.json`](hidden.json).

## How it is built

`node scripts/build.mjs` reads the registry and each contract from a public Kadena node (read-only, nothing is signed), checks it, converts the logo stored in the contract to PNG and writes `tokens/mainnet.json` and `logos/`. A GitHub Action runs it every day and commits any change. `npm test` checks the template matching and the list format.

## Not an endorsement

Being on this list means the contract is an unchanged TokenGo contract registered by its creator. It is not an audit, an endorsement or advice. A token can pass every check and still lose value. Do your own research.

Report a problem: open an issue in this repository.

## License

Apache License 2.0, like TokenGo.
