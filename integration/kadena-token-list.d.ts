export const LIST_URL: string;

export interface KadenaListedToken {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  description: string;
  logoURI: string | null;
  supplyChain: string;
  chains: string[];
  totalSupply: number;
  creator: string;
  launched: string;
  template: string;
  links: { website?: string; x?: string; telegram?: string };
  tokenPage: string;
  buyerChecks: {
    passed: boolean;
    lockedShare: number;
    lockedUntil: string | null;
    creatorFreeShare: number | null;
  };
}

export interface TokenListOptions {
  url?: string;
  maxAgeMs?: number;
  onlyBuyerChecksPassed?: boolean;
  storage?: { getItem(key: string): string | null | Promise<string | null>; setItem(key: string, value: string): unknown };
  fetch?: typeof fetch;
}

export interface TokenList {
  get(contract: string): Promise<KadenaListedToken | null>;
  logoFor(contract: string): Promise<string | null>;
  all(): Promise<KadenaListedToken[]>;
  refresh(): Promise<number>;
}

export function createTokenList(options?: TokenListOptions): TokenList;
