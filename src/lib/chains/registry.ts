import type { ChainInfo, Currency } from "./types";
import { bech32ConfigFromPrefix } from "./types";
import { validateChainInfo } from "./validate";

const RAW = "https://raw.githubusercontent.com/cosmos/chain-registry/master";
const DIRECTORY = "https://chains.cosmos.directory";

async function getJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface DirectoryChain {
  name: string;
  prettyName: string;
  chainId: string;
  image?: string;
  symbol?: string;
  networkType?: string;
  status?: string;
}

export async function fetchDirectory(): Promise<DirectoryChain[]> {
  const data = await getJson<{ chains: Array<Record<string, unknown>> }>(DIRECTORY);
  return data.chains
    .map((c) => ({
      name: String(c.name),
      prettyName: String(c.pretty_name ?? c.name),
      chainId: String(c.chain_id),
      image: typeof c.image === "string" ? c.image : undefined,
      symbol: typeof c.symbol === "string" ? c.symbol : undefined,
      networkType: typeof c.network_type === "string" ? c.network_type : undefined,
      status: typeof c.status === "string" ? c.status : undefined,
    }))
    .filter((c) => c.status !== "killed")
    .sort((a, b) => a.prettyName.localeCompare(b.prettyName));
}

interface RegistryImage {
  png?: string;
  svg?: string;
}

interface RegistryAsset {
  base: string;
  display: string;
  symbol: string;
  name?: string;
  denom_units: Array<{ denom: string; exponent: number }>;
  coingecko_id?: string;
  logo_URIs?: RegistryImage;
  images?: RegistryImage[];
  type_asset?: string;
  address?: string;
  traces?: Array<{
    type: string;
    counterparty?: { chain_name?: string; base_denom?: string; channel_id?: string };
    chain?: { channel_id?: string; path?: string };
  }>;
}

interface RegistryChain {
  chain_name: string;
  chain_id: string;
  pretty_name?: string;
  network_type?: string;
  bech32_prefix: string;
  slip44?: number;
  key_algos?: string[];
  fees?: { fee_tokens: Array<{ denom: string; low_gas_price?: number; average_gas_price?: number; high_gas_price?: number; fixed_min_gas_price?: number }> };
  staking?: { staking_tokens: Array<{ denom: string }> };
  apis?: { rpc?: Array<{ address: string }>; rest?: Array<{ address: string }> };
  explorers?: Array<{ kind?: string; tx_page?: string; account_page?: string }>;
  logo_URIs?: RegistryImage;
  images?: RegistryImage[];
  codebase?: { cosmwasm?: { enabled?: boolean } };
}

function imageOf(x: { logo_URIs?: RegistryImage; images?: RegistryImage[] }): string | undefined {
  const img = x.logo_URIs ?? x.images?.[0];
  const url = img?.png ?? img?.svg;
  return url?.startsWith("https://") ? url : undefined;
}

export function assetToCurrency(a: RegistryAsset): Currency | undefined {
  const display = a.denom_units.find((u) => u.denom === a.display) ?? a.denom_units.reduce((m, u) => (u.exponent > m.exponent ? u : m), a.denom_units[0]);
  if (!display) return undefined;
  return {
    coinDenom: a.symbol,
    coinMinimalDenom: a.base,
    coinDecimals: display.exponent,
    coinGeckoId: a.coingecko_id,
    coinImageUrl: imageOf(a),
  };
}

export async function fetchRegistryAssets(registryName: string): Promise<RegistryAsset[]> {
  const data = await getJson<{ assets: RegistryAsset[] }>(`${RAW}/${registryName}/assetlist.json`);
  return data.assets ?? [];
}

const https = (u: string) => u.startsWith("https://");
const noSlash = (u: string) => u.replace(/\/+$/, "");

export function registryToChainInfo(chain: RegistryChain, assets: RegistryAsset[]): ChainInfo {
  const byBase = new Map(assets.map((a) => [a.base, a]));
  const feeTokens = chain.fees?.fee_tokens ?? [];
  const stakeDenom = chain.staking?.staking_tokens?.[0]?.denom;
  const native = assets.filter((a) => !a.base.startsWith("ibc/") && (a.type_asset ?? "sdk.coin") === "sdk.coin");

  const toCur = (denom: string) => {
    const a = byBase.get(denom);
    return a ? assetToCurrency(a) : undefined;
  };

  const currencies = native.map(assetToCurrency).filter((c): c is Currency => !!c);
  const feeCurrencies = feeTokens
    .map((f) => {
      const c = toCur(f.denom);
      if (!c) return undefined;
      const low = f.low_gas_price ?? f.fixed_min_gas_price ?? 0;
      const average = f.average_gas_price ?? Math.max(low, 0.025);
      const high = f.high_gas_price ?? Math.max(average, 0.04);
      return { ...c, gasPriceStep: { low, average, high } };
    })
    .filter((c) => !!c);

  const rest = (chain.apis?.rest ?? []).map((a) => noSlash(a.address)).filter(https);
  const rpc = (chain.apis?.rpc ?? []).map((a) => noSlash(a.address)).filter(https);
  const explorer = chain.explorers?.find((e) => e.kind?.toLowerCase().includes("mintscan") && e.tx_page) ?? chain.explorers?.find((e) => e.tx_page);
  const accountExplorer = chain.explorers?.find((e) => e.account_page);
  const eth = chain.key_algos?.includes("ethsecp256k1");

  const features: string[] = ["ibc-transfer", "ibc-go"];
  if (chain.codebase?.cosmwasm?.enabled) features.push("cosmwasm");
  if (eth) features.push("eth-address-gen", "eth-key-sign");

  return validateChainInfo({
    chainId: chain.chain_id,
    chainName: chain.pretty_name ?? chain.chain_name,
    registryName: chain.chain_name,
    rpc: `https://rpc.cosmos.directory/${chain.chain_name}`,
    rest: `https://rest.cosmos.directory/${chain.chain_name}`,
    rpcFallbacks: rpc.slice(0, 4),
    restFallbacks: rest.slice(0, 4),
    bip44: { coinType: chain.slip44 ?? 118 },
    bech32Config: bech32ConfigFromPrefix(chain.bech32_prefix),
    currencies: currencies.length ? currencies : feeCurrencies,
    feeCurrencies,
    stakeCurrency: stakeDenom ? toCur(stakeDenom) : undefined,
    features,
    chainSymbolImageUrl: imageOf(chain) ?? currencies[0]?.coinImageUrl,
    txExplorer: explorer?.tx_page,
    accountExplorer: accountExplorer?.account_page,
    isTestnet: chain.network_type === "testnet",
  });
}

export async function fetchRegistryChain(registryName: string): Promise<ChainInfo> {
  if (!/^[a-z0-9_-]+$/.test(registryName)) throw new Error("Invalid registry name");
  const testnet = registryName.endsWith("testnet") ? `testnets/${registryName}` : registryName;
  const [chain, assets] = await Promise.all([
    getJson<RegistryChain>(`${RAW}/${testnet}/chain.json`),
    getJson<{ assets: RegistryAsset[] }>(`${RAW}/${testnet}/assetlist.json`).then((d) => d.assets ?? [], () => []),
  ]);
  return registryToChainInfo(chain, assets);
}

export interface IbcChannelPair {
  sourceChannel: string;
  sourcePort: string;
  counterpartyChannel: string;
}

interface RegistryIbc {
  chain_1: { chain_name: string };
  chain_2: { chain_name: string };
  channels: Array<{
    chain_1: { channel_id: string; port_id: string };
    chain_2: { channel_id: string; port_id: string };
    tags?: { preferred?: boolean; status?: string };
  }>;
}

export async function fetchIbcChannel(fromRegistry: string, toRegistry: string): Promise<IbcChannelPair | undefined> {
  const [a, b] = [fromRegistry, toRegistry].sort();
  let data: RegistryIbc;
  try {
    data = await getJson<RegistryIbc>(`${RAW}/_IBC/${a}-${b}.json`);
  } catch {
    return undefined;
  }
  const fromIs1 = data.chain_1.chain_name === fromRegistry;
  const candidates = data.channels.filter((c) => c.chain_1.port_id === "transfer" && c.chain_2.port_id === "transfer");
  const ch = candidates.find((c) => c.tags?.preferred) ?? candidates.find((c) => c.tags?.status === "live") ?? candidates[0];
  if (!ch) return undefined;
  const src = fromIs1 ? ch.chain_1 : ch.chain_2;
  const dst = fromIs1 ? ch.chain_2 : ch.chain_1;
  return { sourceChannel: src.channel_id, sourcePort: src.port_id, counterpartyChannel: dst.channel_id };
}
