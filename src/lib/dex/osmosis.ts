import type { EncodeObject } from "@cosmjs/proto-signing";
import type { ResolvedAsset } from "../assets";
import {
  SPLIT_SWAP_EXACT_IN_TYPE_URL,
  SWAP_EXACT_IN_TYPE_URL,
  type SplitRouteSwapExactAmountInValue,
  type SwapAmountInRoute,
  type SwapExactAmountInValue,
} from "./msgOsmosis";

export const OSMOSIS_CHAIN_ID = "osmosis-1";
export const OSMO = "uosmo";
export const OSMOSIS_HUAHUA = "ibc/B9E0A1A524E98BB407D3CED8720EFEFD186002F90C1B1B7964811DD0CCC12228";
const SQS = "https://sqs.osmosis.zone";
const ASSETLIST = "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/frontend/assetlist.json";

interface AssetlistEntry {
  coinMinimalDenom: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURIs?: { png?: string; svg?: string };
  coingeckoId?: string;
  verified?: boolean;
  unstable?: boolean;
  disabled?: boolean;
  preview?: boolean;
}

export interface OsmosisAsset extends ResolvedAsset {
  /** Osmosis flags assets whose IBC transfers are unreliable; they still trade on Osmosis. */
  unstable: boolean;
}

/** Verified, tradable Osmosis assets, keyed by denom. */
export async function fetchOsmosisAssets(): Promise<Record<string, OsmosisAsset>> {
  const r = await fetch(ASSETLIST);
  if (!r.ok) throw new Error(`Osmosis asset list: HTTP ${r.status}`);
  const { assets } = (await r.json()) as { assets: AssetlistEntry[] };
  const out: Record<string, OsmosisAsset> = {};
  for (const a of assets) {
    if (!a.verified || a.disabled || a.preview) continue;
    out[a.coinMinimalDenom] = {
      coinDenom: a.symbol,
      coinMinimalDenom: a.coinMinimalDenom,
      coinDecimals: a.decimals,
      coinImageUrl: a.logoURIs?.png ?? a.logoURIs?.svg,
      coinGeckoId: a.coingeckoId || undefined,
      verified: true,
      unstable: !!a.unstable,
    };
  }
  return out;
}

export interface OsmosisRoute {
  pools: SwapAmountInRoute[];
  inAmount: bigint;
  outAmount: bigint;
}

export interface OsmosisQuote {
  tokenInDenom: string;
  tokenInAmount: bigint;
  tokenOutDenom: string;
  outAmount: bigint;
  routes: OsmosisRoute[];
  priceImpact: number;
  effectiveFee: number;
}

interface SqsQuote {
  amount_in: { denom: string; amount: string };
  amount_out: string;
  route: Array<{ pools: Array<{ id: number; token_out_denom: string }>; in_amount: string; out_amount: string }>;
  price_impact?: string;
  effective_fee?: string;
}

export async function fetchOsmosisQuote(tokenInDenom: string, amount: bigint, tokenOutDenom: string, signal?: AbortSignal): Promise<OsmosisQuote> {
  const q = new URLSearchParams({ tokenIn: `${amount}${tokenInDenom}`, tokenOutDenom, humanDenoms: "false" });
  const r = await fetch(`${SQS}/router/quote?${q}`, { signal });
  const body = await r.text();
  if (!r.ok) {
    let msg = body;
    try {
      msg = (JSON.parse(body) as { message?: string }).message ?? body;
    } catch {
      /* plain text */
    }
    throw new Error(msg || `Osmosis router: HTTP ${r.status}`);
  }
  return parseSqsQuote(JSON.parse(body) as SqsQuote, tokenInDenom, amount, tokenOutDenom);
}

export function parseSqsQuote(s: SqsQuote, tokenInDenom: string, amount: bigint, tokenOutDenom: string): OsmosisQuote {
  if (s.amount_in.denom !== tokenInDenom || BigInt(s.amount_in.amount) !== amount) throw new Error("Osmosis router answered for a different input");
  const routes = s.route.map((r) => ({
    pools: r.pools.map((p) => ({ poolId: BigInt(p.id), tokenOutDenom: p.token_out_denom })),
    inAmount: BigInt(r.in_amount),
    outAmount: BigInt(r.out_amount),
  }));
  if (!routes.length || routes.some((r) => !r.pools.length || r.pools[r.pools.length - 1].tokenOutDenom !== tokenOutDenom)) {
    throw new Error("Osmosis router returned a route to a different token");
  }
  // The router rounds each split down, so the parts can fall a few base units short of the input.
  const shortfall = amount - routes.reduce((sum, r) => sum + r.inAmount, 0n);
  if (shortfall < 0n || shortfall > BigInt(routes.length)) throw new Error("Osmosis router routes do not add up to the input");
  routes[0].inAmount += shortfall;
  return {
    tokenInDenom,
    tokenInAmount: amount,
    tokenOutDenom,
    outAmount: BigInt(s.amount_out),
    routes,
    priceImpact: Math.abs(Number(s.price_impact ?? 0)),
    effectiveFee: Number(s.effective_fee ?? 0),
  };
}

export function minOut(quote: OsmosisQuote, slippageBps: number): bigint {
  return (quote.outAmount * (10_000n - BigInt(slippageBps))) / 10_000n;
}

export function osmosisSwapMsg(quote: OsmosisQuote, sender: string, slippageBps: number): EncodeObject {
  const tokenOutMinAmount = minOut(quote, slippageBps).toString();
  if (quote.routes.length === 1) {
    return {
      typeUrl: SWAP_EXACT_IN_TYPE_URL,
      value: {
        sender,
        routes: quote.routes[0].pools,
        tokenIn: { denom: quote.tokenInDenom, amount: quote.tokenInAmount.toString() },
        tokenOutMinAmount,
      } satisfies SwapExactAmountInValue,
    };
  }
  return {
    typeUrl: SPLIT_SWAP_EXACT_IN_TYPE_URL,
    value: {
      sender,
      routes: quote.routes.map((r) => ({ pools: r.pools, tokenInAmount: r.inAmount.toString() })),
      tokenInDenom: quote.tokenInDenom,
      tokenOutMinAmount,
    } satisfies SplitRouteSwapExactAmountInValue,
  };
}
