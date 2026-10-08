import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStateStorage } from "@/lib/kv";

export type Fiat = "usd" | "eur" | "chf" | "gbp";
export type Theme = "system" | "light" | "dark";

export interface SettingsState {
  fiat: Fiat;
  theme: Theme;
  autoLockMinutes: number;
  showPrices: boolean;
  hideSmallBalances: boolean;
  hideUnverified: boolean;
  hideBalances: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      fiat: "usd",
      theme: "system",
      autoLockMinutes: 15,
      showPrices: true,
      hideSmallBalances: false,
      hideUnverified: false,
      hideBalances: false,
      set: (patch) => set(patch),
    }),
    { name: "huallet:settings", version: 1, storage: createJSONStorage(() => appStateStorage) },
  ),
);
