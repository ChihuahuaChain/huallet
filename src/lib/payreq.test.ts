import { describe, expect, it } from "vitest";
import { buildPaymentUri, parsePaymentRequest } from "./payreq";

const ADDR = "chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h";

describe("payment requests", () => {
  it("round-trips a full request", () => {
    const uri = buildPaymentUri({ address: ADDR, amount: "12.5", denom: "uhuahua", memo: "coffee & cake", chainId: "chihuahua-1" });
    expect(uri.startsWith(`cosmos:${ADDR}?`)).toBe(true);
    expect(parsePaymentRequest(uri)).toEqual({ address: ADDR, prefix: "chihuahua", amount: "12.5", denom: "uhuahua", memo: "coffee & cake", chainId: "chihuahua-1" });
  });

  it("takes a bare address and other wallets' schemes", () => {
    expect(parsePaymentRequest(`  ${ADDR}\n`)?.address).toBe(ADDR);
    expect(parsePaymentRequest(`chihuahua:${ADDR}`)?.address).toBe(ADDR);
    expect(parsePaymentRequest(`https://wallet.example/send/${ADDR}?amount=3`)).toMatchObject({ address: ADDR, amount: "3" });
    expect(parsePaymentRequest(`https://wallet.example/send?to=${ADDR}`)?.address).toBe(ADDR);
  });

  it("rejects junk and ignores bad amounts", () => {
    expect(parsePaymentRequest("hello")).toBeNull();
    expect(parsePaymentRequest("chihuahua1qqqq")).toBeNull();
    expect(parsePaymentRequest(`cosmos:${ADDR}?amount=-1`)?.amount).toBeUndefined();
    expect(parsePaymentRequest(`cosmos:${ADDR}?amount=1e9`)?.amount).toBeUndefined();
  });
});
