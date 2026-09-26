import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStateStorage } from "@/lib/kv";
import { BUILTIN_CHAINS, BUILTIN_CHAIN_IDS, CHIHUAHUA_CHAIN_ID, DEFAULT_ENABLED_CHAIN_IDS } from "@/lib/chains/builtin";
import type { ChainInfo } from "@/lib/chains/types";
import { validateChainInfo } from "@/lib/chains/validate";

export interface Cw20Token {
  contract: string;
  symbol: string;
  name: string;
  decimals: number;
}

interface ChainsState {
  customChains: ChainInfo[];
  enabledChainIds: string[];
  selectedChainId: string;
  cw20Tokens: Record<string, Cw20Token[]>;
  addCustomChain: (chain: ChainInfo) => void;
  removeCustomChain: (chainId: string) => void;
  setEnabled: (chainId: string, enabled: boolean) => void;
  selectChain: (chainId: string) => void;
  addCw20: (chainId: string, token: Cw20Token) => void;
  removeCw20: (chainId: string, contract: string) => void;
}

export const useChainsStore = create<ChainsState>()(
  persist(
    (set, get) => ({
      customChains: [],
      enabledChainIds: DEFAULT_ENABLED_CHAIN_IDS,
      selectedChainId: CHIHUAHUA_CHAIN_ID,
      cw20Tokens: {},
      addCustomChain: (input) => {
        const chain = validateChainInfo(input);
        if (BUILTIN_CHAIN_IDS.has(chain.chainId)) throw new Error(`${chain.chainId} is already built in`);
        set((s) => ({
          customChains: [...s.customChains.filter((c) => c.chainId !== chain.chainId), chain],
          enabledChainIds: s.enabledChainIds.includes(chain.chainId) ? s.enabledChainIds : [...s.enabledChainIds, chain.chainId],
        }));
      },
      removeCustomChain: (chainId) =>
        set((s) => ({
          customChains: s.customChains.filter((c) => c.chainId !== chainId),
          enabledChainIds: s.enabledChainIds.filter((id) => id !== chainId),
          selectedChainId: s.selectedChainId === chainId ? CHIHUAHUA_CHAIN_ID : s.selectedChainId,
        })),
      setEnabled: (chainId, enabled) => {
        const s = get();
        if (!enabled && s.enabledChainIds.length <= 1) return;
        const enabledChainIds = enabled
          ? [...new Set([...s.enabledChainIds, chainId])]
          : s.enabledChainIds.filter((id) => id !== chainId);
        set({
          enabledChainIds,
          selectedChainId: !enabled && s.selectedChainId === chainId ? enabledChainIds[0] : s.selectedChainId,
        });
      },
      selectChain: (chainId) => set({ selectedChainId: chainId }),
      addCw20: (chainId, token) =>
        set((s) => ({
          cw20Tokens: {
            ...s.cw20Tokens,
            [chainId]: [...(s.cw20Tokens[chainId] ?? []).filter((t) => t.contract !== token.contract), token],
          },
        })),
      removeCw20: (chainId, contract) =>
        set((s) => ({
          cw20Tokens: { ...s.cw20Tokens, [chainId]: (s.cw20Tokens[chainId] ?? []).filter((t) => t.contract !== contract) },
        })),
    }),
    {
      name: "huallet:chains",
      version: 1,
      storage: createJSONStorage(() => appStateStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ChainsState>;
        const customChains = (p.customChains ?? []).flatMap((c) => {
          try {
            return [validateChainInfo(c)];
          } catch {
            return [];
          }
        });
        return { ...current, ...p, customChains };
      },
    },
  ),
);

export function allChains(custom: ChainInfo[]): ChainInfo[] {
  return [...BUILTIN_CHAINS, ...custom];
}

export function useAllChains(): ChainInfo[] {
  const custom = useChainsStore((s) => s.customChains);
  return allChains(custom);
}

export function useEnabledChains(): ChainInfo[] {
  const custom = useChainsStore((s) => s.customChains);
  const enabled = useChainsStore((s) => s.enabledChainIds);
  return allChains(custom).filter((c) => enabled.includes(c.chainId));
}

export function useSelectedChain(): ChainInfo {
  const chains = useEnabledChains();
  const selected = useChainsStore((s) => s.selectedChainId);
  return chains.find((c) => c.chainId === selected) ?? chains[0] ?? BUILTIN_CHAINS[0];
}

export function isBuiltinChain(chainId: string): boolean {
  return BUILTIN_CHAIN_IDS.has(chainId);
}
