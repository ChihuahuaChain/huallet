import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStateStorage } from "@/lib/kv";

/** Keys are `${chainId}/${denom}` so the same denom can be hidden per chain. */
interface HiddenAssetsState {
  hidden: string[];
  hide: (key: string) => void;
  unhide: (key: string) => void;
}

export const assetKey = (chainId: string, denom: string) => `${chainId}/${denom}`;

export const useHiddenAssets = create<HiddenAssetsState>()(
  persist(
    (set) => ({
      hidden: [],
      hide: (key) => set((s) => (s.hidden.includes(key) ? s : { hidden: [...s.hidden, key] })),
      unhide: (key) => set((s) => ({ hidden: s.hidden.filter((k) => k !== key) })),
    }),
    { name: "huallet:hidden-assets", version: 1, storage: createJSONStorage(() => appStateStorage) },
  ),
);
