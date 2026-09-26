import { useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveDenom, type ResolvedAsset } from "@/lib/assets";
import type { ChainInfo } from "@/lib/chains/types";
import {
  fetchCurveState,
  fetchDexParams,
  fetchLaunchpadTokens,
  fetchPools,
  fetchPoolStates,
  HUAHUA,
  quoteCurveBuy,
  quoteCurveSell,
} from "@/lib/dex/huahuaswap";
import { useAllChains } from "@/state/chains";

export function useDexPools(chain: ChainInfo) {
  return useQuery({
    queryKey: ["dex-pools", chain.chainId],
    queryFn: async () => fetchPoolStates(chain, await fetchPools(chain)),
    refetchInterval: 10_000,
  });
}

export function useDexParams(chain: ChainInfo) {
  return useQuery({ queryKey: ["dex-params", chain.chainId], queryFn: () => fetchDexParams(chain), staleTime: 5 * 60_000 });
}

export function useLaunchpadTokens(chain: ChainInfo) {
  return useQuery({ queryKey: ["launchpad-tokens", chain.chainId], queryFn: () => fetchLaunchpadTokens(chain), staleTime: 60_000 });
}

export function useCurveState(chain: ChainInfo, curve: string | undefined) {
  return useQuery({
    queryKey: ["curve-state", chain.chainId, curve],
    queryFn: () => fetchCurveState(chain, curve!),
    enabled: !!curve,
    refetchInterval: 10_000,
  });
}

export function useCurveQuote(chain: ChainInfo, curve: string | undefined, side: "buy" | "sell", denom: string | undefined, amount: bigint | null) {
  return useQuery({
    queryKey: ["curve-quote", chain.chainId, curve, side, denom, amount?.toString()],
    queryFn: () => (side === "buy" ? quoteCurveBuy(chain, curve!, amount!) : quoteCurveSell(chain, curve!, denom!, amount!)),
    enabled: !!curve && !!denom && !!amount && amount > 0n,
    refetchInterval: 5_000,
    retry: false,
  });
}

export function useDexAssets(chain: ChainInfo, denoms: string[]) {
  const qc = useQueryClient();
  const all = useAllChains();
  const key = [...new Set([HUAHUA, ...denoms])].sort().join(",");
  return useQuery({
    queryKey: ["dex-assets", chain.chainId, key],
    queryFn: async () => {
      const list = key.split(",");
      const resolved = await Promise.all(list.map((d) => resolveDenom(qc, chain, all, d)));
      return Object.fromEntries(list.map((d, i) => [d, resolved[i]])) as Record<string, ResolvedAsset>;
    },
    enabled: denoms.length > 0,
    staleTime: 10 * 60_000,
  });
}
