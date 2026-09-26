import { bech32ConfigFromPrefix, type ChainInfo } from "./types";

const REGISTRY_IMG = "https://raw.githubusercontent.com/cosmos/chain-registry/master";

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

const juno = {
  coinDenom: "JUNO",
  coinMinimalDenom: "ujuno",
  coinDecimals: 6,
  coinGeckoId: "juno-network",
  coinImageUrl: `${REGISTRY_IMG}/juno/images/juno.png`,
};

const tia = {
  coinDenom: "TIA",
  coinMinimalDenom: "utia",
  coinDecimals: 6,
  coinGeckoId: "celestia",
  coinImageUrl: `${REGISTRY_IMG}/celestia/images/celestia.png`,
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
    txExplorer: "https://www.mintscan.io/chihuahua/tx/${txHash}",
    accountExplorer: "https://www.mintscan.io/chihuahua/address/${accountAddress}",
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
  {
    chainId: "juno-1",
    chainName: "Juno",
    registryName: "juno",
    rpc: "https://rpc.cosmos.directory/juno",
    rest: "https://rest.cosmos.directory/juno",
    rpcFallbacks: ["https://juno-rpc.polkachu.com"],
    restFallbacks: ["https://juno-api.polkachu.com"],
    bip44: { coinType: 118 },
    bech32Config: bech32ConfigFromPrefix("juno"),
    currencies: [juno],
    feeCurrencies: [{ ...juno, gasPriceStep: { low: 0.075, average: 0.1, high: 0.125 } }],
    stakeCurrency: juno,
    features: ["ibc-transfer", "ibc-go", "cosmwasm"],
    chainSymbolImageUrl: juno.coinImageUrl,
    txExplorer: "https://ping.pub/juno/tx/${txHash}",
    accountExplorer: "https://ping.pub/juno/account/${accountAddress}",
  },
  {
    chainId: "celestia",
    chainName: "Celestia",
    registryName: "celestia",
    rpc: "https://rpc.cosmos.directory/celestia",
    rest: "https://rest.cosmos.directory/celestia",
    rpcFallbacks: ["https://celestia-rpc.publicnode.com:443"],
    restFallbacks: ["https://celestia-rest.publicnode.com"],
    bip44: { coinType: 118 },
    bech32Config: bech32ConfigFromPrefix("celestia"),
    currencies: [tia],
    feeCurrencies: [{ ...tia, gasPriceStep: { low: 0.01, average: 0.02, high: 0.1 } }],
    stakeCurrency: tia,
    features: ["ibc-transfer", "ibc-go"],
    chainSymbolImageUrl: tia.coinImageUrl,
    txExplorer: "https://www.mintscan.io/celestia/tx/${txHash}",
    accountExplorer: "https://www.mintscan.io/celestia/address/${accountAddress}",
  },
];

export const DEFAULT_ENABLED_CHAIN_IDS = [CHIHUAHUA_CHAIN_ID, "osmosis-1", "cosmoshub-4"];

export const BUILTIN_CHAIN_IDS = new Set(BUILTIN_CHAINS.map((c) => c.chainId));
