import { create } from "zustand";
import type { KeyMeta } from "@/lib/keyring/keyring";
import { extApi } from "@/lib/kv";
import { bg } from "../popup/background";
import type { WalletStatus } from "../shared/protocol";

export type KeyringUiStatus = "loading" | "no-vault" | "locked" | "unlocked";

interface KeyringState {
  status: KeyringUiStatus;
  keys: KeyMeta[];
  selectedKeyId: string | null;
  refresh: () => Promise<void>;
  selectKey: (id: string) => Promise<void>;
}

export const useKeyring = create<KeyringState>()((set, get) => ({
  status: "loading",
  keys: [],
  selectedKeyId: null,
  refresh: async () => {
    const s = await bg<WalletStatus>({ type: "status" });
    set({ status: !s.hasVault ? "no-vault" : s.unlocked ? "unlocked" : "locked", keys: s.keys, selectedKeyId: s.selectedKeyId });
  },
  selectKey: async (id) => {
    await bg({ type: "selectKey", id });
    await get().refresh();
  },
}));

extApi()?.storage.onChanged.addListener((changes, area) => {
  if ((area === "session" && "huallet:session" in changes) || (area === "local" && ("huallet:vault" in changes || "huallet:selected-key" in changes))) {
    void useKeyring.getState().refresh();
  }
});

export function useSelectedKey(): KeyMeta | undefined {
  return useKeyring((s) => s.keys.find((k) => k.id === s.selectedKeyId) ?? s.keys[0]);
}
