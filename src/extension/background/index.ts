import type { AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import { fromBech32 } from "@cosmjs/encoding";
import type { EncodeObject } from "@cosmjs/proto-signing";
import { AuthInfo, SignDoc, TxBody } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { BUILTIN_CHAINS, BUILTIN_CHAIN_IDS } from "@/lib/chains/builtin";
import type { ChainInfo } from "@/lib/chains/types";
import { validateChainInfo } from "@/lib/chains/validate";
import { aminoTypes, msgsToJson, registry, summarize } from "@/lib/cosmos/tx";
import { verifyAminoSignature } from "@/lib/crypto/aminoVerify";
import { WrongPasswordError } from "@/lib/crypto/vault";
import { Keyring, KeyringLockedError, UnlockThrottledError, type KeyMeta } from "@/lib/keyring/keyring";
import { extApi, extensionKV } from "@/lib/kv";
import {
  b64decode,
  b64encode,
  PROVIDER_PORT,
  type Approval,
  type ApprovalInput,
  type ApprovalMsg,
  type Envelope,
  type Permissions,
  type SerializedKey,
  type SerializedSignDoc,
  type UiRequest,
  type WalletStatus,
} from "../shared/protocol";

const api = extApi()!;
const local = extensionKV("local");
const session = extensionKV("session");
const keyring = new Keyring(local, session);

(api.storage.session as { setAccessLevel?: (o: { accessLevel: string }) => Promise<void> }).setAccessLevel?.({
  accessLevel: "TRUSTED_CONTEXTS",
}).catch(() => {});

class UserRejectedError extends Error {
  constructor() {
    super("Request rejected");
    this.name = "UserRejectedError";
  }
}

async function readZustand<T>(name: string): Promise<{ state: T; version: number } | undefined> {
  const r = await api.storage.local.get(name);
  const raw = r[name];
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function customChains(): Promise<ChainInfo[]> {
  const s = await readZustand<{ customChains?: unknown[] }>("huallet:chains");
  return (s?.state.customChains ?? []).flatMap((c) => {
    try {
      return [validateChainInfo(c)];
    } catch {
      return [];
    }
  });
}

async function allChains(): Promise<ChainInfo[]> {
  return [...BUILTIN_CHAINS, ...(await customChains())];
}

async function chainById(chainId: string): Promise<ChainInfo> {
  const c = (await allChains()).find((x) => x.chainId === chainId);
  if (!c) throw new Error(`There is no chain info for ${chainId}`);
  return c;
}

async function saveCustomChain(chain: ChainInfo) {
  const s = (await readZustand<Record<string, unknown> & { customChains?: ChainInfo[]; enabledChainIds?: string[] }>("huallet:chains")) ?? {
    state: {},
    version: 1,
  };
  const customChainsList = [...(s.state.customChains ?? []).filter((c) => c.chainId !== chain.chainId), chain];
  const enabled = s.state.enabledChainIds ?? ["chihuahua-1", "osmosis-1", "cosmoshub-4"];
  s.state = { ...s.state, customChains: customChainsList, enabledChainIds: enabled.includes(chain.chainId) ? enabled : [...enabled, chain.chainId] };
  await api.storage.local.set({ "huallet:chains": JSON.stringify(s) });
}

async function autoLockMinutes(): Promise<number> {
  const s = await readZustand<{ autoLockMinutes?: number }>("huallet:settings");
  return s?.state.autoLockMinutes ?? 15;
}

async function getPermissions(): Promise<Permissions> {
  return (await local.get<Permissions>("permissions")) ?? {};
}

async function setPermissions(p: Permissions) {
  await local.set("permissions", p);
}

async function selectedKey(): Promise<KeyMeta> {
  const keys = await keyring.listKeys();
  if (!keys.length) throw new KeyringLockedError();
  const id = await local.get<string>("selected-key");
  return keys.find((k) => k.id === id) ?? keys[0];
}

async function broadcastKeystoreChange() {
  const tabs = await api.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined) api.tabs.sendMessage(tab.id, { type: "keystorechange" }).catch(() => {});
  }
}

async function touch() {
  await session.set("last-activity", Date.now());
}

async function checkAutoLock() {
  if (!(await keyring.isUnlocked())) return;
  const last = (await session.get<number>("last-activity")) ?? 0;
  if (Date.now() - last >= (await autoLockMinutes()) * 60_000) {
    await keyring.lock();
    await broadcastKeystoreChange();
  }
}

api.alarms.create("autolock", { periodInMinutes: 1 });
api.alarms.onAlarm.addListener((a) => {
  if (a.name === "autolock") void checkAutoLock();
});

interface Pending {
  approval: Approval;
  resolve: (result: unknown) => void;
  reject: (e: Error) => void;
  windowId?: number;
}

const pending = new Map<string, Pending>();

async function requestApproval(input: ApprovalInput): Promise<unknown> {
  const id = crypto.randomUUID();
  const approval = { ...input, id } as Approval;
  const done = new Promise<unknown>((resolve, reject) => pending.set(id, { approval, resolve, reject }));
  const url = api.runtime.getURL(`popup.html?view=approval#/approve/${id}`);
  try {
    const win = await api.windows.create({ url, type: "popup", width: 400, height: 660, focused: true });
    const p = pending.get(id);
    if (p) p.windowId = win?.id;
  } catch (e) {
    pending.delete(id);
    throw e;
  }
  return done;
}

api.windows.onRemoved.addListener((windowId) => {
  for (const [id, p] of pending) {
    if (p.windowId === windowId) {
      pending.delete(id);
      p.reject(new UserRejectedError());
    }
  }
});

function settleApproval(id: string, approved: boolean, result?: unknown) {
  const p = pending.get(id);
  if (!p) throw new Error("This request has expired");
  pending.delete(id);
  if (approved) p.resolve(result);
  else p.reject(new UserRejectedError());
  if (p.windowId !== undefined) api.windows.remove(p.windowId).catch(() => {});
}

async function ensureUnlocked(origin: string) {
  if (!(await keyring.hasVault())) throw new Error("Huallet has no wallet yet. Open the extension to create one.");
  if (!(await keyring.isUnlocked())) await requestApproval({ type: "unlock", origin });
  if (!(await keyring.isUnlocked())) throw new KeyringLockedError();
}

async function enable(origin: string, chainIds: string[]) {
  const chains = await Promise.all(chainIds.map(chainById));
  await ensureUnlocked(origin);
  const perms = await getPermissions();
  const missing = chains.filter((c) => !perms[origin]?.includes(c.chainId));
  if (!missing.length) return;
  await requestApproval({ type: "connect", origin, chainIds: missing.map((c) => c.chainId), chainNames: missing.map((c) => c.chainName) });
  const latest = await getPermissions();
  latest[origin] = [...new Set([...(latest[origin] ?? []), ...missing.map((c) => c.chainId)])];
  await setPermissions(latest);
}

async function requirePermission(origin: string, chainId: string): Promise<ChainInfo> {
  const chain = await chainById(chainId);
  const perms = await getPermissions();
  if (!perms[origin]?.includes(chainId)) await enable(origin, [chainId]);
  else await ensureUnlocked(origin);
  return chain;
}

async function serializedKey(chain: ChainInfo): Promise<SerializedKey> {
  const key = await selectedKey();
  const account = await keyring.getAccount(key.id, chain);
  return {
    name: key.name,
    algo: account.algo,
    pubKey: b64encode(account.pubkey),
    address: b64encode(fromBech32(account.address).data),
    bech32Address: account.address,
    isNanoLedger: key.type === "ledger",
    isKeystone: false,
  };
}

async function ledgerSignature(key: KeyMeta, doc: StdSignDoc, result: unknown): Promise<AminoSignResponse> {
  const res = result as AminoSignResponse | undefined;
  const pub = await keyring.ledgerPubkey(key.id);
  if (!res?.signature || !pub || !(await verifyAminoSignature(pub, doc, res.signature))) {
    throw new Error("Invalid signature returned by the Ledger");
  }
  return { signed: doc, signature: res.signature };
}

function directApproval(chain: ChainInfo, doc: SerializedSignDoc) {
  const body = TxBody.decode(b64decode(doc.bodyBytes));
  const authInfo = AuthInfo.decode(b64decode(doc.authInfoBytes));
  const msgs: EncodeObject[] = body.messages.map((any) => {
    try {
      return { typeUrl: any.typeUrl, value: registry.decode(any) };
    } catch {
      return { typeUrl: any.typeUrl, value: { unknown: b64encode(any.value) } };
    }
  });
  const fee = authInfo.fee
    ? { amount: authInfo.fee.amount.map((c) => ({ denom: c.denom, amount: c.amount })), gas: authInfo.fee.gasLimit.toString() }
    : undefined;
  return {
    messages: msgs.map((m) => summarize(m) as ApprovalMsg),
    json: msgsToJson(msgs),
    memo: body.memo,
    fee,
    chainName: chain.chainName,
  };
}

function aminoApproval(doc: StdSignDoc) {
  return {
    messages: doc.msgs.map((m) => {
      try {
        return summarize(aminoTypes.fromAmino(m)) as ApprovalMsg;
      } catch {
        return { kind: "unknown", typeUrl: m.type, fields: {} } as ApprovalMsg;
      }
    }),
    json: JSON.stringify(doc.msgs, null, 2),
    memo: doc.memo,
    fee: { amount: doc.fee.amount.map((c) => ({ denom: c.denom, amount: c.amount })), gas: doc.fee.gas },
  };
}

async function checkSigner(chain: ChainInfo, signer: string) {
  const key = await selectedKey();
  const address = await keyring.getAddress(key.id, chain);
  if (address !== signer) throw new Error("Signer address does not match the active Huallet account");
  return key;
}

async function handleProvider(origin: string, method: string, params: unknown[]): Promise<unknown> {
  switch (method) {
    case "enable": {
      const ids = Array.isArray(params[0]) ? (params[0] as string[]) : [params[0] as string];
      await enable(origin, ids.filter((x) => typeof x === "string"));
      return null;
    }
    case "disable": {
      const perms = await getPermissions();
      const ids = params[0] === undefined ? undefined : Array.isArray(params[0]) ? (params[0] as string[]) : [params[0] as string];
      if (!ids) delete perms[origin];
      else perms[origin] = (perms[origin] ?? []).filter((c) => !ids.includes(c));
      await setPermissions(perms);
      return null;
    }
    case "getKey": {
      const chain = await requirePermission(origin, String(params[0]));
      return serializedKey(chain);
    }
    case "getKeysSettled": {
      const ids = (params[0] as string[]) ?? [];
      await enable(origin, ids);
      return Promise.all(
        ids.map(async (id) => {
          try {
            return { status: "fulfilled", value: await serializedKey(await chainById(id)) };
          } catch (e) {
            return { status: "rejected", reason: String(e) };
          }
        }),
      );
    }
    case "signDirect": {
      const [chainId, signer, doc] = params as [string, string, SerializedSignDoc];
      const chain = await requirePermission(origin, chainId);
      if (doc.chainId !== chainId) throw new Error("Sign doc chain-id mismatch");
      const key = await checkSigner(chain, signer);
      if (key.type === "ledger") {
        throw new Error("Ledger accounts can only sign Amino transactions. The dApp should use getOfflineSignerAuto() or getOfflineSignerOnlyAmino().");
      }
      await requestApproval({ type: "sign", origin, chainId, signer, mode: "direct", ...directApproval(chain, doc) });
      await touch();
      const wallet = await keyring.getDirectSigner(key.id, chain);
      const signDoc = SignDoc.fromPartial({
        bodyBytes: b64decode(doc.bodyBytes),
        authInfoBytes: b64decode(doc.authInfoBytes),
        chainId: doc.chainId,
        accountNumber: BigInt(doc.accountNumber),
      });
      const res = await wallet.signDirect(signer, signDoc);
      return {
        signed: {
          bodyBytes: b64encode(res.signed.bodyBytes),
          authInfoBytes: b64encode(res.signed.authInfoBytes),
          chainId: res.signed.chainId,
          accountNumber: res.signed.accountNumber.toString(),
        } satisfies SerializedSignDoc,
        signature: res.signature,
      };
    }
    case "signAmino": {
      const [chainId, signer, doc] = params as [string, string, StdSignDoc];
      const chain = await requirePermission(origin, chainId);
      if (doc.chain_id !== chainId) throw new Error("Sign doc chain-id mismatch");
      const key = await checkSigner(chain, signer);
      const ledger = key.type === "ledger" ? { hdAccount: key.hdAccount, hdIndex: key.hdIndex, prefix: chain.bech32Config.bech32PrefixAccAddr } : undefined;
      const result = await requestApproval({
        type: "sign",
        origin,
        chainId,
        chainName: chain.chainName,
        signer,
        mode: "amino",
        ...aminoApproval(doc),
        ledger,
        signDoc: ledger ? doc : undefined,
      });
      await touch();
      if (ledger) return ledgerSignature(key, doc, result);
      return (await keyring.getAminoSigner(key.id, chain)).signAmino(signer, doc);
    }
    case "signArbitrary": {
      const [chainId, signer, data] = params as [string, string, { text?: string; b64?: string }];
      const chain = await requirePermission(origin, chainId);
      const key = await checkSigner(chain, signer);
      const bytes = data.b64 !== undefined ? b64decode(data.b64) : new TextEncoder().encode(data.text ?? "");
      const doc: StdSignDoc = {
        chain_id: "",
        account_number: "0",
        sequence: "0",
        fee: { gas: "0", amount: [] },
        msgs: [{ type: "sign/MsgSignData", value: { signer, data: b64encode(bytes) } }],
        memo: "",
      };
      const ledger = key.type === "ledger" ? { hdAccount: key.hdAccount, hdIndex: key.hdIndex, prefix: chain.bech32Config.bech32PrefixAccAddr } : undefined;
      const result = await requestApproval({
        type: "sign",
        origin,
        chainId,
        chainName: chain.chainName,
        signer,
        mode: "arbitrary",
        messages: [],
        json: JSON.stringify(doc, null, 2),
        memo: "",
        data: data.text ?? `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
        ledger,
        signDoc: ledger ? doc : undefined,
      });
      await touch();
      if (ledger) return (await ledgerSignature(key, doc, result)).signature;
      return (await (await keyring.getAminoSigner(key.id, chain)).signAmino(signer, doc)).signature;
    }
    case "experimentalSuggestChain": {
      const chain = validateChainInfo(params[0]);
      if (BUILTIN_CHAIN_IDS.has(chain.chainId) || (await customChains()).some((c) => c.chainId === chain.chainId)) return null;
      await ensureUnlocked(origin);
      await requestApproval({ type: "suggest-chain", origin, chain });
      await saveCustomChain(chain);
      return null;
    }
    case "getChainInfosWithoutEndpoints": {
      return (await allChains()).map((c) => ({ ...c, rpc: undefined, rest: undefined, rpcFallbacks: undefined, restFallbacks: undefined }));
    }
    default:
      throw new Error(`Method not supported: ${method}`);
  }
}

api.runtime.onConnect.addListener((port) => {
  if (port.name !== PROVIDER_PORT) return;
  const sender = port.sender;
  const url = sender?.origin ?? sender?.url;
  let origin: string;
  try {
    const u = new URL(url ?? "");
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) {
      port.disconnect();
      return;
    }
    origin = u.origin;
  } catch {
    port.disconnect();
    return;
  }
  port.onMessage.addListener(async (m: { id: string; method: string; params: unknown[] }) => {
    try {
      const result = await handleProvider(origin, m.method, Array.isArray(m.params) ? m.params : []);
      port.postMessage({ id: m.id, ok: true, result });
    } catch (e) {
      port.postMessage({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
});

function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === api.runtime.id && !!sender.url?.startsWith(api.runtime.getURL(""));
}

async function status(): Promise<WalletStatus> {
  const s = await keyring.status();
  const selected = await local.get<string>("selected-key");
  return { ...s, selectedKeyId: s.keys.some((k) => k.id === selected) ? selected! : (s.keys[0]?.id ?? null) };
}

async function handleUi(req: UiRequest): Promise<unknown> {
  switch (req.type) {
    case "status":
      return status();
    case "activity":
      await touch();
      return null;
    case "create": {
      const meta = await keyring.create(req.password, req.key);
      await local.set("selected-key", meta.id);
      await touch();
      return meta;
    }
    case "unlock":
      await keyring.unlock(req.password);
      await touch();
      await broadcastKeystoreChange();
      return null;
    case "lock":
      await keyring.lock();
      await broadcastKeystoreChange();
      return null;
    case "addKey": {
      const meta = await keyring.addKey(req.key);
      await local.set("selected-key", meta.id);
      await broadcastKeystoreChange();
      return meta;
    }
    case "renameKey":
      await keyring.renameKey(req.id, req.name);
      await broadcastKeystoreChange();
      return null;
    case "markBackedUp":
      return keyring.markBackedUp(req.id);
    case "removeKey":
      await keyring.removeKey(req.id, req.password);
      await broadcastKeystoreChange();
      return null;
    case "revealSecret":
      return keyring.revealSecret(req.id, req.password);
    case "pendingBackupSecret":
      return keyring.pendingBackupSecret(req.id);
    case "changePassword":
      return keyring.changePassword(req.oldPassword, req.newPassword);
    case "verifyPassword":
      return keyring.verifyPassword(req.password);
    case "reset":
      if ((await keyring.isUnlocked()) && !(await keyring.verifyPassword(req.password))) throw new WrongPasswordError();
      await keyring.reset();
      await local.remove("selected-key");
      await local.remove("permissions");
      await broadcastKeystoreChange();
      return null;
    case "selectKey":
      if (!(await keyring.listKeys()).some((k) => k.id === req.id)) throw new Error("Account not found");
      await local.set("selected-key", req.id);
      await broadcastKeystoreChange();
      return null;
    case "getAccount": {
      const chain = validateChainInfo(req.chain);
      const a = await keyring.getAccount(req.keyId, chain);
      return { address: a.address, algo: a.algo, pubkey: b64encode(a.pubkey) };
    }
    case "signDirect": {
      const chain = validateChainInfo(req.chain);
      const wallet = await keyring.getDirectSigner(req.keyId, chain);
      await touch();
      const res = await wallet.signDirect(
        req.signerAddress,
        SignDoc.fromPartial({
          bodyBytes: b64decode(req.signDoc.bodyBytes),
          authInfoBytes: b64decode(req.signDoc.authInfoBytes),
          chainId: req.signDoc.chainId,
          accountNumber: BigInt(req.signDoc.accountNumber),
        }),
      );
      return {
        signed: {
          bodyBytes: b64encode(res.signed.bodyBytes),
          authInfoBytes: b64encode(res.signed.authInfoBytes),
          chainId: res.signed.chainId,
          accountNumber: res.signed.accountNumber.toString(),
        },
        signature: res.signature,
      };
    }
    case "getApproval": {
      const p = pending.get(req.id);
      if (!p) throw new Error("This request has expired");
      return p.approval;
    }
    case "resolveApproval":
      if (req.approved && pending.get(req.id)?.approval.type === "unlock" && !(await keyring.isUnlocked())) {
        throw new KeyringLockedError();
      }
      settleApproval(req.id, req.approved, req.result);
      return null;
    case "listPermissions":
      return getPermissions();
    case "revokePermission": {
      const perms = await getPermissions();
      delete perms[req.origin];
      await setPermissions(perms);
      return null;
    }
  }
}

function errorCode(e: unknown): string | undefined {
  if (e instanceof WrongPasswordError) return "wrong-password";
  if (e instanceof UnlockThrottledError) return `throttled:${e.retryInMs}`;
  if (e instanceof KeyringLockedError) return "locked";
  return undefined;
}

api.runtime.onMessage.addListener((req: UiRequest, sender, sendResponse) => {
  if (!isExtensionPage(sender) || typeof req?.type !== "string") return false;
  handleUi(req).then(
    (result) => sendResponse({ ok: true, result } satisfies Envelope<unknown>),
    (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e), code: errorCode(e) } satisfies Envelope<unknown>),
  );
  return true;
});

api.runtime.onConnect.addListener((port) => {
  if (port.name !== "huallet-approval") return;
  port.onMessage.addListener(() => {});
});
