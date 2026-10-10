import type { ChainInfo, Currency } from "./types";
import { bech32ConfigFromPrefix } from "./types";

export class ChainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainValidationError";
  }
}

const CHAIN_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
// Bech32 HRPs seen in the registry include "6x", "lava@" and "addr_safro". ":" stays out:
// payment-request parsing treats it as a URI scheme separator.
const PREFIX_RE = /^[a-z0-9][a-z0-9@_]{0,30}$/;
const DENOM_RE = /^[a-zA-Z][a-zA-Z0-9/:._-]{1,127}$/;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ChainValidationError(msg);
}

export function isSafeEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function isSafeImageUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function stripSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function cleanCurrency(c: unknown, where: string): Currency {
  const x = c as Currency;
  assert(x && typeof x === "object", `${where}: invalid currency`);
  assert(typeof x.coinDenom === "string" && x.coinDenom.length > 0 && x.coinDenom.length <= 32, `${where}: invalid coinDenom`);
  assert(typeof x.coinMinimalDenom === "string" && DENOM_RE.test(x.coinMinimalDenom), `${where}: invalid coinMinimalDenom`);
  assert(Number.isInteger(x.coinDecimals) && x.coinDecimals >= 0 && x.coinDecimals <= 18, `${where}: coinDecimals must be 0..18`);
  assert(isSafeImageUrl(x.coinImageUrl), `${where}: coinImageUrl must be https`);
  return {
    coinDenom: x.coinDenom,
    coinMinimalDenom: x.coinMinimalDenom,
    coinDecimals: x.coinDecimals,
    coinGeckoId: typeof x.coinGeckoId === "string" ? x.coinGeckoId : undefined,
    coinImageUrl: x.coinImageUrl,
  };
}

export function validateChainInfo(input: unknown): ChainInfo {
  const x = input as Partial<ChainInfo> & { bech32Config?: Partial<ChainInfo["bech32Config"]> };
  assert(x && typeof x === "object", "Chain info must be a JSON object");
  assert(typeof x.chainId === "string" && CHAIN_ID_RE.test(x.chainId), "Invalid chainId");
  assert(typeof x.chainName === "string" && x.chainName.trim().length > 0 && x.chainName.length <= 64, "Invalid chainName");
  assert(typeof x.rpc === "string" && isSafeEndpoint(x.rpc), "RPC must be a valid https URL");
  assert(typeof x.rest === "string" && isSafeEndpoint(x.rest), "REST must be a valid https URL");
  assert(x.bip44 && Number.isInteger(x.bip44.coinType) && x.bip44.coinType >= 0, "Invalid bip44.coinType");
  const prefix = x.bech32Config?.bech32PrefixAccAddr;
  assert(typeof prefix === "string" && PREFIX_RE.test(prefix), "Invalid bech32PrefixAccAddr");
  assert(Array.isArray(x.currencies) && x.currencies.length > 0, "At least one currency is required");
  assert(Array.isArray(x.feeCurrencies) && x.feeCurrencies.length > 0, "At least one fee currency is required");

  const currencies = x.currencies.map((c, i) => cleanCurrency(c, `currencies[${i}]`));
  const feeCurrencies = x.feeCurrencies.map((c, i) => {
    const base = cleanCurrency(c, `feeCurrencies[${i}]`);
    const step = c.gasPriceStep;
    if (step) {
      for (const k of ["low", "average", "high"] as const) {
        // 18-decimal fee tokens (dYdX, Dymension, Haqq, …) price gas in the 1e10–1e11 range.
        assert(typeof step[k] === "number" && Number.isFinite(step[k]) && step[k] >= 0 && step[k] < 1e15, `feeCurrencies[${i}].gasPriceStep.${k} invalid`);
      }
      assert(step.low <= step.average && step.average <= step.high, `feeCurrencies[${i}].gasPriceStep must be low ≤ average ≤ high`);
    }
    return { ...base, gasPriceStep: step ? { low: step.low, average: step.average, high: step.high } : undefined };
  });
  const stakeCurrency = x.stakeCurrency ? cleanCurrency(x.stakeCurrency, "stakeCurrency") : undefined;

  const endpoints = (list: unknown) =>
    Array.isArray(list) ? list.filter((u): u is string => typeof u === "string" && isSafeEndpoint(u)).map(stripSlash) : undefined;
  const template = (t: unknown, placeholder: string) =>
    typeof t === "string" && t.startsWith("https://") && t.includes(placeholder) ? t : undefined;

  assert(isSafeImageUrl(x.chainSymbolImageUrl), "chainSymbolImageUrl must be https");

  return {
    chainId: x.chainId,
    chainName: x.chainName.trim(),
    rpc: stripSlash(x.rpc),
    rest: stripSlash(x.rest),
    rpcFallbacks: endpoints(x.rpcFallbacks),
    restFallbacks: endpoints(x.restFallbacks),
    bip44: { coinType: x.bip44.coinType },
    bech32Config: { ...bech32ConfigFromPrefix(prefix), ...x.bech32Config, bech32PrefixAccAddr: prefix },
    currencies,
    feeCurrencies,
    stakeCurrency,
    features: Array.isArray(x.features) ? x.features.filter((f) => typeof f === "string").slice(0, 32) : [],
    chainSymbolImageUrl: x.chainSymbolImageUrl,
    registryName: typeof x.registryName === "string" && /^[a-z0-9_-]+$/.test(x.registryName) ? x.registryName : undefined,
    txExplorer: template(x.txExplorer, "${txHash}"),
    accountExplorer: template(x.accountExplorer, "${accountAddress}"),
    isTestnet: !!x.isTestnet,
  };
}
