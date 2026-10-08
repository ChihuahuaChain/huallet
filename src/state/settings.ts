import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStateStorage } from "@/lib/kv";

export type Fiat = "usd" | "eur" | "chf" | "gbp";
export type Theme = "system" | "light" | "dark";

export interface SettingsState {
  fiat: Fiat;
  theme: Theme;
  /** "auto" follows the browser language; otherwise a locale code (e.g. "it"). */
  language: string;
  autoLockMinutes: number;
  showPrices: boolean;
  hideSmallBalances: boolean;
  hideUnverified: boolean;
  hideBalances: boolean;
  /** Chrome/Edge: show the wallet as a docked side panel instead of a popup. */
  sidePanel: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      fiat: "usd",
      theme: "system",
      language: "auto",
      autoLockMinutes: 15,
      showPrices: true,
      hideSmallBalances: false,
      hideUnverified: false,
      hideBalances: false,
      sidePanel: true,
      set: (patch) => set(patch),
    }),
    { name: "huallet:settings", version: 1, storage: createJSONStorage(() => appStateStorage) },
  ),
);
