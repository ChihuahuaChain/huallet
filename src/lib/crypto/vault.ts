export const CURRENT_KDF_ITERATIONS = 600_000;

export interface KdfParams {
  name: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
}

export interface EncryptedVault {
  version: 1;
  kdf: KdfParams;
  cipher: { name: "AES-GCM";  iv: string };
  ciphertext: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super("Wrong password");
    this.name = "WrongPasswordError";
  }
}

const subtle = () => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto is not available. Huallet must be served over HTTPS (or localhost).");
  }
  return globalThis.crypto.subtle;
};

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(password: string, kdf: KdfParams, extractable = false): Promise<CryptoKey> {
  const baseKey = await subtle().importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle().deriveKey(
    { name: "PBKDF2", hash: kdf.hash, iterations: kdf.iterations, salt: fromBase64(kdf.salt) },
    baseKey,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await subtle().exportKey("raw", key)));
}

export async function importRawKey(b64: string): Promise<CryptoKey> {
  return subtle().importKey("raw", fromBase64(b64), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export function newKdfParams(): KdfParams {
  return {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: CURRENT_KDF_ITERATIONS,
    salt: toBase64(randomBytes(16)),
  };
}

export async function encryptWithKey(
  key: CryptoKey,
  kdf: KdfParams,
  plaintext: string,
): Promise<EncryptedVault> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return {
    version: 1,
    kdf,
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    ciphertext: toBase64(new Uint8Array(ct)),
  };
}

export async function decryptWithKey(key: CryptoKey, vault: EncryptedVault): Promise<string> {
  try {
    const pt = await subtle().decrypt(
      { name: "AES-GCM", iv: fromBase64(vault.cipher.iv) },
      key,
      fromBase64(vault.ciphertext),
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new WrongPasswordError();
  }
}

export async function encrypt(password: string, plaintext: string, extractable = false): Promise<{ vault: EncryptedVault; key: CryptoKey }> {
  const kdf = newKdfParams();
  const key = await deriveKey(password, kdf, extractable);
  return { vault: await encryptWithKey(key, kdf, plaintext), key };
}

export async function decrypt(password: string, vault: EncryptedVault, extractable = false): Promise<{ plaintext: string; key: CryptoKey }> {
  const key = await deriveKey(password, vault.kdf, extractable);
  return { plaintext: await decryptWithKey(key, vault), key };
}

export function needsRehash(vault: EncryptedVault): boolean {
  return vault.kdf.iterations < CURRENT_KDF_ITERATIONS;
}

export function isEncryptedVault(v: unknown): v is EncryptedVault {
  const x = v as EncryptedVault;
  return (
    !!x &&
    x.version === 1 &&
    x.kdf?.name === "PBKDF2" &&
    typeof x.kdf.salt === "string" &&
    typeof x.kdf.iterations === "number" &&
    x.cipher?.name === "AES-GCM" &&
    typeof x.cipher.iv === "string" &&
    typeof x.ciphertext === "string"
  );
}

export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (pw.length < 8) return 0;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (classes >= 3) score++;
  if (classes === 4 || pw.length >= 20) score++;
  if (/(.)\1{2,}/.test(pw) || /^(password|qwerty|123456|huahua|chihuahua)/i.test(pw)) score = Math.max(0, score - 2);
  return Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
}
