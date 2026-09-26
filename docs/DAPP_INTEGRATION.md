# Integrating Huallet in a dApp

The Huallet extension injects a single global: `window.huallet`. It is available on `https://` pages
(and `http://localhost` / `http://127.0.0.1` for development) from `document_start`.

## Detect

```ts
function getHuallet(): Promise<typeof window.huallet | undefined> {
  if (window.huallet) return Promise.resolve(window.huallet);
  return new Promise((resolve) => {
    window.addEventListener("huallet#initialized", () => resolve(window.huallet), { once: true });
    setTimeout(() => resolve(window.huallet), 1500);
  });
}
```

## Connect and sign with CosmJS

```ts
import { SigningStargateClient } from "@cosmjs/stargate";

const huallet = await getHuallet();
if (!huallet) throw new Error("Please install Huallet");

await huallet.enable("chihuahua-1");                       // asks the user to connect this site
const signer = await huallet.getOfflineSignerAuto("chihuahua-1"); // Amino-only for Ledger accounts
const [account] = await signer.getAccounts();

const client = await SigningStargateClient.connectWithSigner("https://rpc.chihuahua.wtf", signer);
await client.signAndBroadcast(account.address, msgs, "auto");
```

Always use `getOfflineSignerAuto`: Ledger accounts can only sign Amino transactions.

## API

| Method | Description |
|---|---|
| `enable(chainIds)` | Request access to one or more chains (opens an approval window the first time). |
| `disable(chainIds?)` | Revoke this site's access (all chains when omitted). |
| `getKey(chainId)` | `{ name, algo, pubKey, address, bech32Address, isNanoLedger }` of the active account. |
| `getOfflineSigner(chainId)` | CosmJS signer with `signDirect` and `signAmino`. |
| `getOfflineSignerOnlyAmino(chainId)` | CosmJS Amino signer. |
| `getOfflineSignerAuto(chainId)` | Direct signer, or Amino-only for Ledger accounts. |
| `signDirect(chainId, signer, signDoc)` | Sign a protobuf SignDoc (not available for Ledger accounts). |
| `signAmino(chainId, signer, stdSignDoc)` | Sign an Amino JSON document. |
| `signArbitrary(chainId, signer, data)` | ADR-36 off-chain signature (e.g. login). |
| `experimentalSuggestChain(chainInfo)` | Propose a chain the user hasn't added yet (standard Cosmos ChainInfo JSON). |
| `getChainInfosWithoutEndpoints()` | Chains known to the wallet. |

Every signature opens a Huallet review window; if the user closes it, the promise rejects with `Request rejected`.

## Events

```ts
window.addEventListener("huallet_keystorechange", () => {
  // The user switched account, locked or unlocked the wallet: re-read the key.
});
```

## Supporting several wallets

If your dApp already supports other Cosmos wallets that expose the same methods, add Huallet as one more option:

```ts
const provider = window.huallet ?? /* your existing wallet provider */ undefined;
```
