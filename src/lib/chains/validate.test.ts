import { describe, expect, it } from "vitest";
import { BUILTIN_CHAINS } from "./builtin";
import { validateChainInfo } from "./validate";
import { checkAddress } from "../address";

describe("validateChainInfo", () => {
  it("accepts every builtin chain unchanged", () => {
    for (const c of BUILTIN_CHAINS) expect(validateChainInfo(c).chainId).toBe(c.chainId);
  });
  it("rejects insecure or malformed configs", () => {
    const base = BUILTIN_CHAINS[0];
    expect(() => validateChainInfo({ ...base, rpc: "http://evil.example" })).toThrow(/RPC/);
    expect(() => validateChainInfo({ ...base, rest: "javascript:alert(1)" })).toThrow(/REST/);
    expect(() => validateChainInfo({ ...base, chainId: "bad id" })).toThrow(/chainId/);
    expect(() => validateChainInfo({ ...base, chainSymbolImageUrl: "http://x/y.png" })).toThrow();
    expect(() => validateChainInfo({ ...base, currencies: [{ ...base.currencies[0], coinDecimals: 99 }] })).toThrow();
  });
  it("drops unsafe explorer templates", () => {
    expect(validateChainInfo({ ...BUILTIN_CHAINS[0], txExplorer: "javascript:${txHash}" }).txExplorer).toBeUndefined();
  });
});

describe("checkAddress", () => {
  it("detects addresses from other chains", () => {
    const chihuahua = BUILTIN_CHAINS[0];
    const r = checkAddress("cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4", chihuahua, BUILTIN_CHAINS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.otherChain?.chainId).toBe("cosmoshub-4");
    expect(checkAddress("cosmos1notvalid", chihuahua).ok).toBe(false);
  });
});
