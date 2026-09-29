import "@/extension/popup/polyfills";
import { makeSignDoc, rawSecp256k1PubkeyToRawAddress, Secp256k1HdWallet, serializeSignDoc } from "@cosmjs/amino";
import { Bip39, EnglishMnemonic, Secp256k1, Secp256k1Signature, sha256, Slip10, Slip10Curve, stringToPath } from "@cosmjs/crypto";
import { toBech32, toHex } from "@cosmjs/encoding";
import { LedgerSigner } from "@cosmjs/ledger-amino";
import { describe, expect, it } from "vitest";
import { bleFrames, hidFrames, Reassembler } from "@/lib/ledger/framing";
import type { LedgerDevice, LedgerNative } from "@/lib/native";
import { NativeLedgerTransport } from "./nativeTransport";

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OK = [0x90, 0x00];

/** A Ledger running the Cosmos app, behind the same raw I/O the Android plugin provides. */
class VirtualLedger implements LedgerNative {
  readonly apdus: string[] = [];
  private out: Uint8Array[] = [];
  private inbox: Reassembler;
  private signing: number[] = [];
  private signPath = "";

  constructor(
    private readonly transport: "usb" | "ble",
    private readonly seed: Uint8Array,
    private readonly mtu = 128,
  ) {
    this.inbox = new Reassembler(transport === "usb" ? "hid" : "ble");
  }

  async list(): Promise<LedgerDevice[]> {
    return [{ id: `${this.transport}:virtual`, name: "Virtual Nano X", transport: this.transport }];
  }
  async open(id: string): Promise<LedgerDevice> {
    return { id, name: "Virtual Nano X", transport: this.transport };
  }
  async close() {}

  async write(data: Uint8Array) {
    if (this.transport === "ble" && data.length === 5 && data[0] === 0x08) {
      this.out.push(new Uint8Array([0x08, 0, 0, 0, 1, this.mtu]));
      return;
    }
    if (this.transport === "usb") expect(data.length).toBe(64);
    else expect(data.length).toBeLessThanOrEqual(this.mtu);
    const apdu = this.inbox.push(data);
    if (!apdu) return;
    this.inbox = new Reassembler(this.transport === "usb" ? "hid" : "ble");
    this.apdus.push(toHex(apdu.subarray(0, 2)));
    const response = new Uint8Array(await this.handle(apdu));
    this.out.push(...(this.transport === "usb" ? hidFrames(response) : bleFrames(response, this.mtu)));
  }

  async read(): Promise<Uint8Array> {
    const f = this.out.shift();
    if (!f) throw new Error("Timed out waiting for the Ledger.");
    return f;
  }

  private keyFor(path: number[]) {
    const p = path.map((n) => (n >= 0x80000000 ? `${n - 0x80000000}'` : `${n}`)).join("/");
    return Slip10.derivePath(Slip10Curve.Secp256k1, this.seed, stringToPath(`m/${p}`)).privkey;
  }

  private async handle(apdu: Uint8Array): Promise<number[]> {
    const [cla, ins, p1] = apdu;
    const data = apdu.subarray(5, 5 + apdu[4]);
    if (cla === 0xb0 && ins === 0x01) {
      const name = [..."Cosmos"].map((c) => c.charCodeAt(0));
      const ver = [..."2.38.0"].map((c) => c.charCodeAt(0));
      return [1, name.length, ...name, ver.length, ...ver, 1, 0x80, ...OK];
    }
    if (cla === 0x55 && ins === 0x00) return [0, 2, 38, 0, 0, ...OK];
    const readPath = (b: Uint8Array) => Array.from({ length: 5 }, (_, i) => new DataView(b.buffer, b.byteOffset + i * 4, 4).getUint32(0, true));
    if (cla === 0x55 && ins === 0x04) {
      const hrp = new TextDecoder().decode(data.subarray(1, 1 + data[0]));
      const priv = this.keyFor(readPath(data.subarray(1 + data[0])));
      const pub = Secp256k1.compressPubkey((await Secp256k1.makeKeypair(priv)).pubkey);
      const addr = toBech32(hrp, rawSecp256k1PubkeyToRawAddress(pub));
      return [...pub, ...new TextEncoder().encode(addr), ...OK];
    }
    if (cla === 0x55 && ins === 0x02) {
      if (p1 === 0) {
        this.signing = [];
        this.signPath = JSON.stringify(readPath(data));
        return OK;
      }
      this.signing.push(...data);
      if (p1 === 1) return OK;
      const priv = this.keyFor(JSON.parse(this.signPath));
      const sig = await Secp256k1.createSignature(sha256(new Uint8Array(this.signing)), priv);
      return [...new Secp256k1Signature(sig.r(32), sig.s(32)).toDer(), ...OK];
    }
    return [0x6d, 0x00];
  }
}

describe.each(["usb", "ble"] as const)("Ledger over %s (Android native transport)", (kind) => {
  it("reads the key and signs exactly like the software wallet with the same seed", async () => {
    const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(MNEMONIC));
    const device = new VirtualLedger(kind, seed, 100);
    const transport = await NativeLedgerTransport.connect(device, `${kind}:virtual`);
    const signer = new LedgerSigner(transport, { hdPaths: [stringToPath("m/44'/118'/0'/0/0")], prefix: "chihuahua", testModeAllowed: false });
    const software = await Secp256k1HdWallet.fromMnemonic(MNEMONIC, { prefix: "chihuahua" });
    const [expected] = await software.getAccounts();

    const [acc] = await signer.getAccounts();
    expect(acc.address).toBe(expected.address);
    expect(toHex(acc.pubkey)).toBe(toHex(expected.pubkey));

    const doc = makeSignDoc(
      [{ type: "cosmos-sdk/MsgSend", value: { from_address: acc.address, to_address: acc.address, amount: [{ denom: "uhuahua", amount: "1" }] } }],
      { amount: [{ denom: "uhuahua", amount: "250000000" }], gas: "200000" },
      "chihuahua-1",
      "memo long enough to need several chunks and frames ".repeat(12),
      "1",
      "0",
    );
    expect(serializeSignDoc(doc).length).toBeGreaterThan(500);
    const viaLedger = await signer.signAmino(acc.address, doc);
    const viaSoftware = await software.signAmino(acc.address, doc);
    expect(viaLedger.signature.signature).toBe(viaSoftware.signature.signature);
    expect(device.apdus.filter((a) => a === "5502").length).toBeGreaterThan(2);
  });
});
