import { BinaryReader, BinaryWriter } from "cosmjs-types/binary";
import { Coin } from "cosmjs-types/cosmos/base/v1beta1/coin";
import type { AminoConverter } from "@cosmjs/stargate";
import { DIRECT_SWAP_TYPE_URL, type DirectSwapValue } from "./huahuaswap";

export const MsgDirectSwap = {
  typeUrl: DIRECT_SWAP_TYPE_URL,

  encode(message: DirectSwapValue, writer: BinaryWriter = BinaryWriter.create()): BinaryWriter {
    if (message.swapRequesterAddress !== "") writer.uint32(10).string(message.swapRequesterAddress);
    if (message.poolId !== 0n) writer.uint32(16).uint64(message.poolId);
    if (message.swapTypeId !== 0) writer.uint32(24).uint32(message.swapTypeId);
    Coin.encode(Coin.fromPartial(message.offerCoin), writer.uint32(34).fork()).ldelim();
    if (message.demandCoinDenom !== "") writer.uint32(42).string(message.demandCoinDenom);
    if (message.orderPrice !== "") writer.uint32(58).string(message.orderPrice);
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): DirectSwapValue {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const m: DirectSwapValue = { swapRequesterAddress: "", poolId: 0n, swapTypeId: 0, offerCoin: { denom: "", amount: "" }, demandCoinDenom: "", orderPrice: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          m.swapRequesterAddress = reader.string();
          break;
        case 2:
          m.poolId = reader.uint64();
          break;
        case 3:
          m.swapTypeId = reader.uint32();
          break;
        case 4: {
          const c = Coin.decode(reader, reader.uint32());
          m.offerCoin = { denom: c.denom, amount: c.amount };
          break;
        }
        case 5:
          m.demandCoinDenom = reader.string();
          break;
        case 7:
          m.orderPrice = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
      }
    }
    return m;
  },

  fromPartial(o: Partial<DirectSwapValue>): DirectSwapValue {
    return {
      swapRequesterAddress: o.swapRequesterAddress ?? "",
      poolId: o.poolId !== undefined ? BigInt(o.poolId) : 0n,
      swapTypeId: o.swapTypeId ?? 0,
      offerCoin: { denom: o.offerCoin?.denom ?? "", amount: o.offerCoin?.amount ?? "" },
      demandCoinDenom: o.demandCoinDenom ?? "",
      orderPrice: o.orderPrice ?? "",
    };
  },
};

export const directSwapAminoConverter: AminoConverter = {
  aminoType: DIRECT_SWAP_TYPE_URL,
  toAmino: (v: DirectSwapValue) => ({
    swap_requester_address: v.swapRequesterAddress,
    pool_id: v.poolId.toString(),
    swap_type_id: v.swapTypeId,
    offer_coin: { denom: v.offerCoin.denom, amount: v.offerCoin.amount },
    demand_coin_denom: v.demandCoinDenom,
    order_price: v.orderPrice,
  }),
  fromAmino: (a: {
    swap_requester_address: string;
    pool_id: string;
    swap_type_id: number;
    offer_coin: { denom: string; amount: string };
    demand_coin_denom: string;
    order_price: string;
  }): DirectSwapValue => ({
    swapRequesterAddress: a.swap_requester_address,
    poolId: BigInt(a.pool_id),
    swapTypeId: a.swap_type_id,
    offerCoin: a.offer_coin,
    demandCoinDenom: a.demand_coin_denom,
    orderPrice: a.order_price,
  }),
};
