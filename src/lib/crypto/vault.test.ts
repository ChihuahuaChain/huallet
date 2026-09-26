import { describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncryptedVault, passwordStrength, WrongPasswordError } from "./vault";

describe("vault", () => {
  it("round-trips and uses a fresh IV + salt each time", async () => {
    const a = await encrypt("correct horse battery", "secret");
    const b = await encrypt("correct horse battery", "secret");
    expect(isEncryptedVault(a.vault)).toBe(true);
    expect(a.vault.cipher.iv).not.toBe(b.vault.cipher.iv);
    expect(a.vault.kdf.salt).not.toBe(b.vault.kdf.salt);
    expect(a.vault.ciphertext).not.toContain("secret");
    expect((await decrypt("correct horse battery", a.vault)).plaintext).toBe("secret");
  });

  it("rejects a wrong password", async () => {
    const { vault } = await encrypt("pw-one-1234", "x");
    await expect(decrypt("pw-two-1234", vault)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("detects tampering", async () => {
    const { vault } = await encrypt("pw-one-1234", "hello");
    const bytes = atob(vault.ciphertext).split("");
    bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 1);
    await expect(decrypt("pw-one-1234", { ...vault, ciphertext: btoa(bytes.join("")) })).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it("scores passwords", () => {
    expect(passwordStrength("short")).toBe(0);
    expect(passwordStrength("chihuahua123")).toBeLessThanOrEqual(1);
    expect(passwordStrength("Tr0ub4dor&3-Horse-Staple")).toBe(4);
  });
});
