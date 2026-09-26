import { fromUtf8, toUtf8 } from "@cosmjs/encoding";
import { Registry, type EncodeObject, type GeneratedType, type OfflineSigner } from "@cosmjs/proto-signing";
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
import type { Any } from "cosmjs-types/google/protobuf/any";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import type { ChainInfo, FeeCurrency } from "../chains/types";
import { feeCurrencyOf } from "../chains/types";
import { toBaseUnits } from "../format";
import { DIRECT_SWAP_TYPE_URL } from "../dex/huahuaswap";
import { directSwapAminoConverter, MsgDirectSwap } from "../dex/msgDirectSwap";
import type { VoteOption } from "./rest";

export const registry = new Registry([
  ...defaultRegistryTypes,
  ["/cosmwasm.wasm.v1.MsgExecuteContract", MsgExecuteContract],
  [MsgDirectSwap.typeUrl, MsgDirectSwap as unknown as GeneratedType],
]);

export const aminoTypes = new AminoTypes({
  [MsgDirectSwap.typeUrl]: directSwapAminoConverter,
  ...createDefaultAminoConverters(),
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

export const GAS_ADJUSTMENT = 1.4;

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

export async function simulate(chain: ChainInfo, signer: OfflineSigner, msgs: EncodeObject[], memo: string): Promise<Simulation> {
  const { client, address } = await connect(chain, signer);
  try {
    const gasUsed = await client.simulate(address, msgs, memo);
    return { gasUsed, gasLimit: Math.ceil(gasUsed * GAS_ADJUSTMENT) };
  } finally {
    client.disconnect();
  }
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
      typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
      value: { delegatorAddress: delegator, validatorAddress: validator },
    };
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
  kind: "send" | "cw20-send" | "delegate" | "undelegate" | "redelegate" | "claim" | "vote" | "ibc" | "swap" | "curve-buy" | "curve-sell" | "unknown";
  typeUrl: string;
  fields: Record<string, string>;
  coins?: Array<{ denom: string; amount: string }>;
}

export function summarize(m: EncodeObject): MsgSummary {
  const v = m.value as Record<string, unknown>;
  const coin = (c: unknown) => c as { denom: string; amount: string };
  switch (m.typeUrl) {
    case "/cosmos.bank.v1beta1.MsgSend":
      return { kind: "send", typeUrl: m.typeUrl, fields: { to: String(v.toAddress) }, coins: (v.amount as unknown[]).map(coin) };
    case "/cosmwasm.wasm.v1.MsgExecuteContract": {
      const exec = v as unknown as MsgExecuteContract;
      const parsed = JSON.parse(new TextDecoder().decode(exec.msg));
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
      return { kind: "unknown", typeUrl: m.typeUrl, fields: { contract: exec.contract, msg: JSON.stringify(parsed) } };
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
    default:
      return { kind: "unknown", typeUrl: m.typeUrl, fields: {} };
  }
}

export function msgsToJson(msgs: EncodeObject[]): string {
  return JSON.stringify(
    msgs.map((m) => {
      const value = m.typeUrl === "/cosmwasm.wasm.v1.MsgExecuteContract"
        ? { ...(m.value as MsgExecuteContract), msg: JSON.parse(new TextDecoder().decode((m.value as MsgExecuteContract).msg)) }
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
