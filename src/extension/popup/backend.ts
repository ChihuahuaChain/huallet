import type { AminoSignResponse, OfflineAminoSigner, StdSignDoc } from "@cosmjs/amino";
import type { AccountData, DirectSignResponse, OfflineDirectSigner } from "@cosmjs/proto-signing";
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import type { ChainInfo } from "@/lib/chains/types";
import { ledgerSupportsChain, type KeyMeta } from "@/lib/keyring/keyring";
import type { WalletBackend } from "@/state/wallet";
import { b64decode, b64encode, type SerializedAccount, type SerializedSignDoc, type StdSignature } from "../shared/protocol";
import { signAminoWithLedger } from "../ledger/ledger";
import { bg } from "./background";
import { extView } from "./view";

class BackgroundSigner implements OfflineDirectSigner {
  constructor(
    private readonly keyId: string,
    private readonly chain: ChainInfo,
  ) {}

  async getAccounts(): Promise<readonly AccountData[]> {
    const a = await bg<SerializedAccount>({ type: "getAccount", keyId: this.keyId, chain: this.chain });
    return [{ address: a.address, algo: a.algo as AccountData["algo"], pubkey: b64decode(a.pubkey) }];
  }

  async signDirect(signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse> {
    const r = await bg<{ signed: SerializedSignDoc; signature: StdSignature }>({
      type: "signDirect",
      keyId: this.keyId,
      chain: this.chain,
      signerAddress,
      signDoc: {
        bodyBytes: b64encode(signDoc.bodyBytes),
        authInfoBytes: b64encode(signDoc.authInfoBytes),
        chainId: signDoc.chainId,
        accountNumber: signDoc.accountNumber.toString(),
      },
    });
    return {
      signed: {
        bodyBytes: b64decode(r.signed.bodyBytes),
        authInfoBytes: b64decode(r.signed.authInfoBytes),
        chainId: r.signed.chainId,
        accountNumber: BigInt(r.signed.accountNumber),
      },
      signature: r.signature,
    };
  }
}

class PageLedgerSigner implements OfflineAminoSigner {
  constructor(
    private readonly key: KeyMeta,
    private readonly chain: ChainInfo,
  ) {}

  async getAccounts(): Promise<readonly AccountData[]> {
    const a = await bg<SerializedAccount>({ type: "getAccount", keyId: this.key.id, chain: this.chain });
    return [{ address: a.address, algo: "secp256k1", pubkey: b64decode(a.pubkey) }];
  }

  signAmino(signerAddress: string, signDoc: StdSignDoc): Promise<AminoSignResponse> {
    return signAminoWithLedger(signDoc, signerAddress, this.chain.bech32Config.bech32PrefixAccAddr, this.key.hdAccount, this.key.hdIndex, {
      allowChooser: extView() !== "popup",
    });
  }
}

export function localBackend(key: KeyMeta): WalletBackend {
  const keyId = key.id;
  const ledger = key.type === "ledger";
  return {
    id: `local:${keyId}`,
    label: ledger ? "Ledger" : "Huallet",
    hardware: ledger,
    getAddress: async (chain) => (await bg<SerializedAccount>({ type: "getAccount", keyId, chain })).address,
    getSigner: async (chain) => (ledger ? new PageLedgerSigner(key, chain) : new BackgroundSigner(keyId, chain)),
    supportsChain: (chain) => !ledger || ledgerSupportsChain(chain),
  };
}
