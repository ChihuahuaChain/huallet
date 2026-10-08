// Dogtags — a name service on Chihuahua (a CosmWasm contract). Aliases resolve
// to a chihuahua1… address client-side; a send to an alias becomes a normal bank
// MsgSend to the resolved address. No new tx type.
import type { ChainInfo } from "./chains/types";
import { wasmSmartQuery } from "./cosmos/rest";

const CONTRACTS: Record<string, string> = {
  "chihuahua-1": "chihuahua1zqmhmz9weyrngl3v8gfprcuygv6fsgw9j9fwu42syegeryqyz2yshrznzx",
};

/** Where users register/manage a dogtag. */
export const DOGTAGS_URL = "https://tags.chihuahua.wtf";

export function dogtagsContract(chain: ChainInfo): string | undefined {
  return CONTRACTS[chain.chainId];
}

/** Alias syntax: lowercase a-z and digits, at most one internal hyphen, 3–32 chars. */
export function isAliasFormat(s: string): boolean {
  const a = s.trim();
  return a.length >= 3 && a.length <= 32 && /^[a-z0-9]+(-[a-z0-9]+)?$/.test(a);
}

type Cached = { at: number; value: string | null };
const cache = new Map<string, Cached>();
const TTL = 45_000;

async function query(chain: ChainInfo, kind: "resolve" | "reverse", key: string, msg: unknown): Promise<string | null> {
  const contract = dogtagsContract(chain);
  if (!contract) return null;
  const cacheKey = `${chain.chainId}|${kind}|${key}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let value: string | null = null;
  try {
    const r = await wasmSmartQuery<{ address?: string | null; alias?: string | null }>(chain, contract, msg);
    value = (kind === "resolve" ? r?.address : r?.alias) ?? null;
  } catch {
    value = null;
  }
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** Resolve an alias to its current owner address, or null if unregistered/expired. */
export function resolveAlias(chain: ChainInfo, alias: string): Promise<string | null> {
  const a = alias.trim();
  if (!isAliasFormat(a)) return Promise.resolve(null);
  return query(chain, "resolve", a, { resolve: { alias: a } });
}

/** Reverse-lookup the alias owned by an address, or null. */
export function reverseLookup(chain: ChainInfo, address: string): Promise<string | null> {
  return query(chain, "reverse", address, { reverse: { address } });
}
