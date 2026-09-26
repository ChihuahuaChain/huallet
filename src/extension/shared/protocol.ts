import type { StdSignDoc } from "@cosmjs/amino";
import type { ChainInfo } from "@/lib/chains/types";
import type { KeyMeta, KeyringStatus, NewKey } from "@/lib/keyring/keyring";

export const PAGE_SOURCE = "huallet-inpage";
export const CONTENT_SOURCE = "huallet-content";
export const PROVIDER_PORT = "huallet-provider";

export interface SerializedSignDoc {
  bodyBytes: string;
  authInfoBytes: string;
  chainId: string;
  accountNumber: string;
}

export interface SerializedAccount {
  address: string;
  algo: string;
  pubkey: string;
}

export interface StdSignature {
  pub_key: { type: string; value: string };
  signature: string;
}

export interface SerializedKey {
  name: string;
  algo: string;
  pubKey: string;
  address: string;
  bech32Address: string;
  isNanoLedger: boolean;
  isKeystone: boolean;
}

export type UiRequest =
  | { type: "status" }
  | { type: "create"; password: string; key: NewKey }
  | { type: "unlock"; password: string }
  | { type: "lock" }
  | { type: "activity" }
  | { type: "addKey"; key: NewKey }
  | { type: "renameKey"; id: string; name: string }
  | { type: "markBackedUp"; id: string }
  | { type: "removeKey"; id: string; password: string }
  | { type: "revealSecret"; id: string; password: string }
  | { type: "pendingBackupSecret"; id: string }
  | { type: "changePassword"; oldPassword: string; newPassword: string }
  | { type: "verifyPassword"; password: string }
  | { type: "reset"; password: string }
  | { type: "selectKey"; id: string }
  | { type: "getAccount"; keyId: string; chain: ChainInfo }
  | { type: "signDirect"; keyId: string; chain: ChainInfo; signerAddress: string; signDoc: SerializedSignDoc }
  | { type: "getApproval"; id: string }
  | { type: "resolveApproval"; id: string; approved: boolean; result?: unknown }
  | { type: "listPermissions" }
  | { type: "revokePermission"; origin: string };

export interface WalletStatus extends KeyringStatus {
  selectedKeyId: string | null;
}

export type Envelope<T> = { ok: true; result: T } | { ok: false; error: string; code?: string };

export interface ApprovalMsg {
  kind: string;
  typeUrl: string;
  fields: Record<string, string>;
  coins?: Array<{ denom: string; amount: string }>;
}

export type Approval =
  | { id: string; type: "unlock"; origin: string }
  | { id: string; type: "connect"; origin: string; chainIds: string[]; chainNames: string[] }
  | { id: string; type: "suggest-chain"; origin: string; chain: ChainInfo }
  | {
      id: string;
      type: "sign";
      origin: string;
      chainId: string;
      chainName: string;
      signer: string;
      mode: "direct" | "amino" | "arbitrary";
      messages: ApprovalMsg[];
      json: string;
      memo: string;
      fee?: { amount: Array<{ denom: string; amount: string }>; gas: string };
      data?: string;
      ledger?: { hdAccount: number; hdIndex: number; prefix: string };
      signDoc?: StdSignDoc;
    };

export type ApprovalInput = Approval extends infer A ? (A extends { id: string } ? Omit<A, "id"> : never) : never;

export type Permissions = Record<string, string[]>;

export type ProviderMethod =
  | "enable"
  | "disable"
  | "getKey"
  | "getKeysSettled"
  | "signDirect"
  | "signAmino"
  | "signArbitrary"
  | "experimentalSuggestChain"
  | "getChainInfosWithoutEndpoints";

export interface ProviderRequest {
  source: typeof PAGE_SOURCE;
  id: string;
  method: ProviderMethod;
  params: unknown[];
}

export interface ProviderResponse {
  source: typeof CONTENT_SOURCE;
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ProviderEvent {
  source: typeof CONTENT_SOURCE;
  event: "keystorechange";
}

export type { KeyMeta };

export function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64decode(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
