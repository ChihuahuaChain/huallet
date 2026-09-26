import type { EncodeObject } from "@cosmjs/proto-signing";
import { toUtf8 } from "@cosmjs/encoding";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import type { ChainInfo } from "../chains/types";
import { restGet, wasmSmartQuery, getBalances } from "../cosmos/rest";

export const HUAHUA = "uhuahua";
export const HUAHUASWAP_FACTORY = "chihuahua1sj9verkuk8aa9jrngnpwup6zjht4vwngjlpemnt9w38ccp0qnlcswvsuzc";
export const DIRECT_SWAP_TYPE_URL = "/liquidity.v1beta1.MsgDirectSwap";

const ONE = 10n ** 18n;

export interface LiquidityPool {
  id: string;
  denoms: [string, string];
  reserveAccount: string;
}

export interface PoolState extends LiquidityPool {
  reserves: Record<string, bigint>;
}

export interface DexParams {
  swapFeeRate: bigint;
  maxOrderRatio: bigint;
  circuitBreaker: boolean;
}

export interface LaunchpadToken {
  name: string;
  subdenom: string;
  denom: string;
  description: string;
  creator: string;
  curve: string;
  completed: boolean;
  createdAt: number;
}

export interface CurveState {
  sold: bigint;
  collected: bigint;
  completed: boolean;
  price: string;
}

export function parseDec(s: string): bigint {
  const [int, frac = ""] = s.trim().split(".");
  return BigInt(int || "0") * ONE + BigInt((frac + "0".repeat(18)).slice(0, 18) || "0");
}

function chopRound(x: bigint): bigint {
  const q = x / ONE;
  const r = x % ONE;
  const half = ONE / 2n;
  if (r < half) return q;
  if (r > half) return q + 1n;
  return q % 2n === 0n ? q : q + 1n;
}

export function decMul(a: bigint, b: bigint): bigint {
  return chopRound(a * b);
}

export function decQuo(a: bigint, b: bigint): bigint {
  return chopRound((a * ONE * ONE) / b);
}

export async function fetchPools(chain: ChainInfo): Promise<LiquidityPool[]> {
  const out: LiquidityPool[] = [];
  let key = "";
  for (let i = 0; i < 20; i++) {
    const r = await restGet<{
      pools: Array<{ id: string; reserve_coin_denoms: [string, string]; reserve_account_address: string }>;
      pagination?: { next_key: string | null };
    }>(chain, `/cosmos/liquidity/v1beta1/pools?pagination.limit=100${key ? `&pagination.key=${encodeURIComponent(key)}` : ""}`);
    for (const p of r.pools) out.push({ id: p.id, denoms: p.reserve_coin_denoms, reserveAccount: p.reserve_account_address });
    if (!r.pagination?.next_key) break;
    key = r.pagination.next_key;
  }
  return out;
}

export async function fetchPoolStates(chain: ChainInfo, pools: LiquidityPool[]): Promise<PoolState[]> {
  return Promise.all(
    pools.map(async (p) => {
      const balances = await getBalances(chain, p.reserveAccount);
      const reserves: Record<string, bigint> = {};
      for (const d of p.denoms) reserves[d] = BigInt(balances.find((b) => b.denom === d)?.amount ?? "0");
      return { ...p, reserves };
    }),
  );
}

export async function fetchDexParams(chain: ChainInfo): Promise<DexParams> {
  const r = await restGet<{ params: { swap_fee_rate: string; max_order_amount_ratio: string; circuit_breaker_enabled: boolean } }>(
    chain,
    "/cosmos/liquidity/v1beta1/params",
  );
  return {
    swapFeeRate: parseDec(r.params.swap_fee_rate),
    maxOrderRatio: parseDec(r.params.max_order_amount_ratio),
    circuitBreaker: !!r.params.circuit_breaker_enabled,
  };
}

export async function fetchLaunchpadTokens(chain: ChainInfo): Promise<LaunchpadToken[]> {
  const out: LaunchpadToken[] = [];
  let start: string | undefined;
  for (let i = 0; i < 40; i++) {
    const r = await wasmSmartQuery<{
      tokens: Array<{
        name: string;
        subdenom: string;
        denom: string;
        description: string;
        creator: string;
        bonding_curve_address: string;
        completed: boolean;
        created_at: number;
      }>;
    }>(chain, HUAHUASWAP_FACTORY, { get_tokens_with_pagination: { limit: 50, ...(start ? { start_after: start } : {}) } });
    for (const t of r.tokens) {
      out.push({
        name: t.name,
        subdenom: t.subdenom,
        denom: t.denom,
        description: t.description,
        creator: t.creator,
        curve: t.bonding_curve_address,
        completed: t.completed,
        createdAt: t.created_at,
      });
    }
    if (r.tokens.length < 50) break;
    start = r.tokens[r.tokens.length - 1].subdenom;
  }
  return out;
}

export async function fetchCurveState(chain: ChainInfo, curve: string): Promise<CurveState> {
  const r = await wasmSmartQuery<{ sold: { amount: string }; collected: { amount: string }; completed: boolean; price: { amount: string } }>(
    chain,
    curve,
    { curve_state: {} },
  );
  return { sold: BigInt(r.sold.amount), collected: BigInt(r.collected.amount), completed: r.completed, price: r.price.amount };
}

export async function quoteCurveBuy(chain: ChainInfo, curve: string, huahuaAmount: bigint): Promise<bigint> {
  const r = await wasmSmartQuery<{ amount: string }>(chain, curve, {
    calculate_buy_amount: { token_amount: { denom: HUAHUA, amount: huahuaAmount.toString() } },
  });
  return BigInt(r.amount);
}

export async function quoteCurveSell(chain: ChainInfo, curve: string, denom: string, tokenAmount: bigint): Promise<bigint> {
  const r = await wasmSmartQuery<{ amount: string }>(chain, curve, {
    calculate_sell_amount: { token_amount: { denom, amount: tokenAmount.toString() } },
  });
  return BigInt(r.amount);
}

export interface PoolQuote {
  pool: PoolState;
  offerDenom: string;
  demandDenom: string;
  offerAmount: bigint;
  outputDec: bigint;
  received: bigint;
  fee: bigint;
  maxOrder: bigint;
  priceImpact: number;
}

export function quotePool(pool: PoolState, offerDenom: string, offerAmount: bigint, params: DexParams): PoolQuote {
  const demandDenom = pool.denoms[0] === offerDenom ? pool.denoms[1] : pool.denoms[0];
  const inR = pool.reserves[offerDenom];
  const outR = pool.reserves[demandDenom];
  const outputDec = offerAmount > 0n ? decQuo(outR * offerAmount * ONE, (inR + offerAmount) * ONE) : 0n;
  const feeDec = decMul(outputDec, params.swapFeeRate);
  const received = (outputDec - feeDec) / ONE;
  const maxOrder = (inR * params.maxOrderRatio) / ONE;
  const spot = inR > 0n ? Number(outR) / Number(inR) : 0;
  const exec = offerAmount > 0n ? Number(outputDec) / 1e18 / Number(offerAmount) : spot;
  return {
    pool,
    offerDenom,
    demandDenom,
    offerAmount,
    outputDec,
    received,
    fee: feeDec / ONE,
    maxOrder,
    priceImpact: spot > 0 ? Math.max(0, 1 - exec / spot) : 0,
  };
}

export function orderPriceFor(q: PoolQuote, minReceived: bigint, params: DexParams): bigint {
  const target = (minReceived * ONE * ONE + (ONE - params.swapFeeRate) - 1n) / (ONE - params.swapFeeRate);
  const offerIsFirst = q.offerDenom === q.pool.denoms[0];
  if (offerIsFirst) {
    const num = q.offerAmount * ONE * ONE;
    return (num + target - 1n) / target;
  }
  return target / q.offerAmount;
}

export function passesSlippageCheck(q: PoolQuote, orderPrice: bigint): boolean {
  const inDec = q.offerAmount * ONE;
  const expectedMin = q.offerDenom === q.pool.denoms[0] ? decQuo(inDec, orderPrice) : decMul(inDec, orderPrice);
  return expectedMin <= q.outputDec;
}

export interface SwapRoute {
  hops: PoolQuote[];
  received: bigint;
  minReceived: bigint;
  priceImpact: number;
  exceedsMaxOrder: boolean;
  leftover?: { denom: string; amount: bigint };
}

export function findPool(pools: PoolState[], a: string, b: string): PoolState | undefined {
  return pools.find((p) => p.denoms.includes(a) && p.denoms.includes(b));
}

export function routeSwap(pools: PoolState[], params: DexParams, from: string, to: string, amount: bigint, slippageBps: number): SwapRoute | undefined {
  if (from === to || amount <= 0n) return undefined;
  const bps = BigInt(slippageBps);
  const direct = findPool(pools, from, to);
  if (direct) {
    const q = quotePool(direct, from, amount, params);
    return {
      hops: [q],
      received: q.received,
      minReceived: (q.received * (10_000n - bps)) / 10_000n,
      priceImpact: q.priceImpact,
      exceedsMaxOrder: amount > q.maxOrder,
    };
  }
  const p1 = findPool(pools, from, HUAHUA);
  const p2 = findPool(pools, HUAHUA, to);
  if (!p1 || !p2) return undefined;
  const halfBps = bps / 2n;
  const q1 = quotePool(p1, from, amount, params);
  const min1 = (q1.received * (10_000n - halfBps)) / 10_000n;
  const q2 = quotePool(p2, HUAHUA, min1, params);
  return {
    hops: [q1, q2],
    received: q2.received,
    minReceived: (q2.received * (10_000n - halfBps)) / 10_000n,
    priceImpact: 1 - (1 - q1.priceImpact) * (1 - q2.priceImpact),
    exceedsMaxOrder: amount > q1.maxOrder || min1 > q2.maxOrder,
    leftover: { denom: HUAHUA, amount: q1.received - min1 },
  };
}

export interface DirectSwapValue {
  swapRequesterAddress: string;
  poolId: bigint;
  swapTypeId: number;
  offerCoin: { denom: string; amount: string };
  demandCoinDenom: string;
  orderPrice: string;
}

export function swapMsgs(route: SwapRoute, sender: string, params: DexParams): EncodeObject[] {
  const minPerHop =
    route.hops.length === 1
      ? [route.minReceived]
      : [route.hops[1].offerAmount, route.minReceived];
  return route.hops.map((q, i) => ({
    typeUrl: DIRECT_SWAP_TYPE_URL,
    value: {
      swapRequesterAddress: sender,
      poolId: BigInt(q.pool.id),
      swapTypeId: 1,
      offerCoin: { denom: q.offerDenom, amount: q.offerAmount.toString() },
      demandCoinDenom: q.demandDenom,
      orderPrice: orderPriceFor(q, minPerHop[i], params).toString(),
    } satisfies DirectSwapValue,
  }));
}

export function curveBuyMsg(sender: string, curve: string, huahuaAmount: bigint): EncodeObject {
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
      sender,
      contract: curve,
      msg: toUtf8(JSON.stringify({ buy: {} })),
      funds: [{ denom: HUAHUA, amount: huahuaAmount.toString() }],
    }),
  };
}

export function curveSellMsg(sender: string, curve: string, denom: string, tokenAmount: bigint): EncodeObject {
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
      sender,
      contract: curve,
      msg: toUtf8(JSON.stringify({ sell: {} })),
      funds: [{ denom, amount: tokenAmount.toString() }],
    }),
  };
}
