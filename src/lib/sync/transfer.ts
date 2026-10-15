// Moving accounts from one Huallet to another through an animated QR code.
//
// The sender encodes its accounts compactly (a recovery phrase travels as its
// BIP-39 entropy), encrypts them with a one-time transfer code and splits the
// result into QR frames that loop on screen. The receiver scans the frames in
// any order, then decrypts with the code the sender shows next to (never
// inside) the QR. A photo of the QR alone is useless without the code.
//
// Envelope:  version(1) | salt(16) | iv(12) | AES-256-GCM(payload)
//            key = PBKDF2-SHA256(code, salt, TRANSFER_KDF_ITERATIONS)
// Payload:   version(1) | count(1) | key*
// Key:       type(1) | flags(1) | hdAccount(varint) | hdIndex(varint)
//            | nameLen(1) | name(utf8) | secretLen(1) | secret
// Frame:     HX1:<session>:<index>:<total>:<base32 chunk>   (1-based index)
//
// Frames use only QR alphanumeric-mode characters (A-Z, 2-7, digits, ':'),
// which pack about 20% denser than byte mode.

import { Bip39, EnglishMnemonic } from "@cosmjs/crypto";
import { fromHex, toHex } from "@cosmjs/encoding";
import type { KeyType, NewKey } from "../keyring/keyring";

export const TRANSFER_KDF_ITERATIONS = 600_000;
const ENVELOPE_VERSION = 1;
const PAYLOAD_VERSION = 1;
const FRAME_PREFIX = "HX1";
/** Base32 characters per frame (~250 bytes): dense enough to be quick, sparse enough to read off a screen. */
const FRAME_CHARS = 400;
const MAX_FRAMES = 64;
const AAD = new TextEncoder().encode("huallet-transfer-v1");

/** An account as it travels: everything needed to recreate it, nothing device-specific. */
export interface TransferKey {
  name: string;
  type: KeyType;
  secret: string;
  hdAccount: number;
  hdIndex: number;
  backedUp: boolean;
}

export class WrongTransferCodeError extends Error {
  constructor() {
    super("Wrong transfer code");
    this.name = "WrongTransferCodeError";
  }
}

export class InvalidTransferError extends Error {
  constructor(message = "This QR code is not a Huallet account transfer") {
    super(message);
    this.name = "InvalidTransferError";
  }
}

// ---------------------------------------------------------------- base32

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buf = 0;
  let bits = 0;
  for (const b of bytes) {
    buf = (buf << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(buf >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(buf << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new InvalidTransferError();
    buf = ((buf << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((buf >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------- transfer code

// Crockford base32: no I, L, O, U, so the code survives being read aloud or retyped.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 12; // 60 bits

/** A fresh one-time transfer code, e.g. "7KQ2-M9XD-R4TB". */
export function newTransferCode(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b & 31];
  return formatTransferCode(code);
}

/** Uppercase, separators dropped, and the look-alikes Crockford folds (O→0, I/L→1). */
export function normalizeTransferCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function formatTransferCode(code: string): string {
  const c = normalizeTransferCode(code);
  return c.match(/.{1,4}/g)?.join("-") ?? c;
}

export function isValidTransferCode(input: string): boolean {
  const c = normalizeTransferCode(input);
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

// ---------------------------------------------------------------- payload

const TYPES: KeyType[] = ["mnemonic", "privateKey", "ledger"];

function writeVarint(out: number[], n: number) {
  do {
    let byte = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
}

function secretBytes(k: TransferKey): Uint8Array {
  if (k.type === "mnemonic") return Bip39.decode(new EnglishMnemonic(k.secret));
  return fromHex(k.secret.replace(/^0x/i, ""));
}

function secretString(type: KeyType, bytes: Uint8Array): string {
  if (type === "mnemonic") return Bip39.encode(bytes).toString();
  return toHex(bytes);
}

export function encodeKeys(keys: TransferKey[]): Uint8Array {
  if (keys.length === 0 || keys.length > 255) throw new Error("Between 1 and 255 accounts can be transferred at once");
  const out: number[] = [PAYLOAD_VERSION, keys.length];
  for (const k of keys) {
    const type = TYPES.indexOf(k.type);
    if (type < 0) throw new Error(`Unknown account type: ${k.type}`);
    out.push(type, k.backedUp ? 1 : 0);
    writeVarint(out, k.hdAccount);
    writeVarint(out, k.hdIndex);
    const name = new TextEncoder().encode(k.name.slice(0, 40)).slice(0, 255);
    out.push(name.length, ...name);
    const secret = secretBytes(k);
    out.push(secret.length, ...secret);
  }
  return Uint8Array.from(out);
}

export function decodeKeys(bytes: Uint8Array): TransferKey[] {
  let p = 0;
  const byte = () => {
    if (p >= bytes.length) throw new InvalidTransferError("The transfer is truncated");
    return bytes[p++];
  };
  const varint = () => {
    let n = 0;
    let mul = 1;
    for (let i = 0; i < 5; i++) {
      const b = byte();
      n += (b & 0x7f) * mul;
      if (!(b & 0x80)) return n;
      mul *= 128;
    }
    throw new InvalidTransferError();
  };
  const take = (len: number) => {
    if (p + len > bytes.length) throw new InvalidTransferError("The transfer is truncated");
    const s = bytes.slice(p, p + len);
    p += len;
    return s;
  };

  if (byte() !== PAYLOAD_VERSION) throw new InvalidTransferError("This transfer comes from a newer Huallet. Update the app and try again.");
  const count = byte();
  const keys: TransferKey[] = [];
  for (let i = 0; i < count; i++) {
    const type = TYPES[byte()];
    if (!type) throw new InvalidTransferError();
    const flags = byte();
    const hdAccount = varint();
    const hdIndex = varint();
    const name = new TextDecoder().decode(take(byte()));
    const secret = secretString(type, take(byte()));
    keys.push({ name, type, secret, hdAccount, hdIndex, backedUp: (flags & 1) === 1 });
  }
  if (p !== bytes.length) throw new InvalidTransferError();
  return keys;
}

// ---------------------------------------------------------------- envelope

async function transferKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey("raw", new TextEncoder().encode(normalizeTransferCode(code)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: TRANSFER_KDF_ITERATIONS, salt: salt as BufferSource },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(keys: TransferKey[], code: string): Promise<Uint8Array> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await transferKey(code, salt);
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, encodeKeys(keys) as BufferSource),
  );
  const out = new Uint8Array(1 + 16 + 12 + ct.length);
  out[0] = ENVELOPE_VERSION;
  out.set(salt, 1);
  out.set(iv, 17);
  out.set(ct, 29);
  return out;
}

export async function open(envelope: Uint8Array, code: string): Promise<TransferKey[]> {
  if (envelope.length < 29 + 16 || envelope[0] !== ENVELOPE_VERSION) throw new InvalidTransferError();
  const key = await transferKey(code, envelope.slice(1, 17));
  let plain: ArrayBuffer;
  try {
    plain = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.slice(17, 29), additionalData: AAD },
      key,
      envelope.slice(29) as BufferSource,
    );
  } catch {
    throw new WrongTransferCodeError();
  }
  return decodeKeys(new Uint8Array(plain));
}

// ---------------------------------------------------------------- frames

function newSessionId(): string {
  return base32Encode(globalThis.crypto.getRandomValues(new Uint8Array(3))).slice(0, 4);
}

export function toFrames(envelope: Uint8Array): string[] {
  const data = base32Encode(envelope);
  const total = Math.ceil(data.length / FRAME_CHARS);
  if (total > MAX_FRAMES) throw new Error("Too many accounts for one transfer");
  const session = newSessionId();
  const frames: string[] = [];
  for (let i = 0; i < total; i++) {
    frames.push(`${FRAME_PREFIX}:${session}:${i + 1}:${total}:${data.slice(i * FRAME_CHARS, (i + 1) * FRAME_CHARS)}`);
  }
  return frames;
}

export interface Frame {
  session: string;
  index: number;
  total: number;
  data: string;
}

export function parseFrame(text: string): Frame | null {
  const m = /^HX1:([A-Z2-7]{4}):(\d{1,2}):(\d{1,2}):([A-Z2-7]+)$/.exec(text.trim());
  if (!m) return null;
  const index = Number(m[2]);
  const total = Number(m[3]);
  if (total < 1 || total > MAX_FRAMES || index < 1 || index > total) return null;
  return { session: m[1], index, total, data: m[4] };
}

export function isTransferFrame(text: string): boolean {
  return parseFrame(text) !== null;
}

/** Collects frames in any order. A frame from another transfer starts over. */
export class FrameCollector {
  private session = "";
  private total = 0;
  private parts = new Map<number, string>();

  /** "new" for a frame not seen before, "seen" for a repeat, "ignored" for anything else. */
  add(text: string): "new" | "seen" | "ignored" {
    const f = parseFrame(text);
    if (!f) return "ignored";
    if (f.session !== this.session || f.total !== this.total) {
      this.session = f.session;
      this.total = f.total;
      this.parts.clear();
    }
    if (this.parts.has(f.index)) return "seen";
    this.parts.set(f.index, f.data);
    return "new";
  }

  get received(): number {
    return this.parts.size;
  }

  /** Whether frame `index` (1-based) is in, for a per-frame progress bar. */
  has(index: number): boolean {
    return this.parts.has(index);
  }

  get expected(): number {
    return this.total;
  }

  get complete(): boolean {
    return this.total > 0 && this.parts.size === this.total;
  }

  /** The reassembled envelope; only once complete. */
  envelope(): Uint8Array {
    if (!this.complete) throw new InvalidTransferError("The transfer is incomplete");
    let data = "";
    for (let i = 1; i <= this.total; i++) data += this.parts.get(i);
    return base32Decode(data);
  }
}

/** Everything the sender needs: encrypt, pick a code, split into frames. */
export async function createTransfer(keys: TransferKey[]): Promise<{ code: string; frames: string[] }> {
  const code = newTransferCode();
  return { code, frames: toFrames(await seal(keys, code)) };
}

/** NewKey list for the keyring, from what came over. */
export function toNewKeys(keys: TransferKey[]): NewKey[] {
  return keys.map((k) => ({ name: k.name, type: k.type, secret: k.secret, hdAccount: k.hdAccount, hdIndex: k.hdIndex, backedUp: k.backedUp }));
}
