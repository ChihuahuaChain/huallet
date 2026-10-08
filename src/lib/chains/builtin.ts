import { bech32ConfigFromPrefix, type ChainInfo } from "./types";

export const REGISTRY_IMG = "https://raw.githubusercontent.com/cosmos/chain-registry/master";

const huahua = {
  coinDenom: "HUAHUA",
  coinMinimalDenom: "uhuahua",
  coinDecimals: 6,
  coinGeckoId: "chihuahua-token",
  coinImageUrl: `${REGISTRY_IMG}/chihuahua/images/huahua.png`,
};

const atom = {
  coinDenom: "ATOM",
  coinMinimalDenom: "uatom",
  coinDecimals: 6,
  coinGeckoId: "cosmos",
  coinImageUrl: `${REGISTRY_IMG}/cosmoshub/images/atom.png`,
};

const osmo = {
  coinDenom: "OSMO",
  coinMinimalDenom: "uosmo",
  coinDecimals: 6,
  coinGeckoId: "osmosis",
  coinImageUrl: `${REGISTRY_IMG}/osmosis/images/osmo.png`,
};

export const CHIHUAHUA_CHAIN_ID = "chihuahua-1";

export const BUILTIN_CHAINS: ChainInfo[] = [
  {
    chainId: CHIHUAHUA_CHAIN_ID,
    chainName: "Chihuahua",
    registryName: "chihuahua",
    rpc: "https://rpc.chihuahua.wtf",
    rest: "https://api.chihuahua.wtf",
    rpcFallbacks: ["https://rpc.cosmos.directory/chihuahua", "https://chihuahua-rpc.kleomedes.network"],
    restFallbacks: ["https://rest.cosmos.directory/chihuahua"],
    bip44: { coinType: 118 },
    bech32Config: bech32ConfigFromPrefix("chihuahua"),
    currencies: [huahua],
    feeCurrencies: [{ ...huahua, gasPriceStep: { low: 500, average: 1250, high: 2000 } }],
    stakeCurrency: huahua,
    features: ["ibc-transfer", "ibc-go", "cosmwasm"],
    chainSymbolImageUrl: huahua.coinImageUrl,
    txExplorer: "https://explorer.chihuahua.wtf/tx/${txHash}",
    accountExplorer: "https://explorer.chihuahua.wtf/account/${accountAddress}",
  },
  {
    chainId: "cosmoshub-4",
    chainName: "Cosmos Hub",
    registryName: "cosmoshub",
    rpc: "https://rpc.cosmos.directory/cosmoshub",
    rest: "https://rest.cosmos.directory/cosmoshub",
    rpcFallbacks: ["https://cosmos-rpc.publicnode.com:443"],
    restFallbacks: ["https://cosmos-rest.publicnode.com"],
    bip44: { coinType: 118 },
    bech32Config: bech32ConfigFromPrefix("cosmos"),
    currencies: [atom],
    feeCurrencies: [{ ...atom, gasPriceStep: { low: 0.01, average: 0.025, high: 0.03 } }],
    stakeCurrency: atom,
    features: ["ibc-transfer", "ibc-go"],
    chainSymbolImageUrl: atom.coinImageUrl,
    txExplorer: "https://www.mintscan.io/cosmos/tx/${txHash}",
    accountExplorer: "https://www.mintscan.io/cosmos/address/${accountAddress}",
  },
  {
    chainId: "osmosis-1",
    chainName: "Osmosis",
    registryName: "osmosis",
    rpc: "https://rpc.cosmos.directory/osmosis",
    rest: "https://rest.cosmos.directory/osmosis",
    rpcFallbacks: ["https://osmosis-rpc.polkachu.com"],
    restFallbacks: ["https://osmosis-api.polkachu.com"],
    bip44: { coinType: 118 },
    bech32Config: bech32ConfigFromPrefix("osmo"),
    currencies: [osmo],
    feeCurrencies: [{ ...osmo, gasPriceStep: { low: 0.03, average: 0.1, high: 0.16 } }],
    stakeCurrency: osmo,
    features: ["ibc-transfer", "ibc-go", "cosmwasm"],
    chainSymbolImageUrl: osmo.coinImageUrl,
    txExplorer: "https://www.mintscan.io/osmosis/tx/${txHash}",
    accountExplorer: "https://www.mintscan.io/osmosis/address/${accountAddress}",
  },
];

export const DEFAULT_ENABLED_CHAIN_IDS = [CHIHUAHUA_CHAIN_ID, "cosmoshub-4", "osmosis-1"];

export const BUILTIN_CHAIN_IDS = new Set(BUILTIN_CHAINS.map((c) => c.chainId));
