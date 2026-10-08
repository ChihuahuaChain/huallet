import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchResolvedBalances, type Balance } from "@/lib/assets";
import type { ChainInfo } from "@/lib/chains/types";
import {
  getAccountTxs,
  getAllValidators,
  getCw20Balance,
  getDelegations,
  getLiveTally,
  getMyVote,
  getProposal,
  getProposals,
  getRewards,
  getStakingApr,
  getStakingInfo,
  getUnbondings,
  getValidatorLogos,
} from "@/lib/cosmos/rest";
import { allChains, useChainsStore, useEnabledChains } from "@/state/chains";
import { useSettings } from "@/state/settings";
import { useWallet, type WalletBackend } from "@/state/wallet";

const MIN = 60_000;

function addressQuery(chain: ChainInfo | undefined, backend: WalletBackend | null, version: number, connected: boolean) {
  return {
    queryKey: ["address", backend?.id, version, chain?.chainId, chain?.bech32Config.bech32PrefixAccAddr],
    queryFn: () => backend!.getAddress(chain!),
    enabled: connected && !!backend && !!chain,
    staleTime: Infinity,
    retry: false,
  };
}

export function useAddressQuery(chain: ChainInfo | undefined) {
  const { backend, version, status } = useWallet();
  return useQuery(addressQuery(chain, backend, version, status === "connected"));
}

export function useAddress(chain: ChainInfo | undefined): string | undefined {
  return useAddressQuery(chain).data;
}

export function useAddressesWithErrors(chains: ChainInfo[]): { addresses: Record<string, string | undefined>; errors: Record<string, unknown> } {
  const { backend, version, status } = useWallet();
  const results = useQueries({ queries: chains.map((chain) => addressQuery(chain, backend, version, status === "connected")) });
  return {
    addresses: Object.fromEntries(chains.map((c, i) => [c.chainId, results[i].data])),
    errors: Object.fromEntries(chains.map((c, i) => [c.chainId, results[i].error ?? undefined])),
  };
}

export function useAddresses(chains: ChainInfo[]): Record<string, string | undefined> {
  return useAddressesWithErrors(chains).addresses;
}

function useAllChainsList(): ChainInfo[] {
  const custom = useChainsStore((s) => s.customChains);
  return useMemo(() => allChains(custom), [custom]);
}

export function useBalances(chain: ChainInfo | undefined, address: string | undefined) {
  const qc = useQueryClient();
  const everyChain = useAllChainsList();
  return useQuery({
    queryKey: ["balances", chain?.chainId, address],
    queryFn: () => fetchResolvedBalances(qc, chain!, everyChain, address!),
    enabled: !!chain && !!address,
    refetchInterval: MIN,
  });
}

export function useBalanceOf(chain: ChainInfo | undefined, address: string | undefined, denom: string | undefined): bigint {
  const { data } = useBalances(chain, address);
  return data?.find((b) => b.denom === denom)?.amount ?? 0n;
}

export interface ChainPortfolio {
  chain: ChainInfo;
  address?: string;
  balances: Balance[];
  isLoading: boolean;
  error?: unknown;
}

export function usePortfolio(): ChainPortfolio[] {
  const qc = useQueryClient();
  const chains = useEnabledChains();
  const everyChain = useAllChainsList();
  const { addresses, errors } = useAddressesWithErrors(chains);
  const results = useQueries({
    queries: chains.map((chain) => ({
      queryKey: ["balances", chain.chainId, addresses[chain.chainId]],
      queryFn: () => fetchResolvedBalances(qc, chain, everyChain, addresses[chain.chainId]!),
      enabled: !!addresses[chain.chainId],
      refetchInterval: MIN,
    })),
  });
  return chains.map((chain, i) => ({
    chain,
    address: addresses[chain.chainId],
    balances: results[i].data ?? [],
    isLoading: results[i].isLoading || (!addresses[chain.chainId] && !errors[chain.chainId]),
    error: errors[chain.chainId] ?? results[i].error ?? undefined,
  }));
}

export function useCw20Balances(chain: ChainInfo, address: string | undefined) {
  const tokens = useChainsStore((s) => s.cw20Tokens[chain.chainId]) ?? [];
  return useQueries({
    queries: tokens.map((t) => ({
      queryKey: ["cw20-balance", chain.chainId, t.contract, address],
      queryFn: async () => ({ token: t, amount: BigInt(await getCw20Balance(chain, t.contract, address!)) }),
      enabled: !!address,
      refetchInterval: MIN,
    })),
  });
}

export function usePrices(coingeckoIds: string[]) {
  const { showPrices, fiat } = useSettings();
  const ids = [...new Set(coingeckoIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["prices", fiat, ids.join(",")],
    queryFn: async () => {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=${fiat}`;
      const res = await fetch(url, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error(`Prices unavailable (${res.status})`);
      const data = (await res.json()) as Record<string, Record<string, number>>;
      return Object.fromEntries(Object.entries(data).map(([id, v]) => [id, v[fiat]])) as Record<string, number>;
    },
    enabled: showPrices && ids.length > 0,
    staleTime: MIN,
    refetchInterval: 2 * MIN,
    retry: 1,
  });
}

export function useValidators(chain: ChainInfo) {
  return useQuery({
    queryKey: ["validators", chain.chainId],
    queryFn: () => getAllValidators(chain),
    staleTime: 5 * MIN,
  });
}

export function useValidatorLogos(chain: ChainInfo) {
  return useQuery({
    queryKey: ["validator-logos", chain.registryName],
    queryFn: () => getValidatorLogos(chain.registryName!),
    enabled: !!chain.registryName,
    staleTime: 6 * 60 * MIN,
    gcTime: 12 * 60 * MIN,
    retry: false,
  });
}

export function useDelegations(chain: ChainInfo, address: string | undefined) {
  return useQuery({
    queryKey: ["delegations", chain.chainId, address],
    queryFn: () => getDelegations(chain, address!),
    enabled: !!address,
    refetchInterval: MIN,
  });
}

export function useRewards(chain: ChainInfo, address: string | undefined) {
  return useQuery({
    queryKey: ["rewards", chain.chainId, address],
    queryFn: () => getRewards(chain, address!),
    enabled: !!address,
    refetchInterval: 30_000,
  });
}

export function useUnbondings(chain: ChainInfo, address: string | undefined) {
  return useQuery({
    queryKey: ["unbondings", chain.chainId, address],
    queryFn: () => getUnbondings(chain, address!),
    enabled: !!address,
    refetchInterval: MIN,
  });
}

export function useStakingInfo(chain: ChainInfo) {
  return useQuery({ queryKey: ["staking-info", chain.chainId], queryFn: () => getStakingInfo(chain), staleTime: 10 * MIN });
}

export function useApr(chain: ChainInfo) {
  return useQuery({ queryKey: ["apr", chain.chainId], queryFn: () => getStakingApr(chain).then((v) => v ?? null), staleTime: 30 * MIN });
}

export function useProposals(chain: ChainInfo) {
  return useQuery({ queryKey: ["proposals", chain.chainId], queryFn: () => getProposals(chain), staleTime: 2 * MIN });
}

export function useProposal(chain: ChainInfo, id: string) {
  return useQuery({ queryKey: ["proposal", chain.chainId, id], queryFn: () => getProposal(chain, id), staleTime: MIN });
}

export function useLiveTally(chain: ChainInfo, id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["tally", chain.chainId, id],
    queryFn: () => getLiveTally(chain, id).then((t) => t ?? null),
    enabled,
    refetchInterval: MIN,
  });
}

export function useMyVote(chain: ChainInfo, id: string, voter: string | undefined) {
  return useQuery({
    queryKey: ["my-vote", chain.chainId, id, voter],
    queryFn: () => getMyVote(chain, id, voter!).then((v) => v ?? null),
    enabled: !!voter,
  });
}

export function useTxHistory(chain: ChainInfo, address: string | undefined) {
  return useQuery({
    queryKey: ["txs", chain.chainId, address],
    queryFn: () => getAccountTxs(chain, address!),
    enabled: !!address,
    staleTime: 30_000,
  });
}
