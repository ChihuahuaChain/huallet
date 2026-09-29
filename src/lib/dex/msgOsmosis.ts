import { BinaryReader, BinaryWriter } from "cosmjs-types/binary";
import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import type { AminoConverter } from "@cosmjs/stargate";

export const SWAP_EXACT_IN_TYPE_URL = "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn";
export const SPLIT_SWAP_EXACT_IN_TYPE_URL = "/osmosis.poolmanager.v1beta1.MsgSplitRouteSwapExactAmountIn";

export interface SwapAmountInRoute {
  poolId: bigint;
  tokenOutDenom: string;
}

export interface SwapExactAmountInValue {
  sender: string;
  routes: SwapAmountInRoute[];
  tokenIn: { denom: string; amount: string };
  tokenOutMinAmount: string;
}

export interface SplitRoute {
  pools: SwapAmountInRoute[];
  tokenInAmount: string;
}

export interface SplitRouteSwapExactAmountInValue {
  sender: string;
  routes: SplitRoute[];
  tokenInDenom: string;
  tokenOutMinAmount: string;
}

const Route = {
  encode(r: SwapAmountInRoute, writer: BinaryWriter = BinaryWriter.create()): BinaryWriter {
    if (r.poolId !== 0n) writer.uint32(8).uint64(r.poolId);
    if (r.tokenOutDenom !== "") writer.uint32(18).string(r.tokenOutDenom);
    return writer;
  },
  decode(reader: BinaryReader, length: number): SwapAmountInRoute {
    const end = reader.pos + length;
    const r: SwapAmountInRoute = { poolId: 0n, tokenOutDenom: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      if (tag >>> 3 === 1) r.poolId = reader.uint64();
      else if (tag >>> 3 === 2) r.tokenOutDenom = reader.string();
      else reader.skipType(tag & 7);
    }
    return r;
  },
};

const routeFromPartial = (r: Partial<SwapAmountInRoute>): SwapAmountInRoute => ({
  poolId: r.poolId !== undefined ? BigInt(r.poolId) : 0n,
  tokenOutDenom: r.tokenOutDenom ?? "",
});

export const MsgSwapExactAmountIn = {
  typeUrl: SWAP_EXACT_IN_TYPE_URL,

  encode(m: SwapExactAmountInValue, writer: BinaryWriter = BinaryWriter.create()): BinaryWriter {
    if (m.sender !== "") writer.uint32(10).string(m.sender);
    for (const r of m.routes) Route.encode(r, writer.uint32(18).fork()).ldelim();
    Coin.encode(Coin.fromPartial(m.tokenIn), writer.uint32(26).fork()).ldelim();
    if (m.tokenOutMinAmount !== "") writer.uint32(34).string(m.tokenOutMinAmount);
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): SwapExactAmountInValue {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const m: SwapExactAmountInValue = { sender: "", routes: [], tokenIn: { denom: "", amount: "" }, tokenOutMinAmount: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          m.sender = reader.string();
          break;
        case 2:
          m.routes.push(Route.decode(reader, reader.uint32()));
          break;
        case 3: {
          const c = Coin.decode(reader, reader.uint32());
          m.tokenIn = { denom: c.denom, amount: c.amount };
          break;
        }
        case 4:
          m.tokenOutMinAmount = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return m;
  },

  fromPartial(o: Partial<SwapExactAmountInValue>): SwapExactAmountInValue {
    return {
      sender: o.sender ?? "",
      routes: (o.routes ?? []).map(routeFromPartial),
      tokenIn: { denom: o.tokenIn?.denom ?? "", amount: o.tokenIn?.amount ?? "" },
      tokenOutMinAmount: o.tokenOutMinAmount ?? "",
    };
  },
};

const SplitRouteCodec = {
  encode(r: SplitRoute, writer: BinaryWriter): BinaryWriter {
    for (const p of r.pools) Route.encode(p, writer.uint32(10).fork()).ldelim();
    if (r.tokenInAmount !== "") writer.uint32(18).string(r.tokenInAmount);
    return writer;
  },
  decode(reader: BinaryReader, length: number): SplitRoute {
    const end = reader.pos + length;
    const r: SplitRoute = { pools: [], tokenInAmount: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      if (tag >>> 3 === 1) r.pools.push(Route.decode(reader, reader.uint32()));
      else if (tag >>> 3 === 2) r.tokenInAmount = reader.string();
      else reader.skipType(tag & 7);
    }
    return r;
  },
};

export const MsgSplitRouteSwapExactAmountIn = {
  typeUrl: SPLIT_SWAP_EXACT_IN_TYPE_URL,

  encode(m: SplitRouteSwapExactAmountInValue, writer: BinaryWriter = BinaryWriter.create()): BinaryWriter {
    if (m.sender !== "") writer.uint32(10).string(m.sender);
    for (const r of m.routes) SplitRouteCodec.encode(r, writer.uint32(18).fork()).ldelim();
    if (m.tokenInDenom !== "") writer.uint32(26).string(m.tokenInDenom);
    if (m.tokenOutMinAmount !== "") writer.uint32(34).string(m.tokenOutMinAmount);
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): SplitRouteSwapExactAmountInValue {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const m: SplitRouteSwapExactAmountInValue = { sender: "", routes: [], tokenInDenom: "", tokenOutMinAmount: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          m.sender = reader.string();
          break;
        case 2:
          m.routes.push(SplitRouteCodec.decode(reader, reader.uint32()));
          break;
        case 3:
          m.tokenInDenom = reader.string();
          break;
        case 4:
          m.tokenOutMinAmount = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return m;
  },

  fromPartial(o: Partial<SplitRouteSwapExactAmountInValue>): SplitRouteSwapExactAmountInValue {
    return {
      sender: o.sender ?? "",
      routes: (o.routes ?? []).map((r) => ({ pools: (r.pools ?? []).map(routeFromPartial), tokenInAmount: r.tokenInAmount ?? "" })),
      tokenInDenom: o.tokenInDenom ?? "",
      tokenOutMinAmount: o.tokenOutMinAmount ?? "",
    };
  },
};

type AminoRoute = { pool_id: string; token_out_denom: string };
const routeToAmino = (r: SwapAmountInRoute): AminoRoute => ({ pool_id: r.poolId.toString(), token_out_denom: r.tokenOutDenom });
const routeFromAmino = (r: AminoRoute): SwapAmountInRoute => ({ poolId: BigInt(r.pool_id), tokenOutDenom: r.token_out_denom });

export const swapExactAmountInAminoConverter: AminoConverter = {
  aminoType: "osmosis/poolmanager/swap-exact-amount-in",
  toAmino: (v: SwapExactAmountInValue) => ({
    sender: v.sender,
    routes: v.routes.map(routeToAmino),
    token_in: { denom: v.tokenIn.denom, amount: v.tokenIn.amount },
    token_out_min_amount: v.tokenOutMinAmount,
  }),
  fromAmino: (a: { sender: string; routes: AminoRoute[]; token_in: { denom: string; amount: string }; token_out_min_amount: string }): SwapExactAmountInValue => ({
    sender: a.sender,
    routes: a.routes.map(routeFromAmino),
    tokenIn: a.token_in,
    tokenOutMinAmount: a.token_out_min_amount,
  }),
};

export const splitRouteSwapExactAmountInAminoConverter: AminoConverter = {
  aminoType: "osmosis/poolmanager/split-amount-in",
  toAmino: (v: SplitRouteSwapExactAmountInValue) => ({
    sender: v.sender,
    routes: v.routes.map((r) => ({ pools: r.pools.map(routeToAmino), token_in_amount: r.tokenInAmount })),
    token_in_denom: v.tokenInDenom,
    token_out_min_amount: v.tokenOutMinAmount,
  }),
  fromAmino: (a: {
    sender: string;
    routes: Array<{ pools: AminoRoute[]; token_in_amount: string }>;
    token_in_denom: string;
    token_out_min_amount: string;
  }): SplitRouteSwapExactAmountInValue => ({
    sender: a.sender,
    routes: a.routes.map((r) => ({ pools: r.pools.map(routeFromAmino), tokenInAmount: r.token_in_amount })),
    tokenInDenom: a.token_in_denom,
    tokenOutMinAmount: a.token_out_min_amount,
  }),
};
