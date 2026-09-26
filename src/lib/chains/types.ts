export interface Currency {
  coinDenom: string;
  coinMinimalDenom: string;
  coinDecimals: number;
  coinGeckoId?: string;
  coinImageUrl?: string;
}

export interface FeeCurrency extends Currency {
  gasPriceStep?: { low: number; average: number; high: number };
}

export interface Bech32Config {
  bech32PrefixAccAddr: string;
  bech32PrefixAccPub: string;
  bech32PrefixValAddr: string;
  bech32PrefixValPub: string;
  bech32PrefixConsAddr: string;
  bech32PrefixConsPub: string;
}

export type ChainFeature =
  | "ibc-transfer"
  | "ibc-go"
  | "cosmwasm"
  | "wasmd_0.24+"
  | "eth-address-gen"
  | "eth-key-sign"
  | (string & {});

export interface ChainInfo {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bip44: { coinType: number };
  bech32Config: Bech32Config;
  currencies: Currency[];
  feeCurrencies: FeeCurrency[];
  stakeCurrency?: Currency;
  features?: ChainFeature[];
  chainSymbolImageUrl?: string;

  rpcFallbacks?: string[];
  restFallbacks?: string[];
  registryName?: string;
  txExplorer?: string;
  accountExplorer?: string;
  isTestnet?: boolean;
}

export type KeyAlgo = "secp256k1" | "ethsecp256k1";

export function keyAlgoOf(chain: ChainInfo): KeyAlgo {
  return chain.features?.includes("eth-key-sign") || chain.features?.includes("eth-address-gen")
    ? "ethsecp256k1"
    : "secp256k1";
}

export function bech32ConfigFromPrefix(prefix: string): Bech32Config {
  return {
    bech32PrefixAccAddr: prefix,
    bech32PrefixAccPub: `${prefix}pub`,
    bech32PrefixValAddr: `${prefix}valoper`,
    bech32PrefixValPub: `${prefix}valoperpub`,
    bech32PrefixConsAddr: `${prefix}valcons`,
    bech32PrefixConsPub: `${prefix}valconspub`,
  };
}

export function feeCurrencyOf(chain: ChainInfo): FeeCurrency {
  return chain.feeCurrencies[0];
}

export function stakeCurrencyOf(chain: ChainInfo): Currency {
  return chain.stakeCurrency ?? chain.currencies[0];
}

export function supportsFeature(chain: ChainInfo, feature: ChainFeature): boolean {
  return chain.features?.includes(feature) ?? false;
}

export function explorerTxUrl(chain: ChainInfo, txHash: string): string | undefined {
  return chain.txExplorer?.replace("${txHash}", encodeURIComponent(txHash));
}

export function explorerAccountUrl(chain: ChainInfo, address: string): string | undefined {
  return chain.accountExplorer?.replace("${accountAddress}", encodeURIComponent(address));
}
