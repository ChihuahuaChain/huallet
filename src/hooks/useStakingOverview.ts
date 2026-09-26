import { useQueries } from "@tanstack/react-query";
import type { ChainInfo } from "@/lib/chains/types";
import { stakeCurrencyOf } from "@/lib/chains/types";
import { getDelegations, getRewards, getStakingApr, getUnbondings } from "@/lib/cosmos/rest";
import { useAddresses } from "./queries";

export interface ChainStaking {
  chain: ChainInfo;
  address?: string;
  staked: bigint;
  rewards: bigint;
  unbonding: bigint;
  validatorsWithRewards: string[];
  apr?: number | null;
  isLoading: boolean;
}

const MIN = 60_000;

export function useStakingOverview(chains: ChainInfo[]): ChainStaking[] {
  const addresses = useAddresses(chains);
  const q = useQueries({
    queries: chains.flatMap((chain) => {
      const address = addresses[chain.chainId];
      return [
        { queryKey: ["delegations", chain.chainId, address], queryFn: () => getDelegations(chain, address!), enabled: !!address, refetchInterval: MIN },
        { queryKey: ["rewards", chain.chainId, address], queryFn: () => getRewards(chain, address!), enabled: !!address, refetchInterval: 30_000 },
        { queryKey: ["unbondings", chain.chainId, address], queryFn: () => getUnbondings(chain, address!), enabled: !!address, refetchInterval: MIN },
        { queryKey: ["apr", chain.chainId], queryFn: () => getStakingApr(chain).then((v) => v ?? null), staleTime: 30 * MIN },
      ];
    }),
  });

  return chains.map((chain, i) => {
    const [d, r, u, a] = q.slice(i * 4, i * 4 + 4);
    const denom = stakeCurrencyOf(chain).coinMinimalDenom;
    const delegations = (d.data ?? []) as Awaited<ReturnType<typeof getDelegations>>;
    const rewards = r.data as Awaited<ReturnType<typeof getRewards>> | undefined;
    const unbondings = (u.data ?? []) as Awaited<ReturnType<typeof getUnbondings>>;
    const intPart = (s: string) => BigInt(s.split(".")[0] || "0");
    return {
      chain,
      address: addresses[chain.chainId],
      staked: delegations.reduce((s, x) => s + BigInt(x.balance.amount), 0n),
      rewards: intPart(rewards?.total.find((c) => c.denom === denom)?.amount ?? "0"),
      unbonding: unbondings.reduce((s, x) => s + x.entries.reduce((t, e) => t + BigInt(e.balance), 0n), 0n),
      validatorsWithRewards: (rewards?.rewards ?? [])
        .filter((x) => x.reward.some((c) => c.denom === denom && intPart(c.amount) > 0n))
        .map((x) => x.validator_address),
      apr: a.data as number | null | undefined,
      isLoading: d.isLoading || r.isLoading || !addresses[chain.chainId],
    };
  });
}
