import { makeSignDoc, serializeSignDoc } from "@cosmjs/amino";
import { fromUtf8 } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";
import { aminoTypes, registry, summarize } from "../cosmos/tx";
import { mixnetAction, NYM_MIXNET_CONTRACT, nymMsg } from "./mixnet";

const ADDR = "n1mx6adqr9ssyw3autnnhklrfyexk4gj7hztzp4a";

describe("NYM mixnet messages", () => {
  it("encode the contract's execute messages", () => {
    const d = nymMsg.delegate(ADDR, 5, 10_000_000n).value;
    expect(d.contract).toBe(NYM_MIXNET_CONTRACT);
    expect(JSON.parse(fromUtf8(d.msg))).toEqual({ delegate: { node_id: 5 } });
    expect(d.funds).toEqual([{ denom: "unym", amount: "10000000" }]);
    expect(JSON.parse(fromUtf8(nymMsg.undelegate(ADDR, 5).value.msg))).toEqual({ undelegate: { node_id: 5 } });
    expect(JSON.parse(fromUtf8(nymMsg.withdrawReward(ADDR, 5).value.msg))).toEqual({ withdraw_delegator_reward: { node_id: 5 } });
  });

  it("are summarized as staking actions on the confirm screen", () => {
    expect(summarize(nymMsg.delegate(ADDR, 7, 1n))).toMatchObject({ kind: "delegate", fields: { node: "#7" }, coins: [{ denom: "unym", amount: "1" }] });
    expect(summarize(nymMsg.undelegate(ADDR, 7))).toMatchObject({ kind: "undelegate", fields: { node: "#7" } });
    expect(summarize(nymMsg.withdrawReward(ADDR, 7))).toMatchObject({ kind: "claim", fields: { node: "#7" } });
  });

  it("are only recognized on the mixnet contract", () => {
    expect(mixnetAction("n1other", { delegate: { node_id: 1 } })).toBeUndefined();
    expect(mixnetAction(NYM_MIXNET_CONTRACT, { delegate: { node_id: "1" } })).toBeUndefined();
  });

  it("sign as amino JSON (Ledger) and round-trip to protobuf", () => {
    const m = nymMsg.delegate(ADDR, 5, 10_000_000n);
    const amino = aminoTypes.toAmino(m);
    const doc = makeSignDoc([amino], { amount: [{ denom: "unym", amount: "5000" }], gas: "200000" }, "nyx", "", 1, 2);
    expect(JSON.parse(fromUtf8(serializeSignDoc(doc))).msgs).toEqual([
      { type: "wasm/MsgExecuteContract", value: { contract: NYM_MIXNET_CONTRACT, funds: [{ amount: "10000000", denom: "unym" }], msg: { delegate: { node_id: 5 } }, sender: ADDR } },
    ]);
    const back = aminoTypes.fromAmino(amino);
    expect(registry.encode(back)).toEqual(registry.encode(m));
  });
});
