import { toHex } from "@cosmjs/encoding";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import ledgerHidFraming from "../../../node_modules/@ledgerhq/hw-transport-webhid/lib-es/hid-framing.js";
import { bleFrames, hidFrames, parseBleMtu, Reassembler } from "./framing";

const apdu = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);

describe("USB HID framing", () => {
  it.each([0, 5, 57, 58, 59, 120, 255, 600])("matches Ledger's own framing for a %i-byte APDU", (n) => {
    const data = apdu(n);
    const ref = ledgerHidFraming(0x0101, 64).makeBlocks(Buffer.from(data)).map((b: Uint8Array) => toHex(b));
    expect(hidFrames(data).map(toHex)).toEqual(ref);
  });

  it.each([2, 58, 300])("reassembles a %i-byte response like Ledger does", (n) => {
    const data = apdu(n);
    const blocks = ledgerHidFraming(0x0101, 64).makeBlocks(Buffer.from(data));
    const r = new Reassembler("hid");
    let out: Uint8Array | null = null;
    for (const b of blocks) out = r.push(new Uint8Array(b));
    expect(toHex(out!)).toBe(toHex(data));
  });

  it("rejects frames from another channel or out of order", () => {
    const [first, second] = hidFrames(apdu(100));
    expect(() => new Reassembler("hid", 0x0202).push(first)).toThrow(/channel/);
    expect(() => new Reassembler("hid").push(second)).toThrow(/out of order/);
  });
});

describe("Bluetooth framing", () => {
  it("splits by MTU: 5-byte header first, then 3-byte headers", () => {
    const f = bleFrames(apdu(40), 20);
    expect(f.map((x) => x.length)).toEqual([20, 20, 11]);
    expect(toHex(f[0].subarray(0, 5))).toBe("0500000028");
    expect(toHex(f[1].subarray(0, 3))).toBe("050001");
    expect(toHex(f[2].subarray(0, 3))).toBe("050002");
  });

  it("round-trips through the reassembler", () => {
    const data = apdu(500);
    const r = new Reassembler("ble");
    let out: Uint8Array | null = null;
    for (const fr of bleFrames(data, 153)) out = r.push(fr);
    expect(toHex(out!)).toBe(toHex(data));
  });

  it("reads the device MTU answer", () => {
    expect(parseBleMtu(new Uint8Array([0x08, 0, 0, 0, 1, 153]))).toBe(153);
    expect(parseBleMtu(new Uint8Array([0x05, 0, 0]))).toBeNull();
  });
});
