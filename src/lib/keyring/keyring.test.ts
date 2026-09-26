import { beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_CHAINS } from "../chains/builtin";
import { WrongPasswordError } from "../crypto/vault";
import { memoryKV, type KV } from "../kv";
import { generateMnemonic, isValidMnemonic, isValidPrivateKey, Keyring, KeyringLockedError } from "./keyring";

const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const chihuahua = BUILTIN_CHAINS.find((c) => c.chainId === "chihuahua-1")!;
const hub = BUILTIN_CHAINS.find((c) => c.chainId === "cosmoshub-4")!;

describe("keyring", () => {
  let local: KV;
  let session: KV;
  let keyring: Keyring;

  beforeEach(() => {
    local = memoryKV();
    session = memoryKV();
    keyring = new Keyring(local, session);
  });

  it("derives the standard Cosmos test vector on every 118 chain", async () => {
    const k = await keyring.create("password-123", { name: "Test", type: "mnemonic", secret: ABANDON });
    expect(await keyring.getAddress(k.id, hub)).toBe("cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4");
    expect(await keyring.getAddress(k.id, chihuahua)).toMatch(/^chihuahua1/);
    const amino = await keyring.getAminoSigner(k.id, hub);
    expect((await amino.getAccounts())[0].address).toBe("cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4");
  });

  it("never stores secrets in plaintext at rest", async () => {
    await keyring.create("password-123", { name: "Test", type: "mnemonic", secret: ABANDON });
    expect(JSON.stringify(await local.get("vault"))).not.toContain("abandon");
    expect(JSON.stringify(await keyring.listKeys())).not.toContain("abandon");
  });

  it("survives a service-worker restart while unlocked, and locks for good", async () => {
    await keyring.create("password-123", { name: "Test", type: "mnemonic", secret: ABANDON });
    const restarted = new Keyring(local, session);
    expect(await restarted.isUnlocked()).toBe(true);
    expect((await restarted.listKeys())[0].name).toBe("Test");
    await restarted.lock();
    expect(await new Keyring(local, session).isUnlocked()).toBe(false);
    await expect(restarted.addKey({ name: "x", type: "mnemonic", secret: ABANDON })).rejects.toBeInstanceOf(KeyringLockedError);
  });

  it("locks, unlocks, and rejects bad passwords", async () => {
    await keyring.create("password-123", { name: "Test", type: "mnemonic", secret: ABANDON });
    await keyring.lock();
    expect((await keyring.status()).unlocked).toBe(false);
    await expect(keyring.unlock("nope")).rejects.toBeInstanceOf(WrongPasswordError);
    await keyring.unlock("password-123");
    expect(await keyring.listKeys()).toHaveLength(1);
  });

  it("requires the password for sensitive actions", async () => {
    const k = await keyring.create("password-123", { name: "Test", type: "mnemonic", secret: ABANDON });
    await expect(keyring.revealSecret(k.id, "wrong")).rejects.toBeInstanceOf(WrongPasswordError);
    expect(await keyring.revealSecret(k.id, "password-123")).toBe(ABANDON);
  });

  it("adds accounts, rejects duplicates, changes password", async () => {
    await keyring.create("password-123", { name: "A", type: "mnemonic", secret: ABANDON });
    await keyring.addKey({ name: "B", type: "mnemonic", secret: ABANDON, hdIndex: 1 });
    await expect(keyring.addKey({ name: "C", type: "mnemonic", secret: ABANDON })).rejects.toThrow(/already imported/);
    await keyring.changePassword("password-123", "new-password-456");
    await keyring.lock();
    await keyring.unlock("new-password-456");
    expect((await keyring.listKeys()).map((k) => k.name)).toEqual(["A", "B"]);
  });

  it("validates secrets", () => {
    expect(isValidMnemonic(generateMnemonic(24))).toBe(true);
    expect(isValidMnemonic(generateMnemonic(12))).toBe(true);
    expect(isValidMnemonic(ABANDON.replace("about", "abandon"))).toBe(false);
    expect(isValidPrivateKey("0x" + "11".repeat(32))).toBe(true);
    expect(isValidPrivateKey("00".repeat(32))).toBe(false);
  });
});

describe("ledger accounts", () => {
  it("derive addresses from the stored public key, never sign locally", async () => {
    const { Secp256k1HdWallet } = await import("@cosmjs/amino");
    const { toHex } = await import("@cosmjs/encoding");
    const probe = await Secp256k1HdWallet.fromMnemonic(ABANDON);
    const pubkey = toHex((await probe.getAccounts())[0].pubkey);

    const keyring = new Keyring(memoryKV(), memoryKV());
    const k = await keyring.create("password-123", { name: "Nano", type: "ledger", secret: pubkey });
    expect(k.backedUp).toBe(true);
    expect(await keyring.getAddress(k.id, hub)).toBe("cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4");
    expect(await keyring.getAddress(k.id, chihuahua)).toBe("chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h");
    await expect(keyring.getDirectSigner(k.id, hub)).rejects.toThrow(/Ledger/);
    await expect(keyring.getAminoSigner(k.id, hub)).rejects.toThrow(/Ledger/);
    await expect(keyring.revealSecret(k.id, "password-123")).rejects.toThrow(/no secret/);
    const evm = { ...hub, chainId: "evm-1", bip44: { coinType: 60 } };
    await expect(keyring.getAccount(k.id, evm)).rejects.toThrow(/not supported/);
    await expect(keyring.addKey({ name: "bad", type: "ledger", secret: "04" + "ab".repeat(32) })).rejects.toThrow(/Invalid Ledger/);
  });
});
