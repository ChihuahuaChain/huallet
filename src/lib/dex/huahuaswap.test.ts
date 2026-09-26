import { fromHex } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";
import { aminoTypes, registry, summarize } from "../cosmos/tx";
import {
  HUAHUA,
  parseDec,
  passesSlippageCheck,
  quotePool,
  routeSwap,
  swapMsgs,
  orderPriceFor,
  type DexParams,
  type PoolState,
} from "./huahuaswap";
import { MsgDirectSwap } from "./msgDirectSwap";

const BEER = "factory/chihuahua1sj9verkuk8aa9jrngnpwup6zjht4vwngjlpemnt9w38ccp0qnlcswvsuzc/beer";
const TACOS = "factory/chihuahua13jawsn574rf3f0u5rhu7e8n6sayx5gkw3eddhp/utacos";
const SENDER = "chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h";

const GO_PROTO_HEX =
  "180122120a07756875616875611207313030303030302a51666163746f72792f63686968756168756131736a397665726b756b386161396a726e676e70777570367a6a68743476776e676a6c70656d6e743977333863637030716e6c6373777673757a632f626565723a123132333435363738393031323334353637380a306368696875616875613139726c34636d32686d7238616679346b6c6470787a33666b61346a67757130616c34716e37681003";
const GO_AMINO_JSON =
  '{"type":"/liquidity.v1beta1.MsgDirectSwap","value":{"demand_coin_denom":"factory/chihuahua1sj9verkuk8aa9jrngnpwup6zjht4vwngjlpemnt9w38ccp0qnlcswvsuzc/beer","offer_coin":{"amount":"1000000","denom":"uhuahua"},"order_price":"123456789012345678","pool_id":"3","swap_requester_address":"chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h","swap_type_id":1}}';

const params: DexParams = { swapFeeRate: parseDec("0.005"), maxOrderRatio: parseDec("0.1"), circuitBreaker: false };
const beerPool: PoolState = {
  id: "3",
  denoms: [BEER, HUAHUA],
  reserveAccount: "x",
  reserves: { [BEER]: 41317129764211n, [HUAHUA]: 30868795330744n },
};
const tacosPool: PoolState = {
  id: "2",
  denoms: [TACOS, HUAHUA],
  reserveAccount: "y",
  reserves: { [TACOS]: 5_000_000_000_000n, [HUAHUA]: 9_000_000_000_000n },
};

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

describe("MsgDirectSwap encoding matches the chain (x/tx reference output)", () => {
  const value = {
    swapRequesterAddress: SENDER,
    poolId: 3n,
    swapTypeId: 1,
    offerCoin: { denom: HUAHUA, amount: "1000000" },
    demandCoinDenom: BEER,
    orderPrice: "123456789012345678",
  };

  it("decodes the reference protobuf bytes and round-trips", () => {
    expect(MsgDirectSwap.decode(fromHex(GO_PROTO_HEX))).toEqual(value);
    const ours = registry.encode({ typeUrl: MsgDirectSwap.typeUrl, value });
    expect(MsgDirectSwap.decode(ours)).toEqual(value);
  });

  it("produces the exact Amino JSON the chain signs (Ledger)", () => {
    const amino = aminoTypes.toAmino({ typeUrl: MsgDirectSwap.typeUrl, value });
    expect(JSON.stringify(sortKeys(amino))).toBe(GO_AMINO_JSON);
    expect(aminoTypes.fromAmino(amino).value).toEqual(value);
  });

  it("summarizes for the review dialog", () => {
    const s = summarize({ typeUrl: MsgDirectSwap.typeUrl, value });
    expect(s.kind).toBe("swap");
    expect(s.coins).toEqual([{ denom: HUAHUA, amount: "1000000" }]);
  });
});

describe("pool math replicates the chain", () => {
  it("matches the constant-product formula minus the 0.5% fee", () => {
    for (const [offer, amount] of [
      [HUAHUA, 1_000_000n],
      [BEER, 123_456_789n],
      [HUAHUA, 2_000_000_000_000n],
    ] as const) {
      const q = quotePool(beerPool, offer, amount, params);
      const inR = Number(beerPool.reserves[offer]);
      const outR = Number(beerPool.reserves[q.demandDenom]);
      const expected = ((outR * Number(amount)) / (inR + Number(amount))) * 0.995;
      expect(Math.abs(Number(q.received) - expected)).toBeLessThanOrEqual(1);
    }
  });

  it("builds an order price that passes the chain's slippage check, and fails below the minimum", () => {
    for (const offer of [HUAHUA, BEER]) {
      const q = quotePool(beerPool, offer, 50_000_000_000n, params);
      const minReceived = (q.received * 9_900n) / 10_000n;
      const price = orderPriceFor(q, minReceived, params);
      expect(passesSlippageCheck(q, price)).toBe(true);
      const worse = { ...q, outputDec: (q.outputDec * 9_800n) / 10_000n };
      expect(passesSlippageCheck(worse, price)).toBe(false);
    }
  });

  it("flags orders above 10% of the pool reserve", () => {
    const route = routeSwap([beerPool], params, HUAHUA, BEER, 4_000_000_000_000n, 100)!;
    expect(route.exceedsMaxOrder).toBe(true);
    expect(routeSwap([beerPool], params, HUAHUA, BEER, 1_000_000n, 100)!.exceedsMaxOrder).toBe(false);
  });

  it("routes token → token through HUAHUA in one atomic transaction", () => {
    const route = routeSwap([beerPool, tacosPool], params, BEER, TACOS, 10_000_000_000n, 100)!;
    expect(route.hops.map((h) => h.pool.id)).toEqual(["3", "2"]);
    const msgs = swapMsgs(route, SENDER, params);
    expect(msgs).toHaveLength(2);
    const [m1, m2] = msgs.map((m) => m.value as { offerCoin: { amount: string }; orderPrice: string });
    expect(BigInt(m2.offerCoin.amount)).toBe(route.hops[1].offerAmount);
    expect(BigInt(m2.offerCoin.amount)).toBeLessThanOrEqual(route.hops[0].received);
    expect(passesSlippageCheck(route.hops[0], BigInt(m1.orderPrice))).toBe(true);
    expect(passesSlippageCheck(route.hops[1], BigInt(m2.orderPrice))).toBe(true);
    expect(route.leftover!.amount).toBeGreaterThanOrEqual(0n);
  });
});
