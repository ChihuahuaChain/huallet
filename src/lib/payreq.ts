// Payment requests shared by QR codes and NFC:
//   cosmos:<bech32 address>?amount=1.5&denom=uhuahua&memo=...&chain_id=chihuahua-1
// Amount is in display units of `denom`. Parsing also takes a bare address
// or any "<scheme>:<address>?..." form, since other wallets' QR codes vary.

import { fromBech32 } from "@cosmjs/encoding";

export interface PaymentRequest {
  address: string;
  prefix: string;
  amount?: string;
  denom?: string;
  memo?: string;
  chainId?: string;
}

export function buildPaymentUri(r: Omit<PaymentRequest, "prefix">): string {
  const q = new URLSearchParams();
  if (r.amount) q.set("amount", r.amount);
  if (r.denom) q.set("denom", r.denom);
  if (r.memo) q.set("memo", r.memo);
  if (r.chainId) q.set("chain_id", r.chainId);
  const qs = q.toString();
  return `cosmos:${r.address}${qs ? `?${qs}` : ""}`;
}

function bech32Prefix(address: string): string | null {
  try {
    const { prefix, data } = fromBech32(address);
    return data.length === 20 || data.length === 32 ? prefix : null;
  } catch {
    return null;
  }
}

/** A payment request from scanned or tapped text, or null if it has no address. */
export function parsePaymentRequest(input: string): PaymentRequest | null {
  const text = input.trim();
  if (!text) return null;

  let address = text;
  let query = "";
  const q = text.indexOf("?");
  if (q >= 0) {
    address = text.slice(0, q);
    query = text.slice(q + 1);
  }
  // Strip a scheme ("cosmos:", "chihuahua:", "https://host/path/") down to the last segment.
  address = address.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "").split("/").pop() ?? "";
  const params = new URLSearchParams(query);
  if (!bech32Prefix(address) && params.get("to")) address = params.get("to")!;

  const prefix = bech32Prefix(address);
  if (!prefix) return null;
  const amount = params.get("amount") ?? undefined;
  return {
    address,
    prefix,
    amount: amount && /^\d+(\.\d+)?$/.test(amount) ? amount : undefined,
    denom: params.get("denom") ?? undefined,
    memo: params.get("memo") ?? undefined,
    chainId: params.get("chain_id") ?? undefined,
  };
}
