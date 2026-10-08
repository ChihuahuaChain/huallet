import type { QueryClient } from "@tanstack/react-query";
import { fetchRegistryAssets, assetToCurrency, fetchIbcChannel } from "./chains/registry";
import type { ChainInfo, Currency } from "./chains/types";
import { shortDenom } from "./format";
import { getBalances, getDenomMetadata, getDenomTrace, type Coin } from "./cosmos/rest";

export interface ResolvedAsset extends Currency {
  /** True when the denom is the chain's own token or listed in the Cosmos chain registry. */
  verified: boolean;
  /**
   * True for an IBC token that is not registry-listed but whose origin denom is a known currency
   * AND arrived over the registry's canonical channel — a legitimate bridge, not a look-alike.
   */
  bridged?: boolean;
  ibcPath?: string;
}

export interface Balance {
  denom: string;
  amount: bigint;
  asset: ResolvedAsset;
}

const DAY = 24 * 60 * 60 * 1000;

function registryAssetsQuery(chain: ChainInfo) {
  return {
    queryKey: ["registry-assets", chain.registryName],
    queryFn: async () => {
      if (!chain.registryName) return [] as Currency[];
      const assets = await fetchRegistryAssets(chain.registryName);
      return assets.map(assetToCurrency).filter((c): c is Currency => !!c && !!c.coinMinimalDenom);
    },
    staleTime: DAY,
    gcTime: DAY,
  };
}

/**
 * Confirm an IBC token reached `chain` from `origin` over the registry's canonical transfer
 * channel. Only single-hop paths ("transfer/channel-N") are trusted; multi-hop, a mismatched
 * channel, or a missing registry entry all return false (treated as unknown).
 */
async function isCanonicalBridge(qc: QueryClient, chain: ChainInfo, origin: ChainInfo, path: string): Promise<boolean> {
  if (!chain.registryName || !origin.registryName) return false;
  if (!/^transfer\/channel-\d+$/.test(path)) return false;
  const leadingChannel = path.split("/")[1];
  const pair = await qc.fetchQuery({
    queryKey: ["ibc-channel", chain.registryName, origin.registryName],
    queryFn: () => fetchIbcChannel(chain.registryName!, origin.registryName!),
    staleTime: DAY,
    gcTime: DAY,
  });
  return !!pair && pair.sourceChannel === leadingChannel;
}

export async function resolveDenom(
  qc: QueryClient,
  chain: ChainInfo,
  allChains: ChainInfo[],
  denom: string,
): Promise<ResolvedAsset> {
  const own = chain.currencies.find((c) => c.coinMinimalDenom === denom) ?? chain.feeCurrencies.find((c) => c.coinMinimalDenom === denom);
  if (own) return { ...own, verified: true };

  const registry = await qc.fetchQuery(registryAssetsQuery(chain)).catch(() => [] as Currency[]);
  const reg = registry.find((c) => c.coinMinimalDenom === denom);
  if (reg) return { ...reg, verified: true };

  if (denom.startsWith("ibc/")) {
    const trace = await qc
      .fetchQuery({ queryKey: ["denom-trace", chain.chainId, denom], queryFn: () => getDenomTrace(chain, denom), staleTime: Infinity })
      .catch(() => undefined);
    if (trace) {
      const originChain = allChains.find((c) => c.currencies.some((cur) => cur.coinMinimalDenom === trace.baseDenom));
      const known = originChain?.currencies.find((cur) => cur.coinMinimalDenom === trace.baseDenom);
      if (known && originChain) {
        const bridged = await isCanonicalBridge(qc, chain, originChain, trace.path).catch(() => false);
        // A non-canonical look-alike must not borrow the real token's logo, or it would look legit.
        return { ...known, coinMinimalDenom: denom, coinImageUrl: bridged ? known.coinImageUrl : undefined, verified: false, bridged, ibcPath: trace.path };
      }
      return {
        coinDenom: shortDenom(trace.baseDenom).toUpperCase().replace(/^U(?=[A-Z]{2,})/, ""),
        coinMinimalDenom: denom,
        coinDecimals: trace.baseDenom.startsWith("u") ? 6 : 0,
        verified: false,
        ibcPath: trace.path,
      };
    }
  }

  const md = await qc
    .fetchQuery({ queryKey: ["denom-meta", chain.chainId, denom], queryFn: () => getDenomMetadata(chain, denom).then((m) => m ?? null), staleTime: DAY })
    .catch(() => null);
  if (md) {
    const decimals = md.denom_units.reduce((max, u) => Math.max(max, u.exponent), 0);
    const symbol = md.symbol && !md.symbol.includes("/") ? md.symbol.toUpperCase() : shortDenom(md.display || denom).toUpperCase();
    return {
      coinDenom: symbol,
      coinMinimalDenom: denom,
      coinDecimals: Math.min(decimals, 18),
      coinImageUrl: md.uri?.startsWith("https://") ? md.uri : undefined,
      verified: false,
    };
  }

  return { coinDenom: shortDenom(denom), coinMinimalDenom: denom, coinDecimals: 0, verified: false };
}

export async function fetchResolvedBalances(
  qc: QueryClient,
  chain: ChainInfo,
  allChains: ChainInfo[],
  address: string,
): Promise<Balance[]> {
  const coins: Coin[] = await getBalances(chain, address);
  const out = await Promise.all(
    coins.map(async (c) => ({ denom: c.denom, amount: BigInt(c.amount), asset: await resolveDenom(qc, chain, allChains, c.denom) })),
  );
  const nativeDenom = (chain.stakeCurrency ?? chain.currencies[0]).coinMinimalDenom;
  const tier = (a: ResolvedAsset) => (a.verified ? 0 : a.bridged ? 1 : 2);
  return out.sort((a, b) => {
    if (a.denom === nativeDenom) return -1;
    if (b.denom === nativeDenom) return 1;
    if (tier(a.asset) !== tier(b.asset)) return tier(a.asset) - tier(b.asset);
    return a.asset.coinDenom.localeCompare(b.asset.coinDenom);
  });
}
