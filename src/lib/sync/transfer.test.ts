import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { generateMnemonic } from "../keyring/keyring";
import { decodeQr } from "../qr";
import {
  base32Decode,
  base32Encode,
  createTransfer,
  decodeKeys,
  encodeKeys,
  FrameCollector,
  formatTransferCode,
  isValidTransferCode,
  newTransferCode,
  normalizeTransferCode,
  open,
  parseFrame,
  seal,
  toFrames,
  WrongTransferCodeError,
  type TransferKey,
} from "./transfer";

const keys: TransferKey[] = [
  { name: "Main", type: "mnemonic", secret: generateMnemonic(24), hdAccount: 0, hdIndex: 0, backedUp: true },
  { name: "Savings 🐶", type: "mnemonic", secret: generateMnemonic(12), hdAccount: 3, hdIndex: 200, backedUp: false },
  { name: "Hot key", type: "privateKey", secret: "4f".repeat(32), hdAccount: 0, hdIndex: 0, backedUp: true },
  { name: "Ledger", type: "ledger", secret: "02" + "ab".repeat(32), hdAccount: 1, hdIndex: 0, backedUp: true },
];

describe("transfer payload", () => {
  it("round-trips every account type", () => {
    expect(decodeKeys(encodeKeys(keys))).toEqual(keys);
  });

  it("stays compact: a 24-word phrase travels as 32 bytes", () => {
    const one = encodeKeys([keys[0]]);
    expect(one.length).toBeLessThan(2 + 4 + 1 + 4 + 1 + 32 + 1);
  });

  it("base32 round-trips arbitrary bytes", () => {
    for (const n of [0, 1, 4, 5, 31, 250]) {
      const b = globalThis.crypto.getRandomValues(new Uint8Array(n));
      expect(base32Decode(base32Encode(b))).toEqual(b);
    }
  });
});

describe("transfer code", () => {
  it("is 12 Crockford characters and tolerates how people retype it", () => {
    const code = newTransferCode();
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(isValidTransferCode(code)).toBe(true);
    expect(isValidTransferCode(code.toLowerCase().replace(/-/g, " "))).toBe(true);
    expect(normalizeTransferCode("o1il-0000-abcd")).toBe("0111" + "0000" + "ABCD");
    expect(formatTransferCode("0111 0000 abcd")).toBe("0111-0000-ABCD");
    expect(isValidTransferCode("0111-0000-ABC")).toBe(false);
    expect(isValidTransferCode("0111-0000-ABCU")).toBe(false);
  });
});

describe("transfer envelope", () => {
  it("opens with the right code, in any spelling", async () => {
    const code = newTransferCode();
    const env = await seal(keys, code);
    expect(await open(env, code.toLowerCase().replace(/-/g, ""))).toEqual(keys);
  });

  it("rejects a wrong code", async () => {
    const env = await seal(keys, newTransferCode());
    await expect(open(env, newTransferCode())).rejects.toBeInstanceOf(WrongTransferCodeError);
  });

  it("rejects a tampered envelope", async () => {
    const code = newTransferCode();
    const env = await seal(keys, code);
    env[env.length - 1] ^= 1;
    await expect(open(env, code)).rejects.toBeInstanceOf(WrongTransferCodeError);
  });
});

describe("transfer frames", () => {
  it("reassembles frames scanned in any order, with repeats", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...keys[0], name: `Account ${i}`, secret: generateMnemonic(24) }));
    const { code, frames } = await createTransfer(many);
    expect(frames.length).toBeGreaterThan(1);

    const c = new FrameCollector();
    const order = [...frames].reverse();
    expect(c.add(order[0])).toBe("new");
    expect(c.add(order[0])).toBe("seen");
    expect(c.add("cosmos:chihuahua1abc")).toBe("ignored");
    for (const f of order.slice(1)) c.add(f);
    expect(c.complete).toBe(true);
    expect(await open(c.envelope(), code)).toEqual(many);
  });

  it("starts over when frames from another transfer show up", async () => {
    const a = toFrames(await seal(keys, newTransferCode()));
    const b = toFrames(await seal(keys, newTransferCode()));
    const c = new FrameCollector();
    c.add(a[0]);
    c.add(b[0]);
    expect(c.received).toBe(1);
    expect(parseFrame(b[0])?.session).not.toBe(parseFrame(a[0])?.session);
  });

  it("frames are QR alphanumeric and read back through the camera decoder", async () => {
    const { frames } = await createTransfer(keys);
    for (const text of frames) {
      expect(text).toMatch(/^[0-9A-Z:]+$/);
      const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
      const scale = 4;
      const n = qr.modules.size + 8;
      const w = n * scale;
      const px = new Uint8ClampedArray(w * w * 4);
      for (let y = 0; y < w; y++)
        for (let x = 0; x < w; x++) {
          const mx = Math.floor(x / scale) - 4, my = Math.floor(y / scale) - 4;
          const on = mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(mx, my);
          const v = on ? 40 : 255;
          px.set([v, v, v, 255], (y * w + x) * 4);
        }
      expect(decodeQr(px, w, w)).toBe(text);
    }
  });
});
