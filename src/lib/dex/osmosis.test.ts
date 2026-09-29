import { fromHex, toHex } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";
import { aminoTypes, registry, summarize } from "../cosmos/tx";
import { SPLIT_SWAP_EXACT_IN_TYPE_URL, SWAP_EXACT_IN_TYPE_URL } from "./msgOsmosis";
import { minOut, osmosisSwapMsg, parseSqsQuote } from "./osmosis";

// Messages taken from Osmosis mainnet transactions (tx body bytes and the chain's JSON of the same message).
const SINGLE_HEX = "0a2b6f736d6f31307a3564676d757236656e346d7a6b356b75383063733037727773717a6c7574647a7a73676e124908b00f12446962632f31414546313435433534394434463938343743373945343937313042313938433239344337463441313037463436313044454538453732354646433442333738124908a51b12446962632f41384341354545333238464131304339353139444636303537444131463639363832443238463744304635434343374543423732453344434132443135374134120a08a6061205756f736d6f1a110a05756f736d6f1208313631313731383822083136323039333135";
const SINGLE_JSON = {"@type":"/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn","sender":"osmo10z5dgmur6en4mzk5ku80cs07rwsqzlutdzzsgn","routes":[{"pool_id":"1968","token_out_denom":"ibc/1AEF145C549D4F9847C79E49710B198C294C7F4A107F4610DEE8E725FFC4B378"},{"pool_id":"3493","token_out_denom":"ibc/A8CA5EE328FA10C9519DF6057DA1F69682D28F7D0F5CCC7ECB72E3DCA2D157A4"},{"pool_id":"806","token_out_denom":"uosmo"}],"token_in":{"denom":"uosmo","amount":"16117188"},"token_out_min_amount":"16209315"};
const SPLIT_HEX = "0a2b6f736d6f3132666563377a6b64343774716c7a7870763768326a78687474646e387161786a326a6161333212560a4908a60612446962632f41384341354545333238464131304339353139444636303537444131463639363832443238463744304635434343374543423732453344434132443135374134120936373530303030303012550a4908ca0812446962632f41384341354545333238464131304339353139444636303537444131463639363832443238463744304635434343374543423732453344434132443135374134120837353030303030301a05756f736d6f220a32353339313233313031";
const SPLIT_JSON = {"@type":"/osmosis.poolmanager.v1beta1.MsgSplitRouteSwapExactAmountIn","sender":"osmo12fec7zkd47tqlzxpv7h2jxhttdn8qaxj2jaa32","routes":[{"pools":[{"pool_id":"806","token_out_denom":"ibc/A8CA5EE328FA10C9519DF6057DA1F69682D28F7D0F5CCC7ECB72E3DCA2D157A4"}],"token_in_amount":"675000000"},{"pools":[{"pool_id":"1098","token_out_denom":"ibc/A8CA5EE328FA10C9519DF6057DA1F69682D28F7D0F5CCC7ECB72E3DCA2D157A4"}],"token_in_amount":"75000000"}],"token_in_denom":"uosmo","token_out_min_amount":"2539123101"};

const ATOM = "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
const SENDER = "osmo1cyyzpxplxdzkeea7kwsydadg87357qnahakaks";

describe("Osmosis pool manager messages", () => {
  it("decodes and re-encodes a mainnet MsgSwapExactAmountIn byte for byte", () => {
    const value = registry.decode({ typeUrl: SWAP_EXACT_IN_TYPE_URL, value: fromHex(SINGLE_HEX) });
    expect(value.sender).toBe(SINGLE_JSON.sender);
    expect(value.tokenIn).toEqual(SINGLE_JSON.token_in);
    expect(value.tokenOutMinAmount).toBe(SINGLE_JSON.token_out_min_amount);
    expect(value.routes.map((r: { poolId: bigint; tokenOutDenom: string }) => ({ pool_id: r.poolId.toString(), token_out_denom: r.tokenOutDenom }))).toEqual(SINGLE_JSON.routes);
    expect(toHex(registry.encode({ typeUrl: SWAP_EXACT_IN_TYPE_URL, value }))).toBe(SINGLE_HEX);
  });

  it("decodes and re-encodes a mainnet MsgSplitRouteSwapExactAmountIn byte for byte", () => {
    const value = registry.decode({ typeUrl: SPLIT_SWAP_EXACT_IN_TYPE_URL, value: fromHex(SPLIT_HEX) });
    expect(value.sender).toBe(SPLIT_JSON.sender);
    expect(value.tokenInDenom).toBe(SPLIT_JSON.token_in_denom);
    expect(value.tokenOutMinAmount).toBe(SPLIT_JSON.token_out_min_amount);
    expect(
      value.routes.map((r: { pools: Array<{ poolId: bigint; tokenOutDenom: string }>; tokenInAmount: string }) => ({
        pools: r.pools.map((p) => ({ pool_id: p.poolId.toString(), token_out_denom: p.tokenOutDenom })),
        token_in_amount: r.tokenInAmount,
      })),
    ).toEqual(SPLIT_JSON.routes);
    expect(toHex(registry.encode({ typeUrl: SPLIT_SWAP_EXACT_IN_TYPE_URL, value }))).toBe(SPLIT_HEX);
  });

  it("produces the chain's amino JSON (Ledger signing) and reads it back", () => {
    for (const [typeUrl, hex, json, aminoType] of [
      [SWAP_EXACT_IN_TYPE_URL, SINGLE_HEX, SINGLE_JSON, "osmosis/poolmanager/swap-exact-amount-in"],
      [SPLIT_SWAP_EXACT_IN_TYPE_URL, SPLIT_HEX, SPLIT_JSON, "osmosis/poolmanager/split-amount-in"],
    ] as const) {
      const value = registry.decode({ typeUrl, value: fromHex(hex) });
      const amino = aminoTypes.toAmino({ typeUrl, value });
      const { "@type": _, ...fields } = json;
      expect(amino).toEqual({ type: aminoType, value: fields });
      expect(toHex(registry.encode(aminoTypes.fromAmino(amino)))).toBe(hex);
    }
  });

  it("summarizes swaps for the review screen", () => {
    const single = summarize({ typeUrl: SWAP_EXACT_IN_TYPE_URL, value: registry.decode({ typeUrl: SWAP_EXACT_IN_TYPE_URL, value: fromHex(SINGLE_HEX) }) });
    expect(single.kind).toBe("swap");
    expect(single.coins).toEqual([SINGLE_JSON.token_in]);
    expect(single.fields.receive).toBe(SINGLE_JSON.routes[SINGLE_JSON.routes.length - 1].token_out_denom);
    expect(single.fields.minReceived).toBe(SINGLE_JSON.token_out_min_amount);

    const split = summarize({ typeUrl: SPLIT_SWAP_EXACT_IN_TYPE_URL, value: registry.decode({ typeUrl: SPLIT_SWAP_EXACT_IN_TYPE_URL, value: fromHex(SPLIT_HEX) }) });
    const total = SPLIT_JSON.routes.reduce((s: bigint, r: { token_in_amount: string }) => s + BigInt(r.token_in_amount), 0n);
    expect(split.kind).toBe("swap");
    expect(split.coins).toEqual([{ denom: SPLIT_JSON.token_in_denom, amount: total.toString() }]);
  });
});

describe("Osmosis router quotes", () => {
  const sqs = {
    amount_in: { denom: "uosmo", amount: "1000000" },
    amount_out: "21290",
    route: [{ pools: [{ id: 1135, token_out_denom: ATOM }], in_amount: "1000000", out_amount: "21290" }],
    price_impact: "-0.002014591903672756",
    effective_fee: "0.008000000000000000",
  };

  it("builds a single-route swap with the slippage floor", () => {
    const q = parseSqsQuote(sqs, "uosmo", 1_000_000n, ATOM);
    expect(q.priceImpact).toBeCloseTo(0.002015, 5);
    expect(minOut(q, 100)).toBe(21077n);
    const msg = osmosisSwapMsg(q, SENDER, 100);
    expect(msg.typeUrl).toBe(SWAP_EXACT_IN_TYPE_URL);
    expect(msg.value).toEqual({
      sender: SENDER,
      routes: [{ poolId: 1135n, tokenOutDenom: ATOM }],
      tokenIn: { denom: "uosmo", amount: "1000000" },
      tokenOutMinAmount: "21077",
    });
  });

  it("builds a split-route swap when the router splits the input", () => {
    const split = {
      ...sqs,
      route: [
        { pools: [{ id: 1135, token_out_denom: ATOM }], in_amount: "600000", out_amount: "12800" },
        { pools: [{ id: 1, token_out_denom: ATOM }], in_amount: "400000", out_amount: "8490" },
      ],
    };
    const msg = osmosisSwapMsg(parseSqsQuote(split, "uosmo", 1_000_000n, ATOM), SENDER, 50);
    expect(msg.typeUrl).toBe(SPLIT_SWAP_EXACT_IN_TYPE_URL);
    expect(msg.value).toEqual({
      sender: SENDER,
      routes: [
        { pools: [{ poolId: 1135n, tokenOutDenom: ATOM }], tokenInAmount: "600000" },
        { pools: [{ poolId: 1n, tokenOutDenom: ATOM }], tokenInAmount: "400000" },
      ],
      tokenInDenom: "uosmo",
      tokenOutMinAmount: "21183",
    });
  });

  it("gives the rounding remainder of a split to the first route", () => {
    const split = {
      ...sqs,
      amount_in: { denom: "uosmo", amount: "1949773161" },
      route: [
        { pools: [{ id: 1135, token_out_denom: ATOM }], in_amount: "1754795844", out_amount: "37341638" },
        { pools: [{ id: 1, token_out_denom: ATOM }], in_amount: "194977316", out_amount: "4147809" },
      ],
    };
    const q = parseSqsQuote(split, "uosmo", 1_949_773_161n, ATOM);
    expect(q.routes.map((r) => r.inAmount)).toEqual([1_754_795_845n, 194_977_316n]);
  });

  it("rejects router answers that do not match the request", () => {
    expect(() => parseSqsQuote(sqs, "uosmo", 2_000_000n, ATOM)).toThrow(/different input/);
    expect(() => parseSqsQuote(sqs, "uosmo", 1_000_000n, "uion")).toThrow(/different token/);
    expect(() => parseSqsQuote({ ...sqs, route: [{ ...sqs.route[0], in_amount: "900000" }] }, "uosmo", 1_000_000n, ATOM)).toThrow(/add up/);
  });
});
