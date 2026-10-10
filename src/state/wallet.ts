import type { OfflineSigner } from "@cosmjs/proto-signing";
import { create } from "zustand";
import type { ChainInfo } from "@/lib/chains/types";

export type WalletStatus = "disconnected" | "connecting" | "connected";

export interface WalletBackend {
  id: string;
  label: string;
  hardware?: boolean;
  getAddress(chain: ChainInfo): Promise<string>;
  getSigner(chain: ChainInfo): Promise<OfflineSigner>;
  /** False when the account can't hold an address on `chain` (e.g. a Ledger key off coin type 118). Absent means every chain. */
  supportsChain?(chain: ChainInfo): boolean;
}

interface WalletState {
  status: WalletStatus;
  backend: WalletBackend | null;
  name: string;
  isLedger: boolean;
  version: number;
  error: string | null;
  useBackend: (backend: WalletBackend, name: string, isLedger?: boolean) => void;
  disconnect: () => void;
}

let onDisconnect: (() => void) | null = null;

export function setDisconnectHandler(fn: (() => void) | null) {
  onDisconnect = fn;
}

export const useWallet = create<WalletState>()((set) => ({
  status: "disconnected",
  backend: null,
  name: "",
  isLedger: false,
  version: 0,
  error: null,

  useBackend: (backend, name, isLedger = false) =>
    set((s) => ({
      status: "connected",
      backend,
      name,
      isLedger,
      error: null,
      version: s.backend?.id === backend.id ? s.version : s.version + 1,
    })),

  disconnect: () => {
    onDisconnect?.();
    onDisconnect = null;
    set((s) => ({ status: "disconnected", backend: null, name: "", isLedger: false, version: s.version + 1, error: null }));
  },
}));
