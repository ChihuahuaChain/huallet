import { CONTENT_SOURCE, PAGE_SOURCE, b64decode, b64encode, type SerializedKey, type SerializedSignDoc } from "../shared/protocol";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
const pending = new Map<string, Pending>();

function request<T>(method: string, params: unknown[]): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    window.postMessage({ source: PAGE_SOURCE, id, method, params }, window.location.origin);
  });
}

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const d = e.data;
  if (!d || d.source !== CONTENT_SOURCE) return;
  if (d.event === "keystorechange") {
    window.dispatchEvent(new Event("huallet_keystorechange"));
    return;
  }
  const p = pending.get(d.id);
  if (!p) return;
  pending.delete(d.id);
  if (d.ok) p.resolve(d.result);
  else p.reject(new Error(d.error ?? "Request failed"));
});

interface SignDocLike {
  bodyBytes?: Uint8Array | null;
  authInfoBytes?: Uint8Array | null;
  chainId?: string | null;
  accountNumber?: bigint | { toString(): string } | null;
}

const toKey = (k: SerializedKey) => ({ ...k, pubKey: b64decode(k.pubKey), address: b64decode(k.address) });

const serializeDoc = (d: SignDocLike): SerializedSignDoc => ({
  bodyBytes: b64encode(d.bodyBytes ?? new Uint8Array()),
  authInfoBytes: b64encode(d.authInfoBytes ?? new Uint8Array()),
  chainId: d.chainId ?? "",
  accountNumber: (d.accountNumber ?? 0).toString(),
});

const deserializeDoc = (d: SerializedSignDoc) => ({
  bodyBytes: b64decode(d.bodyBytes),
  authInfoBytes: b64decode(d.authInfoBytes),
  chainId: d.chainId,
  accountNumber: BigInt(d.accountNumber),
});

const provider = {
  version: "0.12.0",
  mode: "extension" as const,
  isHuallet: true,
  defaultOptions: {} as Record<string, unknown>,

  enable: (chainIds: string | string[]) => request<void>("enable", [chainIds]),
  disable: (chainIds?: string | string[]) => request<void>("disable", [chainIds]),
  getKey: async (chainId: string) => toKey(await request<SerializedKey>("getKey", [chainId])),
  getKeysSettled: async (chainIds: string[]) => {
    const r = await request<Array<{ status: string; value?: SerializedKey; reason?: string }>>("getKeysSettled", [chainIds]);
    return r.map((x) => (x.value ? { ...x, value: toKey(x.value) } : x));
  },
  signDirect: async (chainId: string, signer: string, signDoc: SignDocLike) => {
    const r = await request<{ signed: SerializedSignDoc; signature: unknown }>("signDirect", [chainId, signer, serializeDoc(signDoc)]);
    return { signed: deserializeDoc(r.signed), signature: r.signature };
  },
  signAmino: (chainId: string, signer: string, signDoc: unknown) => request<unknown>("signAmino", [chainId, signer, signDoc]),
  signArbitrary: (chainId: string, signer: string, data: string | Uint8Array) =>
    request<unknown>("signArbitrary", [chainId, signer, typeof data === "string" ? { text: data } : { b64: b64encode(data) }]),
  experimentalSuggestChain: (chainInfo: unknown) => request<void>("experimentalSuggestChain", [chainInfo]),
  getChainInfosWithoutEndpoints: () => request<unknown[]>("getChainInfosWithoutEndpoints", []),

  getOfflineSigner(chainId: string) {
    return makeSigner(chainId, true);
  },
  getOfflineSignerOnlyAmino(chainId: string) {
    return makeSigner(chainId, false);
  },
  async getOfflineSignerAuto(chainId: string) {
    const key = await provider.getKey(chainId);
    return makeSigner(chainId, !key.isNanoLedger);
  },
};

function makeSigner(chainId: string, direct: boolean) {
  const getAccounts = async () => {
    const k = await provider.getKey(chainId);
    return [{ address: k.bech32Address, algo: k.algo, pubkey: k.pubKey }];
  };
  const signAmino = (signer: string, doc: unknown) => provider.signAmino(chainId, signer, doc);
  if (!direct) return { chainId, getAccounts, signAmino };
  return {
    chainId,
    getAccounts,
    signAmino,
    signDirect: (signer: string, doc: SignDocLike) => provider.signDirect(chainId, signer, doc),
  };
}

declare global {
  interface Window {
    huallet?: typeof provider;
  }
}

Object.defineProperty(window, "huallet", { value: provider, configurable: false, writable: false });
window.dispatchEvent(new Event("huallet#initialized"));
