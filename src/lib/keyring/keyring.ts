import { rawSecp256k1PubkeyToRawAddress, Secp256k1HdWallet, Secp256k1Wallet, type OfflineAminoSigner } from "@cosmjs/amino";
import { Bip39, EnglishMnemonic, Random, stringToPath } from "@cosmjs/crypto";
import { fromBech32, fromHex, toBech32, toHex } from "@cosmjs/encoding";
import {
  DirectEthSecp256k1HdWallet,
  DirectEthSecp256k1Wallet,
  DirectSecp256k1HdWallet,
  DirectSecp256k1Wallet,
  type AccountData,
  type OfflineDirectSigner,
} from "@cosmjs/proto-signing";
import { keyAlgoOf, type ChainInfo } from "../chains/types";
import {
  decrypt,
  decryptWithKey,
  deriveKey,
  encrypt,
  encryptWithKey,
  exportRawKey,
  importRawKey,
  isEncryptedVault,
  needsRehash,
  WrongPasswordError,
  type EncryptedVault,
  type KdfParams,
} from "../crypto/vault";
import type { KV } from "../kv";

export type KeyType = "mnemonic" | "privateKey" | "ledger";

export interface KeyMeta {
  id: string;
  name: string;
  type: KeyType;
  hdAccount: number;
  hdIndex: number;
  createdAt: number;
  backedUp: boolean;
}

interface StoredKey extends KeyMeta {
  secret: string;
}

interface VaultPlaintext {
  keys: StoredKey[];
}

interface SessionState {
  keys: StoredKey[];
  kdf: KdfParams;
  aesKey: string;
}

export interface NewKey {
  name: string;
  type: KeyType;
  secret: string;
  hdAccount?: number;
  hdIndex?: number;
  backedUp?: boolean;
}

export interface KeyringStatus {
  hasVault: boolean;
  unlocked: boolean;
  keys: KeyMeta[];
}

const VAULT_KEY = "vault";
const THROTTLE_KEY = "unlock-throttle";
const SESSION_KEY = "session";

export class KeyringLockedError extends Error {
  constructor() {
    super("Wallet is locked");
    this.name = "KeyringLockedError";
  }
}

export class LedgerKeyError extends Error {
  constructor(message = "This is a Ledger account: sign on the device") {
    super(message);
    this.name = "LedgerKeyError";
  }
}

export const LEDGER_COIN_TYPE = 118;

export function ledgerSupportsChain(chain: ChainInfo): boolean {
  return chain.bip44.coinType === LEDGER_COIN_TYPE && keyAlgoOf(chain) === "secp256k1";
}

export function isValidCompressedPubkey(hex: string): boolean {
  return /^0[23][0-9a-f]{64}$/.test(hex.trim().toLowerCase());
}

export class UnlockThrottledError extends Error {
  constructor(public readonly retryInMs: number) {
    super(`Too many attempts. Retry in ${Math.ceil(retryInMs / 1000)}s`);
    this.name = "UnlockThrottledError";
  }
}

export function generateMnemonic(words: 12 | 24 = 24): string {
  return Bip39.encode(Random.getBytes(words === 24 ? 32 : 16)).toString();
}

export function normalizeMnemonic(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(" ");
}

export function isValidMnemonic(input: string): boolean {
  const m = normalizeMnemonic(input);
  if (![12, 15, 18, 21, 24].includes(m.split(" ").length)) return false;
  try {
    new EnglishMnemonic(m);
    return true;
  } catch {
    return false;
  }
}

export function normalizePrivateKey(input: string): string {
  return input.trim().replace(/^0x/i, "").toLowerCase();
}

export function isValidPrivateKey(input: string): boolean {
  const k = normalizePrivateKey(input);
  return /^[0-9a-f]{64}$/.test(k) && !/^0+$/.test(k);
}

export function hdPathFor(coinType: number, account: number, index: number): string {
  return `m/44'/${coinType}'/${account}'/0/${index}`;
}

function toMeta(k: StoredKey): KeyMeta {
  return {
    id: k.id,
    name: k.name,
    type: k.type,
    hdAccount: k.hdAccount,
    hdIndex: k.hdIndex,
    createdAt: k.createdAt,
    backedUp: k.backedUp,
  };
}

function toStored(k: NewKey): StoredKey {
  const secret =
    k.type === "mnemonic" ? normalizeMnemonic(k.secret) : k.type === "ledger" ? k.secret.trim().toLowerCase() : normalizePrivateKey(k.secret);
  if (k.type === "mnemonic" && !isValidMnemonic(secret)) throw new Error("Invalid recovery phrase");
  if (k.type === "privateKey" && !isValidPrivateKey(secret)) throw new Error("Invalid private key");
  if (k.type === "ledger" && !isValidCompressedPubkey(secret)) throw new Error("Invalid Ledger public key");
  const hdAccount = k.hdAccount ?? 0;
  const hdIndex = k.hdIndex ?? 0;
  if (!Number.isInteger(hdAccount) || hdAccount < 0 || hdAccount > 2 ** 31 - 1) throw new Error("Invalid account number");
  if (!Number.isInteger(hdIndex) || hdIndex < 0 || hdIndex > 2 ** 31 - 1) throw new Error("Invalid address index");
  return {
    id: globalThis.crypto.randomUUID(),
    name: k.name.trim().slice(0, 40) || "Account",
    type: k.type,
    secret,
    hdAccount,
    hdIndex,
    createdAt: Date.now(),
    backedUp: k.type === "ledger" ? true : (k.backedUp ?? k.type === "privateKey"),
  };
}

export class Keyring {
  private cache: { keys: StoredKey[]; kdf: KdfParams; aesKey: CryptoKey } | null = null;
  private addressCache = new Map<string, Uint8Array>();
  private directCache = new Map<string, Promise<OfflineDirectSigner>>();
  private aminoCache = new Map<string, Promise<OfflineAminoSigner>>();

  constructor(
    private readonly local: KV,
    private readonly session: KV,
  ) {}

  async hasVault(): Promise<boolean> {
    return isEncryptedVault(await this.local.get(VAULT_KEY));
  }

  private async load(): Promise<typeof this.cache> {
    if (this.cache) return this.cache;
    const s = await this.session.get<SessionState>(SESSION_KEY);
    if (!s) return null;
    this.cache = { keys: s.keys, kdf: s.kdf, aesKey: await importRawKey(s.aesKey) };
    return this.cache;
  }

  private async saveSession() {
    const c = this.cache!;
    await this.session.set(SESSION_KEY, { keys: c.keys, kdf: c.kdf, aesKey: await exportRawKey(c.aesKey) } satisfies SessionState);
  }

  async isUnlocked(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async status(): Promise<KeyringStatus> {
    const c = await this.load();
    return { hasVault: await this.hasVault(), unlocked: !!c, keys: c ? c.keys.map(toMeta) : [] };
  }

  async listKeys(): Promise<KeyMeta[]> {
    return (await this.load())?.keys.map(toMeta) ?? [];
  }

  private async requireUnlocked() {
    const c = await this.load();
    if (!c) throw new KeyringLockedError();
    return c;
  }

  private async persist() {
    const c = await this.requireUnlocked();
    await this.local.set(VAULT_KEY, await encryptWithKey(c.aesKey, c.kdf, JSON.stringify({ keys: c.keys } satisfies VaultPlaintext)));
    await this.saveSession();
  }

  private async setUnlocked(keys: StoredKey[], kdf: KdfParams, aesKey: CryptoKey) {
    this.cache = { keys, kdf, aesKey };
    await this.saveSession();
  }

  async create(password: string, first: NewKey): Promise<KeyMeta> {
    if (await this.hasVault()) throw new Error("A wallet already exists on this device");
    const stored = toStored(first);
    const { vault, key } = await encrypt(password, JSON.stringify({ keys: [stored] } satisfies VaultPlaintext), true);
    await this.local.set(VAULT_KEY, vault);
    await this.setUnlocked([stored], vault.kdf, key);
    return toMeta(stored);
  }

  async unlock(password: string): Promise<void> {
    const vault = await this.local.get<EncryptedVault>(VAULT_KEY);
    if (!isEncryptedVault(vault)) throw new Error("No wallet found");

    const throttle = (await this.local.get<{ failures: number; until: number }>(THROTTLE_KEY)) ?? { failures: 0, until: 0 };
    const wait = throttle.until - Date.now();
    if (wait > 0) throw new UnlockThrottledError(wait);

    let plaintext: string;
    let key: CryptoKey;
    try {
      ({ plaintext, key } = await decrypt(password, vault, true));
    } catch (e) {
      if (e instanceof WrongPasswordError) {
        const failures = throttle.failures + 1;
        const delay = failures < 3 ? 0 : Math.min(1000 * 2 ** (failures - 2), 5 * 60_000);
        await this.local.set(THROTTLE_KEY, { failures, until: Date.now() + delay });
      }
      throw e;
    }
    await this.local.remove(THROTTLE_KEY);

    const { keys } = JSON.parse(plaintext) as VaultPlaintext;
    if (needsRehash(vault)) {
      const fresh = await encrypt(password, plaintext, true);
      await this.local.set(VAULT_KEY, fresh.vault);
      await this.setUnlocked(keys, fresh.vault.kdf, fresh.key);
    } else {
      await this.setUnlocked(keys, vault.kdf, key);
    }
  }

  async lock(): Promise<void> {
    this.cache = null;
    this.addressCache.clear();
    this.directCache.clear();
    this.aminoCache.clear();
    await this.session.remove(SESSION_KEY);
  }

  async verifyPassword(password: string): Promise<boolean> {
    const vault = await this.local.get<EncryptedVault>(VAULT_KEY);
    if (!isEncryptedVault(vault)) return false;
    try {
      await decryptWithKey(await deriveKey(password, vault.kdf), vault);
      return true;
    } catch {
      return false;
    }
  }

  private async requirePassword(password: string) {
    if (!(await this.verifyPassword(password))) throw new WrongPasswordError();
  }

  async reset(): Promise<void> {
    await this.local.remove(VAULT_KEY);
    await this.local.remove(THROTTLE_KEY);
    await this.lock();
  }

  async addKey(k: NewKey): Promise<KeyMeta> {
    const c = await this.requireUnlocked();
    const stored = toStored(k);
    const dup = c.keys.find(
      (x) => x.type === stored.type && x.secret === stored.secret && x.hdAccount === stored.hdAccount && x.hdIndex === stored.hdIndex,
    );
    if (dup) throw new Error(`This account is already imported as "${dup.name}"`);
    c.keys.push(stored);
    await this.persist();
    return toMeta(stored);
  }

  async renameKey(id: string, name: string): Promise<void> {
    const k = (await this.requireUnlocked()).keys.find((x) => x.id === id);
    if (!k) throw new Error("Account not found");
    k.name = name.trim().slice(0, 40) || k.name;
    await this.persist();
  }

  async markBackedUp(id: string): Promise<void> {
    const k = (await this.requireUnlocked()).keys.find((x) => x.id === id);
    if (!k) return;
    k.backedUp = true;
    await this.persist();
  }

  async removeKey(id: string, password: string): Promise<void> {
    const c = await this.requireUnlocked();
    await this.requirePassword(password);
    if (c.keys.length <= 1) throw new Error("You can't remove the last account. Reset the wallet instead.");
    c.keys = c.keys.filter((k) => k.id !== id);
    for (const m of [this.addressCache, this.directCache, this.aminoCache] as Map<string, unknown>[]) {
      for (const key of [...m.keys()]) if (key.startsWith(`${id}|`)) m.delete(key);
    }
    await this.persist();
  }

  async revealSecret(id: string, password: string): Promise<string> {
    const c = await this.requireUnlocked();
    await this.requirePassword(password);
    const k = c.keys.find((x) => x.id === id);
    if (!k) throw new Error("Account not found");
    if (k.type === "ledger") throw new LedgerKeyError("Ledger accounts have no secret stored in Huallet");
    return k.secret;
  }

  async pendingBackupSecret(id: string): Promise<string> {
    const k = (await this.requireUnlocked()).keys.find((x) => x.id === id);
    if (!k || k.backedUp || k.type !== "mnemonic") throw new Error("Not available");
    return k.secret;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const c = await this.requireUnlocked();
    await this.requirePassword(oldPassword);
    const { vault, key } = await encrypt(newPassword, JSON.stringify({ keys: c.keys } satisfies VaultPlaintext), true);
    await this.local.set(VAULT_KEY, vault);
    await this.setUnlocked(c.keys, vault.kdf, key);
  }

  private async stored(keyId: string): Promise<StoredKey> {
    const k = (await this.requireUnlocked()).keys.find((x) => x.id === keyId);
    if (!k) throw new Error("Account not found");
    return k;
  }

  getDirectSigner(keyId: string, chain: ChainInfo): Promise<OfflineDirectSigner> {
    const cacheKey = `${keyId}|${chain.chainId}|${chain.bip44.coinType}|${chain.bech32Config.bech32PrefixAccAddr}`;
    let p = this.directCache.get(cacheKey);
    if (!p) {
      p = (async () => {
        const k = await this.stored(keyId);
        if (k.type === "ledger") throw new LedgerKeyError();
        const prefix = chain.bech32Config.bech32PrefixAccAddr;
        const eth = keyAlgoOf(chain) === "ethsecp256k1";
        if (k.type === "privateKey") {
          const pk = fromHex(k.secret);
          return eth ? DirectEthSecp256k1Wallet.fromKey(pk, prefix) : DirectSecp256k1Wallet.fromKey(pk, prefix);
        }
        const hdPaths = [stringToPath(hdPathFor(chain.bip44.coinType, k.hdAccount, k.hdIndex))];
        return eth
          ? DirectEthSecp256k1HdWallet.fromMnemonic(k.secret, { prefix, hdPaths })
          : DirectSecp256k1HdWallet.fromMnemonic(k.secret, { prefix, hdPaths });
      })();
      this.directCache.set(cacheKey, p);
      p.catch(() => this.directCache.delete(cacheKey));
    }
    return p;
  }

  getAminoSigner(keyId: string, chain: ChainInfo): Promise<OfflineAminoSigner> {
    if (keyAlgoOf(chain) === "ethsecp256k1") return Promise.reject(new Error("Amino signing is not supported for EVM-style chains"));
    const cacheKey = `${keyId}|${chain.chainId}|${chain.bip44.coinType}|${chain.bech32Config.bech32PrefixAccAddr}`;
    let p = this.aminoCache.get(cacheKey);
    if (!p) {
      p = (async () => {
        const k = await this.stored(keyId);
        if (k.type === "ledger") throw new LedgerKeyError();
        const prefix = chain.bech32Config.bech32PrefixAccAddr;
        if (k.type === "privateKey") return Secp256k1Wallet.fromKey(fromHex(k.secret), prefix);
        return Secp256k1HdWallet.fromMnemonic(k.secret, {
          prefix,
          hdPaths: [stringToPath(hdPathFor(chain.bip44.coinType, k.hdAccount, k.hdIndex))],
        });
      })();
      this.aminoCache.set(cacheKey, p);
      p.catch(() => this.aminoCache.delete(cacheKey));
    }
    return p;
  }

  async getAccount(keyId: string, chain: ChainInfo): Promise<AccountData> {
    const k = await this.stored(keyId);
    if (k.type === "ledger") {
      if (!ledgerSupportsChain(chain)) {
        throw new LedgerKeyError(`${chain.chainName} (coin type ${chain.bip44.coinType}) is not supported by the Ledger Cosmos app`);
      }
      const pubkey = fromHex(k.secret);
      return { address: toBech32(chain.bech32Config.bech32PrefixAccAddr, rawSecp256k1PubkeyToRawAddress(pubkey)), algo: "secp256k1", pubkey };
    }
    const [account] = await (await this.getDirectSigner(keyId, chain)).getAccounts();
    return account;
  }

  async ledgerPubkey(keyId: string): Promise<string | undefined> {
    const k = await this.stored(keyId);
    return k.type === "ledger" ? toHex(fromHex(k.secret)) : undefined;
  }

  async getAddress(keyId: string, chain: ChainInfo): Promise<string> {
    const cacheKey = `${keyId}|${chain.bip44.coinType}|${keyAlgoOf(chain)}`;
    if ((await this.stored(keyId)).type === "ledger") return (await this.getAccount(keyId, chain)).address;
    let data = this.addressCache.get(cacheKey);
    if (!data) {
      data = fromBech32((await this.getAccount(keyId, chain)).address).data;
      this.addressCache.set(cacheKey, data);
    }
    return toBech32(chain.bech32Config.bech32PrefixAccAddr, data);
  }
}
