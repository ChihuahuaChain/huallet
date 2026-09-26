import type { ChainInfo } from "../chains/types";
import { storage } from "../storage";
import { setDisconnectHandler, useWallet, type WalletBackend } from "@/state/wallet";
import { connect, forgetSession, getAddress, getKey, getSigner, WALLETS, type WalletKind } from "./extension";

const REMEMBER_KEY = "connected-wallet";

function backendFor(kind: WalletKind, hardware: boolean): WalletBackend {
  return {
    id: kind,
    label: WALLETS[kind].name,
    hardware,
    getAddress: (chain) => getAddress(kind, chain),
    getSigner: (chain) => getSigner(kind, chain),
  };
}

export async function connectWallet(kind: WalletKind, chains: ChainInfo[], primary: ChainInfo): Promise<void> {
  useWallet.setState({ status: "connecting", error: null });
  try {
    const key = await connect(kind, chains, primary);
    storage.set(REMEMBER_KEY, kind);
    useWallet.getState().useBackend(backendFor(kind, key.isNanoLedger), key.name, key.isNanoLedger);

    const onChange = async () => {
      forgetSession();
      try {
        const k = await getKey(kind, primary);
        useWallet.setState((s) => ({ name: k.name, isLedger: k.isNanoLedger, version: s.version + 1 }));
      } catch {
        useWallet.getState().disconnect();
      }
    };
    window.addEventListener(WALLETS[kind].keystoreEvent, onChange);
    setDisconnectHandler(() => {
      window.removeEventListener(WALLETS[kind].keystoreEvent, onChange);
      forgetSession();
      storage.remove(REMEMBER_KEY);
    });
  } catch (e) {
    useWallet.setState({ status: "disconnected", backend: null, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export function rememberedWallet(): WalletKind | undefined {
  const k = storage.get<string>(REMEMBER_KEY);
  return k && k in WALLETS ? (k as WalletKind) : undefined;
}
