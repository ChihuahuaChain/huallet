import type { OfflineAminoSigner } from "@cosmjs/amino";
import type { OfflineDirectSigner, OfflineSigner } from "@cosmjs/proto-signing";
import type { ChainInfo } from "../chains/types";
import { stakeCurrencyOf } from "../chains/types";

export type WalletKind = "huallet" | "keplr";

export const HUALLET_CHROME_URL = "https://chromewebstore.google.com/detail/huallet/fjknmpfabobcbpmcklpoefjpdpmpnhmo";
export const HUALLET_FIREFOX_URL = "https://addons.mozilla.org/firefox/addon/huallet/";

const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

export const WALLETS: Record<WalletKind, { name: string; installUrl: string; keystoreEvent: string }> = {
  huallet: { name: "Huallet", installUrl: isFirefox ? HUALLET_FIREFOX_URL : HUALLET_CHROME_URL, keystoreEvent: "huallet_keystorechange" },
  keplr: { name: "Keplr", installUrl: "https://www.keplr.app/get", keystoreEvent: "keplr_keystorechange" },
};

export interface ExtensionKey {
  name: string;
  algo: string;
  bech32Address: string;
  isNanoLedger: boolean;
}

interface ProviderChainInfo {
  chainId: string;
  chainName: string;
  rpc: string;
  rest: string;
  bip44: { coinType: number };
  bech32Config: ChainInfo["bech32Config"];
  currencies: ChainInfo["currencies"];
  feeCurrencies: ChainInfo["feeCurrencies"];
  stakeCurrency: ChainInfo["currencies"][number];
  features?: string[];
  chainSymbolImageUrl?: string;
}

export interface CosmosWalletProvider {
  enable(chainIds: string | string[]): Promise<void>;
  getKey(chainId: string): Promise<ExtensionKey>;
  getOfflineSignerAuto(chainId: string): Promise<OfflineSigner>;
  getOfflineSigner(chainId: string): OfflineDirectSigner & OfflineAminoSigner;
  experimentalSuggestChain(chainInfo: ProviderChainInfo): Promise<void>;
  defaultOptions?: { sign?: { preferNoSetFee?: boolean; preferNoSetMemo?: boolean; disableBalanceCheck?: boolean } };
}

export class WalletNotInstalledError extends Error {
  constructor(public readonly kind: WalletKind) {
    super(`${WALLETS[kind].name} is not installed`);
    this.name = "WalletNotInstalledError";
  }
}

function readProvider(kind: WalletKind): CosmosWalletProvider | undefined {
  const w = window as unknown as Record<string, unknown>;
  const p = w[kind] as CosmosWalletProvider | undefined;
  return p && typeof p.enable === "function" && typeof p.getKey === "function" ? p : undefined;
}

export async function getProvider(kind: WalletKind, timeoutMs = 3000): Promise<CosmosWalletProvider | undefined> {
  const now = readProvider(kind);
  if (now || document.readyState === "complete") return now ?? (await new Promise((r) => setTimeout(() => r(readProvider(kind)), 300)));
  return new Promise((resolve) => {
    const done = () => resolve(readProvider(kind));
    window.addEventListener("load", done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

export function isInstalled(kind: WalletKind): boolean {
  return !!readProvider(kind);
}

export function toProviderChainInfo(chain: ChainInfo): ProviderChainInfo {
  return {
    chainId: chain.chainId,
    chainName: chain.chainName,
    rpc: chain.rpc,
    rest: chain.rest,
    bip44: chain.bip44,
    bech32Config: chain.bech32Config,
    currencies: chain.currencies,
    feeCurrencies: chain.feeCurrencies,
    stakeCurrency: stakeCurrencyOf(chain),
    features: chain.features,
    chainSymbolImageUrl: chain.chainSymbolImageUrl,
  };
}

const enabled = new Map<string, Promise<void>>();

function prepare(p: CosmosWalletProvider) {
  p.defaultOptions = { sign: { preferNoSetFee: true, preferNoSetMemo: true } };
}

async function requireProvider(kind: WalletKind): Promise<CosmosWalletProvider> {
  const p = await getProvider(kind);
  if (!p) throw new WalletNotInstalledError(kind);
  prepare(p);
  return p;
}

export function ensureChain(kind: WalletKind, chain: ChainInfo): Promise<void> {
  const cacheKey = `${kind}|${chain.chainId}`;
  let pending = enabled.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const p = await requireProvider(kind);
      try {
        await p.enable(chain.chainId);
      } catch (e) {
        if (/reject|denied|cancel/i.test(String(e))) throw e;
        await p.experimentalSuggestChain(toProviderChainInfo(chain));
        await p.enable(chain.chainId);
      }
    })();
    enabled.set(cacheKey, pending);
    pending.catch(() => enabled.delete(cacheKey));
  }
  return pending;
}

export async function connect(kind: WalletKind, chains: ChainInfo[], primary: ChainInfo): Promise<ExtensionKey> {
  const p = await requireProvider(kind);
  try {
    await p.enable(chains.map((c) => c.chainId));
    for (const c of chains) enabled.set(`${kind}|${c.chainId}`, Promise.resolve());
  } catch (e) {
    if (/reject|denied|cancel/i.test(String(e))) throw e;
  }
  await ensureChain(kind, primary);
  return p.getKey(primary.chainId);
}

export function forgetSession(): void {
  enabled.clear();
}

export async function getKey(kind: WalletKind, chain: ChainInfo): Promise<ExtensionKey> {
  await ensureChain(kind, chain);
  const p = await requireProvider(kind);
  return p.getKey(chain.chainId);
}

export async function getAddress(kind: WalletKind, chain: ChainInfo): Promise<string> {
  const key = await getKey(kind, chain);
  const prefix = chain.bech32Config.bech32PrefixAccAddr;
  if (!key.bech32Address.startsWith(prefix + "1")) {
    throw new Error(`Wallet returned an address for a different chain (expected prefix "${prefix}")`);
  }
  return key.bech32Address;
}

export async function getSigner(kind: WalletKind, chain: ChainInfo): Promise<OfflineSigner> {
  await ensureChain(kind, chain);
  const p = await requireProvider(kind);
  return p.getOfflineSignerAuto(chain.chainId);
}
