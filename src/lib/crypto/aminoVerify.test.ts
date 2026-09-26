import { Secp256k1HdWallet, type StdSignDoc } from "@cosmjs/amino";
import { toHex } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";
import { verifyAminoSignature } from "./aminoVerify";

const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("verifyAminoSignature", () => {
  it("accepts the right signer and rejects tampering", async () => {
    const w = await Secp256k1HdWallet.fromMnemonic(ABANDON, { prefix: "chihuahua" });
    const [acc] = await w.getAccounts();
    const doc: StdSignDoc = {
      chain_id: "chihuahua-1",
      account_number: "1",
      sequence: "0",
      fee: { amount: [{ denom: "uhuahua", amount: "1" }], gas: "200000" },
      msgs: [{ type: "cosmos-sdk/MsgSend", value: { from_address: acc.address, to_address: acc.address, amount: [] } }],
      memo: "",
    };
    const { signature } = await w.signAmino(acc.address, doc);
    const pub = toHex(acc.pubkey);
    expect(await verifyAminoSignature(pub, doc, signature)).toBe(true);
    expect(await verifyAminoSignature(pub, { ...doc, memo: "changed" }, signature)).toBe(false);
    expect(await verifyAminoSignature("02" + "11".repeat(32), doc, signature)).toBe(false);
  });
});
