import { toUtf8 } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";
import { msgsToJson, summarize } from "./tx";

const execute = (msg: Uint8Array, funds: Array<{ denom: string; amount: string }> = []) => ({
  typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
  value: { sender: "chihuahua1sender", contract: "chihuahua1contract", msg, funds },
});

describe("summarize MsgExecuteContract", () => {
  it("shows a generic execute as a contract call, not an unknown message", () => {
    const s = summarize(execute(toUtf8('{"claim":{"epochs":[151]}}')));
    expect(s.kind).toBe("contract-execute");
    expect(s.fields).toEqual({ contract: "chihuahua1contract", msg: '{"claim":{"epochs":[151]}}' });
    expect(s.coins).toBeUndefined();
  });

  it("lists the funds sent with the call", () => {
    const s = summarize(execute(toUtf8('{"bet":{"side":"up"}}'), [{ denom: "uhuahua", amount: "5" }]));
    expect(s.kind).toBe("contract-execute");
    expect(s.coins).toEqual([{ denom: "uhuahua", amount: "5" }]);
  });

  it("falls back to unknown when the message is not JSON", () => {
    const m = execute(new Uint8Array([0xff, 0x00, 0x01]));
    expect(summarize(m).kind).toBe("unknown");
    expect(() => msgsToJson([m])).not.toThrow();
  });
});
