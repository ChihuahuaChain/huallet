import { describe, expect, it } from "vitest";
import { formatAmount, fromBaseUnits, toBaseUnits } from "./format";
import { computeFee } from "./cosmos/tx";
import { BUILTIN_CHAINS } from "./chains/builtin";

describe("amounts", () => {
  it("converts exactly", () => {
    expect(toBaseUnits("1.5", 6)).toBe(1_500_000n);
    expect(toBaseUnits("0,000001", 6)).toBe(1n);
    expect(toBaseUnits("123", 0)).toBe(123n);
    expect(() => toBaseUnits("1.0000001", 6)).toThrow();
    expect(() => toBaseUnits("abc", 6)).toThrow();
    expect(fromBaseUnits(1_500_000n, 6)).toBe("1.5");
    expect(fromBaseUnits(1n, 18)).toBe("0.000000000000000001");
  });
  it("formats for display", () => {
    expect(formatAmount(1_234_567_890_000n, 6, { locale: "en-US" })).toBe("1,234,567.89");
    expect(formatAmount(1n, 6, { locale: "en-US" })).toBe("0.000001");
    expect(formatAmount(1n, 18, { locale: "en-US" })).toBe("< 0.000001");
  });
  it("computes fees with ceiling", () => {
    const huahua = BUILTIN_CHAINS[0].feeCurrencies[0];
    expect(computeFee(huahua, "average", 200_000).amount[0]).toEqual({ denom: "uhuahua", amount: "250000000" });
    const atom = BUILTIN_CHAINS[1].feeCurrencies[0];
    expect(computeFee(atom, "average", 100_001).amount[0].amount).toBe("2501");
  });
});
