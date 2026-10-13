import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStateStorage } from "@/lib/kv";

export type Fiat = "usd" | "eur" | "chf" | "gbp" | "jpy";

/** "Hide small balances" cut-off per currency, roughly one US dollar. */
export const SMALL_BALANCE: Record<Fiat, number> = { usd: 1, eur: 1, chf: 1, gbp: 1, jpy: 100 };
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
  /** Desktop only: show the rotating ecosystem promo cards on the dashboard. */
  showPromotions: boolean;
  /** Ids of promo cards the user dismissed with the X; they never reappear. */
  dismissedPromos: string[];
  set: (patch: Partial<Omit<SettingsState, "set" | "setShowPromotions">>) => void;
  /** Turning promotions back on also restores every card the user had dismissed. */
  setShowPromotions: (on: boolean) => void;
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
      showPromotions: true,
      dismissedPromos: [],
      set: (patch) => set(patch),
      setShowPromotions: (on) => set(on ? { showPromotions: true, dismissedPromos: [] } : { showPromotions: false }),
    }),
    { name: "huallet:settings", version: 1, storage: createJSONStorage(() => appStateStorage) },
  ),
);
