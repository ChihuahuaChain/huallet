import { encodeSecp256k1Pubkey } from "@cosmjs/amino";
import { fromUtf8, toBase64, toUtf8 } from "@cosmjs/encoding";
import { encodePubkey, Registry, type AccountData, type EncodeObject, type GeneratedType, type OfflineSigner } from "@cosmjs/proto-signing";
import {
  accountFromAny,
  AminoTypes,
  createDefaultAminoConverters,
  defaultRegistryTypes,
  SigningStargateClient,
  type Account,
  type DeliverTxResponse,
  type StdFee,
} from "@cosmjs/stargate";
import { BinaryReader } from "cosmjs-types/binary";
import { BaseAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth";
import { VoteOption as ProtoVoteOption } from "cosmjs-types/cosmos/gov/v1beta1/gov";
import { GenericAuthorization } from "cosmjs-types/cosmos/authz/v1beta1/authz";
import { AuthorizationType, StakeAuthorization } from "cosmjs-types/cosmos/staking/v1beta1/authz";
import type { Any } from "cosmjs-types/google/protobuf/any";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";
import { AuthInfo, TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import type { ChainInfo, FeeCurrency } from "../chains/types";
import { feeCurrencyOf } from "../chains/types";
import { toBaseUnits } from "../format";
import { DIRECT_SWAP_TYPE_URL } from "../dex/huahuaswap";
import { directSwapAminoConverter, MsgDirectSwap } from "../dex/msgDirectSwap";
import {
  MsgSplitRouteSwapExactAmountIn,
  MsgSwapExactAmountIn,
  splitRouteSwapExactAmountInAminoConverter,
  swapExactAmountInAminoConverter,
  type SplitRouteSwapExactAmountInValue,
  type SwapExactAmountInValue,
} from "../dex/msgOsmosis";
import { createAuthzAminoConverters } from "./authzAmino";
import { restPost, type VoteOption } from "./rest";

export const registry = new Registry([
  ...defaultRegistryTypes,
  ["/cosmwasm.wasm.v1.MsgExecuteContract", MsgExecuteContract],
  [MsgDirectSwap.typeUrl, MsgDirectSwap as unknown as GeneratedType],
  [MsgSwapExactAmountIn.typeUrl, MsgSwapExactAmountIn as unknown as GeneratedType],
  [MsgSplitRouteSwapExactAmountIn.typeUrl, MsgSplitRouteSwapExactAmountIn as unknown as GeneratedType],
]);

export const aminoTypes = new AminoTypes({
  [MsgDirectSwap.typeUrl]: directSwapAminoConverter,
  [MsgSwapExactAmountIn.typeUrl]: swapExactAmountInAminoConverter,
  [MsgSplitRouteSwapExactAmountIn.typeUrl]: splitRouteSwapExactAmountInAminoConverter,
  ...createDefaultAminoConverters(),
  ...createAuthzAminoConverters(),
  "/cosmwasm.wasm.v1.MsgExecuteContract": {
    aminoType: "wasm/MsgExecuteContract",
    toAmino: ({ sender, contract, msg, funds }: MsgExecuteContract) => ({
      sender,
      contract,
      msg: JSON.parse(fromUtf8(msg)),
      funds,
    }),
    fromAmino: ({ sender, contract, msg, funds }: { sender: string; contract: string; msg: unknown; funds: MsgExecuteContract["funds"] }) =>
      MsgExecuteContract.fromPartial({ sender, contract, msg: toUtf8(JSON.stringify(msg)), funds }),
  },
});

function accountParser(any: Any): Account {
  try {
    return accountFromAny(any);
  } catch (e) {
    const reader = new BinaryReader(any.value);
    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      if (tag >>> 3 === 1 && (tag & 7) === 2) {
        const base = BaseAccount.decode(reader.bytes());
        return { address: base.address, pubkey: null, accountNumber: base.accountNumber, sequence: Number(base.sequence) };
      }
      reader.skipType(tag & 7);
    }
    throw e;
  }
}

function rpcEndpoints(chain: ChainInfo): string[] {
  return [chain.rpc, ...(chain.rpcFallbacks ?? [])];
}

async function connect(chain: ChainInfo, signer: OfflineSigner): Promise<{ client: SigningStargateClient; address: string }> {
  const [account] = await signer.getAccounts();
  let lastErr: unknown;
  for (const rpc of rpcEndpoints(chain)) {
    try {
      const client = await SigningStargateClient.connectWithSigner(rpc, signer, { registry, aminoTypes, accountParser, broadcastTimeoutMs: 60_000 });
      const remoteChainId = await client.getChainId();
      if (remoteChainId !== chain.chainId) {
        client.disconnect();
        throw new Error(`RPC ${rpc} serves "${remoteChainId}", expected "${chain.chainId}"`);
      }
      return { client, address: account.address };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("No RPC endpoint reachable");
}

export type FeeLevel = "low" | "average" | "high";

// Margin over a fee-inclusive simulation (see simulate()), which lands within ~1% of execution.
export const GAS_ADJUSTMENT = 1.3;

/** Gas the ante handler spends deducting the fee (Chihuahua: transfer + burn, ~33k). Fallback only. */
const FEE_DEDUCTION_GAS = 40_000;

function priceToString(n: number): string {
  return n.toFixed(18).replace(/\.?0+$/, "") || "0";
}

export function gasPriceOf(currency: FeeCurrency, level: FeeLevel): number {
  const step = currency.gasPriceStep ?? { low: 0.01, average: 0.025, high: 0.04 };
  return step[level];
}

export function computeFee(currency: FeeCurrency, level: FeeLevel, gasLimit: number): StdFee {
  const priceAtomics = toBaseUnits(priceToString(gasPriceOf(currency, level)), 18);
  const scale = 10n ** 18n;
  const raw = priceAtomics * BigInt(gasLimit);
  const amount = (raw + scale - 1n) / scale;
  return { amount: [{ denom: currency.coinMinimalDenom, amount: amount.toString() }], gas: String(gasLimit) };
}

export interface Simulation {
  gasUsed: number;
  gasLimit: number;
}

/**
 * cosmjs simulates with an empty fee, so the ante handler skips fee deduction entirely. On
 * Chihuahua that is a bank transfer plus a burn, ~33k gas the estimate never saw: small txs
 * (a REStake revoke executes in ~50k) ran out of gas even with a 1.6 margin. So the estimate
 * is re-simulated with a realistic fee attached; if that fails (e.g. the balance can't cover
 * the probe fee) a fixed allowance stands in for the deduction.
 */
export async function simulate(chain: ChainInfo, signer: OfflineSigner, msgs: EncodeObject[], memo: string): Promise<Simulation> {
  const { client, address } = await connect(chain, signer);
  try {
    const withoutFee = await client.simulate(address, msgs, memo);
    const [account] = await signer.getAccounts();
    const probeGas = Math.ceil(withoutFee * GAS_ADJUSTMENT) + FEE_DEDUCTION_GAS;
    const gasUsed = await simulateWithFee(chain, account, (await client.getSequence(address)).sequence, msgs, memo, probeGas).catch(
      () => withoutFee + FEE_DEDUCTION_GAS,
    );
    return { gasUsed, gasLimit: Math.ceil(gasUsed * GAS_ADJUSTMENT) };
  } finally {
    client.disconnect();
  }
}

async function simulateWithFee(chain: ChainInfo, account: AccountData, sequence: number, msgs: EncodeObject[], memo: string, probeGas: number): Promise<number> {
  const fee = computeFee(feeCurrencyOf(chain), "high", probeGas);
  const bodyBytes = TxBody.encode(TxBody.fromPartial({ messages: msgs.map((m) => registry.encodeAsAny(m)), memo })).finish();
  const authInfoBytes = AuthInfo.encode(
    AuthInfo.fromPartial({
      signerInfos: [
        {
          publicKey: encodePubkey(encodeSecp256k1Pubkey(account.pubkey)),
          modeInfo: { single: { mode: SignMode.SIGN_MODE_UNSPECIFIED } },
          sequence: BigInt(sequence),
        },
      ],
      fee: { amount: [...fee.amount], gasLimit: 0n },
    }),
  ).finish();
  // A 64-byte placeholder signature so the per-byte tx size cost matches the signed tx.
  const txBytes = TxRaw.encode({ bodyBytes, authInfoBytes, signatures: [new Uint8Array(64)] }).finish();
  const r = await restPost<{ gas_info?: { gas_used?: string } }>(chain, "/cosmos/tx/v1beta1/simulate", { tx_bytes: toBase64(txBytes) });
  const used = Number(r.gas_info?.gas_used);
  if (!Number.isSafeInteger(used) || used <= 0) throw new Error("Simulation returned no gas estimate");
  return used;
}

export interface BroadcastResult {
  txHash: string;
  code: number;
  height: number;
  gasUsed: number;
  rawLog?: string;
}

export async function signAndBroadcast(
  chain: ChainInfo,
  signer: OfflineSigner,
  msgs: EncodeObject[],
  fee: StdFee,
  memo: string,
): Promise<BroadcastResult> {
  const { client, address } = await connect(chain, signer);
  try {
    const res: DeliverTxResponse = await client.signAndBroadcast(address, msgs, fee, memo);
    return { txHash: res.transactionHash, code: res.code, height: res.height, gasUsed: Number(res.gasUsed), rawLog: res.rawLog };
  } finally {
    client.disconnect();
  }
}

export { feeCurrencyOf };

const MSG_DELEGATE = "/cosmos.staking.v1beta1.MsgDelegate";
const MSG_WITHDRAW_REWARD = "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward";
const MSG_GRANT = "/cosmos.authz.v1beta1.MsgGrant";
const MSG_REVOKE = "/cosmos.authz.v1beta1.MsgRevoke";

/** REStake grants expire after one year, matching the restake.app / Leap default. */
export const RESTAKE_GRANT_DURATION_SECONDS = 365 * 24 * 60 * 60;

/** The two message type URLs an auto-compound (REStake) grant authorizes a validator's bot to send. */
export const RESTAKE_GRANTED_MSGS = [MSG_DELEGATE, MSG_WITHDRAW_REWARD] as const;

export const msg = {
  send(from: string, to: string, denom: string, amount: bigint): EncodeObject {
    return {
      typeUrl: "/cosmos.bank.v1beta1.MsgSend",
      value: { fromAddress: from, toAddress: to, amount: [{ denom, amount: amount.toString() }] },
    };
  },
  cw20Transfer(from: string, contract: string, to: string, amount: bigint): EncodeObject {
    return {
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: MsgExecuteContract.fromPartial({
        sender: from,
        contract,
        msg: toUtf8(JSON.stringify({ transfer: { recipient: to, amount: amount.toString() } })),
        funds: [],
      }),
    };
  },
  delegate(delegator: string, validator: string, denom: string, amount: bigint): EncodeObject {
    return {
      typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
      value: { delegatorAddress: delegator, validatorAddress: validator, amount: { denom, amount: amount.toString() } },
    };
  },
  undelegate(delegator: string, validator: string, denom: string, amount: bigint): EncodeObject {
    return {
      typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
      value: { delegatorAddress: delegator, validatorAddress: validator, amount: { denom, amount: amount.toString() } },
    };
  },
  redelegate(delegator: string, from: string, to: string, denom: string, amount: bigint): EncodeObject {
    return {
      typeUrl: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
      value: {
        delegatorAddress: delegator,
        validatorSrcAddress: from,
        validatorDstAddress: to,
        amount: { denom, amount: amount.toString() },
      },
    };
  },
  withdrawRewards(delegator: string, validator: string): EncodeObject {
    return {
      typeUrl: MSG_WITHDRAW_REWARD,
      value: { delegatorAddress: delegator, validatorAddress: validator },
    };
  },
  /**
   * "Claim & Restake" on the user's own signature: withdraw the pending reward from a
   * validator, then delegate `amount` of it back. The withdraw runs first, crediting the
   * reward to the account balance the delegate then spends.
   */
  claimAndRestake(delegator: string, validator: string, denom: string, amount: bigint): EncodeObject[] {
    return [this.withdrawRewards(delegator, validator), this.delegate(delegator, validator, denom, amount)];
  },
  /**
   * Auto-compound (REStake): authorize a validator's bot (`grantee`) to claim and re-delegate
   * rewards for `validator` on the granter's behalf. Emits two MsgGrant: a StakeAuthorization
   * restricted to delegating to `validator`, and a generic grant to withdraw rewards. The grant
   * expires at `expirationEpochSeconds` and carries no spend limit, mirroring restake.app.
   */
  grantRestake(granter: string, grantee: string, validator: string, expirationEpochSeconds: number): EncodeObject[] {
    const expiration = { seconds: BigInt(Math.floor(expirationEpochSeconds)), nanos: 0 };
    const stakeAuth: Any = {
      typeUrl: StakeAuthorization.typeUrl,
      value: StakeAuthorization.encode(
        StakeAuthorization.fromPartial({
          authorizationType: AuthorizationType.AUTHORIZATION_TYPE_DELEGATE,
          allowList: { address: [validator] },
        }),
      ).finish(),
    };
    const withdrawAuth: Any = {
      typeUrl: "/cosmos.authz.v1beta1.GenericAuthorization",
      value: GenericAuthorization.encode(GenericAuthorization.fromPartial({ msg: MSG_WITHDRAW_REWARD })).finish(),
    };
    return [stakeAuth, withdrawAuth].map((authorization) => ({
      typeUrl: MSG_GRANT,
      value: { granter, grantee, grant: { authorization, expiration } },
    }));
  },
  /** Turn auto-compound off: revoke both grants previously given to the validator's bot. */
  revokeRestake(granter: string, grantee: string): EncodeObject[] {
    return RESTAKE_GRANTED_MSGS.map((msgTypeUrl) => ({
      typeUrl: MSG_REVOKE,
      value: { granter, grantee, msgTypeUrl },
    }));
  },
  vote(voter: string, proposalId: string, option: VoteOption): EncodeObject {
    const map: Record<VoteOption, ProtoVoteOption> = {
      VOTE_OPTION_YES: ProtoVoteOption.VOTE_OPTION_YES,
      VOTE_OPTION_ABSTAIN: ProtoVoteOption.VOTE_OPTION_ABSTAIN,
      VOTE_OPTION_NO: ProtoVoteOption.VOTE_OPTION_NO,
      VOTE_OPTION_NO_WITH_VETO: ProtoVoteOption.VOTE_OPTION_NO_WITH_VETO,
    };
    return {
      typeUrl: "/cosmos.gov.v1beta1.MsgVote",
      value: { proposalId: BigInt(proposalId), voter, option: map[option] },
    };
  },
  ibcTransfer(
    sender: string,
    receiver: string,
    sourceChannel: string,
    denom: string,
    amount: bigint,
    memo = "",
    timeoutMinutes = 10,
  ): EncodeObject {
    return {
      typeUrl: "/ibc.applications.transfer.v1.MsgTransfer",
      value: {
        sourcePort: "transfer",
        sourceChannel,
        token: { denom, amount: amount.toString() },
        sender,
        receiver,
        timeoutHeight: undefined,
        timeoutTimestamp: BigInt(Date.now() + timeoutMinutes * 60_000) * 1_000_000n,
        memo,
      },
    };
  },
};

export interface MsgSummary {
  kind: "send" | "cw20-send" | "delegate" | "undelegate" | "redelegate" | "claim" | "grant" | "revoke" | "vote" | "ibc" | "swap" | "curve-buy" | "curve-sell" | "contract-execute" | "unknown";
  typeUrl: string;
  fields: Record<string, string>;
  coins?: Array<{ denom: string; amount: string }>;
}

/** A CosmWasm execute message is JSON by convention, not by protocol. */
function parseContractMsg(msg: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(msg));
  } catch {
    return undefined;
  }
}

export function summarize(m: EncodeObject): MsgSummary {
  const v = m.value as Record<string, unknown>;
  const coin = (c: unknown) => c as { denom: string; amount: string };
  switch (m.typeUrl) {
    case "/cosmos.bank.v1beta1.MsgSend":
      return { kind: "send", typeUrl: m.typeUrl, fields: { to: String(v.toAddress) }, coins: (v.amount as unknown[]).map(coin) };
    case "/cosmwasm.wasm.v1.MsgExecuteContract": {
      const exec = v as unknown as MsgExecuteContract;
      const raw = parseContractMsg(exec.msg);
      if (raw === undefined) return { kind: "unknown", typeUrl: m.typeUrl, fields: { contract: exec.contract } };
      const parsed = (raw && typeof raw === "object" ? raw : {}) as { buy?: unknown; sell?: unknown; transfer?: { recipient: string; amount: string } };
      if (parsed.buy && exec.funds.length === 1) {
        return { kind: "curve-buy", typeUrl: m.typeUrl, fields: { contract: exec.contract }, coins: exec.funds.map((c) => ({ denom: c.denom, amount: c.amount })) };
      }
      if (parsed.sell && exec.funds.length === 1) {
        return { kind: "curve-sell", typeUrl: m.typeUrl, fields: { contract: exec.contract }, coins: exec.funds.map((c) => ({ denom: c.denom, amount: c.amount })) };
      }
      if (parsed.transfer) {
        return {
          kind: "cw20-send",
          typeUrl: m.typeUrl,
          fields: { to: parsed.transfer.recipient, contract: exec.contract },
          coins: [{ denom: `cw20:${exec.contract}`, amount: parsed.transfer.amount }],
        };
      }
      return {
        kind: "contract-execute",
        typeUrl: m.typeUrl,
        fields: { contract: exec.contract, msg: JSON.stringify(raw) },
        coins: exec.funds.length ? exec.funds.map((c) => ({ denom: c.denom, amount: c.amount })) : undefined,
      };
    }
    case "/cosmos.staking.v1beta1.MsgDelegate":
      return { kind: "delegate", typeUrl: m.typeUrl, fields: { validator: String(v.validatorAddress) }, coins: [coin(v.amount)] };
    case "/cosmos.staking.v1beta1.MsgUndelegate":
      return { kind: "undelegate", typeUrl: m.typeUrl, fields: { validator: String(v.validatorAddress) }, coins: [coin(v.amount)] };
    case "/cosmos.staking.v1beta1.MsgBeginRedelegate":
      return {
        kind: "redelegate",
        typeUrl: m.typeUrl,
        fields: { from: String(v.validatorSrcAddress), to: String(v.validatorDstAddress) },
        coins: [coin(v.amount)],
      };
    case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":
      return { kind: "claim", typeUrl: m.typeUrl, fields: { validator: String(v.validatorAddress) } };
    case "/cosmos.authz.v1beta1.MsgGrant": {
      const grant = v.grant as { authorization?: { typeUrl?: string } } | undefined;
      const authz = grant?.authorization?.typeUrl === StakeAuthorization.typeUrl ? "restake-delegate" : "restake-withdraw";
      return { kind: "grant", typeUrl: m.typeUrl, fields: { grantee: String(v.grantee), authz } };
    }
    case "/cosmos.authz.v1beta1.MsgRevoke":
      return { kind: "revoke", typeUrl: m.typeUrl, fields: { grantee: String(v.grantee), msg: String(v.msgTypeUrl) } };
    case "/cosmos.gov.v1beta1.MsgVote":
      return { kind: "vote", typeUrl: m.typeUrl, fields: { proposal: String(v.proposalId), option: String(v.option) } };
    case "/ibc.applications.transfer.v1.MsgTransfer":
      return {
        kind: "ibc",
        typeUrl: m.typeUrl,
        fields: { to: String(v.receiver), channel: String(v.sourceChannel) },
        coins: [coin(v.token)],
      };
    case DIRECT_SWAP_TYPE_URL: {
      const d = v as unknown as { poolId: bigint; offerCoin: { denom: string; amount: string }; demandCoinDenom: string };
      return {
        kind: "swap",
        typeUrl: m.typeUrl,
        fields: { pool: String(d.poolId), receive: d.demandCoinDenom },
        coins: [{ denom: d.offerCoin.denom, amount: d.offerCoin.amount }],
      };
    }
    case MsgSwapExactAmountIn.typeUrl: {
      const d = v as unknown as SwapExactAmountInValue;
      return {
        kind: "swap",
        typeUrl: m.typeUrl,
        fields: {
          pool: d.routes.map((r) => r.poolId.toString()).join(" → "),
          receive: d.routes[d.routes.length - 1]?.tokenOutDenom ?? "",
          minReceived: d.tokenOutMinAmount,
        },
        coins: [{ denom: d.tokenIn.denom, amount: d.tokenIn.amount }],
      };
    }
    case MsgSplitRouteSwapExactAmountIn.typeUrl: {
      const d = v as unknown as SplitRouteSwapExactAmountInValue;
      const total = d.routes.reduce((sum, r) => sum + BigInt(r.tokenInAmount || "0"), 0n);
      const last = d.routes[0]?.pools[d.routes[0].pools.length - 1];
      return {
        kind: "swap",
        typeUrl: m.typeUrl,
        fields: {
          pool: d.routes.map((r) => r.pools.map((p) => p.poolId.toString()).join(" → ")).join(" | "),
          receive: last?.tokenOutDenom ?? "",
          minReceived: d.tokenOutMinAmount,
        },
        coins: [{ denom: d.tokenInDenom, amount: total.toString() }],
      };
    }
    default:
      return { kind: "unknown", typeUrl: m.typeUrl, fields: {} };
  }
}

export function msgsToJson(msgs: EncodeObject[]): string {
  return JSON.stringify(
    msgs.map((m) => {
      const value = m.typeUrl === "/cosmwasm.wasm.v1.MsgExecuteContract"
        ? { ...(m.value as MsgExecuteContract), msg: parseContractMsg((m.value as MsgExecuteContract).msg) ?? toBase64((m.value as MsgExecuteContract).msg) }
        : m.value;
      return { "@type": m.typeUrl, ...value };
    }),
    (_k, val) => (typeof val === "bigint" ? val.toString() : val),
    2,
  );
}

export function explainTxError(e: unknown): string {
  const s = e instanceof Error ? e.message : String(e);
  if (/insufficient funds|insufficient fee|spendable balance .* is smaller/i.test(s)) return "insufficient-funds";
  if (/account .* not found/i.test(s)) return "account-not-found";
  if (/out of gas/i.test(s)) return "out-of-gas";
  if (/request rejected|rejected by user|user denied|cancel/i.test(s)) return "rejected";
  if (/timed out|timeout/i.test(s)) return "timeout";
  if (/failed to fetch|network|ECONN|Load failed/i.test(s)) return "network";
  return s;
}
