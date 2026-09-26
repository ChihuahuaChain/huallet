import { serializeSignDoc, type StdSignDoc, type StdSignature } from "@cosmjs/amino";
import { Secp256k1, Secp256k1Signature, sha256 } from "@cosmjs/crypto";
import { fromBase64, fromHex, toHex } from "@cosmjs/encoding";

export async function verifyAminoSignature(expectedPubkeyHex: string, signDoc: StdSignDoc, signature: StdSignature): Promise<boolean> {
  try {
    if (toHex(fromBase64(signature.pub_key.value)) !== expectedPubkeyHex.toLowerCase()) return false;
    const sig = Secp256k1Signature.fromFixedLength(fromBase64(signature.signature));
    return await Secp256k1.verifySignature(sig, sha256(serializeSignDoc(signDoc)), fromHex(expectedPubkeyHex));
  } catch {
    return false;
  }
}
