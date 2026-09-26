import { fromBech32 } from "@cosmjs/encoding";
import type { ChainInfo } from "./chains/types";

export type AddressCheck =
  | { ok: true }
  | { ok: false; reason: "empty" | "invalid" | "wrong-prefix"; expected?: string; actual?: string; otherChain?: ChainInfo };

export function checkAddress(address: string, chain: ChainInfo, knownChains: ChainInfo[] = []): AddressCheck {
  const a = address.trim();
  if (!a) return { ok: false, reason: "empty" };
  let prefix: string;
  let data: Uint8Array;
  try {
    ({ prefix, data } = fromBech32(a));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (data.length !== 20 && data.length !== 32) return { ok: false, reason: "invalid" };
  const expected = chain.bech32Config.bech32PrefixAccAddr;
  if (prefix !== expected) {
    const otherChain = knownChains.find((c) => c.bech32Config.bech32PrefixAccAddr === prefix);
    return { ok: false, reason: "wrong-prefix", expected, actual: prefix, otherChain };
  }
  return { ok: true };
}
