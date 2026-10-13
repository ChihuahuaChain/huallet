import { toUtf8 } from "@cosmjs/encoding";
import type { EncodeObject } from "@cosmjs/proto-signing";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import type { ChainInfo } from "../chains/types";
import { wasmSmartQuery } from "../cosmos/rest";

/**
 * NYM is not staked through x/staking (that is NYX, the Nyx validator token): it is delegated to
 * Nym network nodes through the mixnet CosmWasm contract. Delegations and undelegations are queued
 * and applied when the current epoch (one hour) ends; rewards can be withdrawn at any time.
 */
export const NYX_CHAIN_ID = "nyx";
export const NYM_MIXNET_CONTRACT = "n17srjznxl9dvzdkpwpw24gg668wc73val88a6m5ajg6ankwvz9wtst0cznr";
export const NYM_DENOM = "unym";

/** Node list with names, scores and saturation (the feed the Nym explorer uses). */
const SPECTRE_NODES_URL = "https://api.nym.spectredao.net/api/v1/nodes?limit=2000";
/** Official Nym API: complete bonded set, but without names or scores. */
const NYM_API_BONDED_URL = "https://validator.nymtech.net/api/v1/nym-nodes/bonded";

function execute(sender: string, msg: unknown, funds: Array<{ denom: string; amount: string }> = []): EncodeObject {
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({ sender, contract: NYM_MIXNET_CONTRACT, msg: toUtf8(JSON.stringify(msg)), funds }),
  };
}

export const nymMsg = {
  delegate(sender: string, nodeId: number, amount: bigint): EncodeObject {
    return execute(sender, { delegate: { node_id: nodeId } }, [{ denom: NYM_DENOM, amount: amount.toString() }]);
  },
  /** Removes the whole delegation to the node; its pending rewards are paid out with it. */
  undelegate(sender: string, nodeId: number): EncodeObject {
    return execute(sender, { undelegate: { node_id: nodeId } });
  },
  withdrawReward(sender: string, nodeId: number): EncodeObject {
    return execute(sender, { withdraw_delegator_reward: { node_id: nodeId } });
  },
};

/** The node a mixnet-contract message targets, or undefined for any other message. */
export function mixnetAction(contract: string, msg: unknown): { kind: "delegate" | "undelegate" | "claim"; nodeId: number } | undefined {
  if (contract !== NYM_MIXNET_CONTRACT || !msg || typeof msg !== "object") return undefined;
  const m = msg as Record<string, { node_id?: unknown } | undefined>;
  const pick = (key: string) => (typeof m[key]?.node_id === "number" ? (m[key]!.node_id as number) : undefined);
  const d = pick("delegate");
  if (d !== undefined) return { kind: "delegate", nodeId: d };
  const u = pick("undelegate");
  if (u !== undefined) return { kind: "undelegate", nodeId: u };
  const w = pick("withdraw_delegator_reward");
  if (w !== undefined) return { kind: "claim", nodeId: w };
  return undefined;
}

export interface NymDelegation {
  nodeId: number;
  amount: bigint;
  /** Set for legacy delegations made through the vesting contract; those can't be managed here. */
  proxy: string | null;
}

interface RawDelegation {
  node_id: number;
  amount: { denom: string; amount: string };
  proxy: string | null;
}

export async function getNymDelegations(chain: ChainInfo, delegator: string): Promise<NymDelegation[]> {
  const out: NymDelegation[] = [];
  let startAfter: unknown = undefined;
  for (let page = 0; page < 20; page++) {
    const r: { delegations: RawDelegation[]; start_next_after?: unknown } = await wasmSmartQuery(chain, NYM_MIXNET_CONTRACT, {
      get_delegator_delegations: { delegator, start_after: startAfter, limit: 100 },
    });
    out.push(...r.delegations.map((d) => ({ nodeId: d.node_id, amount: BigInt(d.amount.amount), proxy: d.proxy })));
    if (!r.start_next_after || r.delegations.length === 0) break;
    startAfter = r.start_next_after;
  }
  return out;
}

export async function getNymPendingReward(chain: ChainInfo, address: string, nodeId: number): Promise<bigint> {
  const r = await wasmSmartQuery<{ amount_earned: { amount: string } | null }>(chain, NYM_MIXNET_CONTRACT, {
    get_pending_delegator_reward: { address, node_id: nodeId },
  });
  return BigInt(r.amount_earned?.amount ?? "0");
}

export interface NymPendingEvent {
  kind: "delegate" | "undelegate";
  nodeId: number;
  amount?: bigint;
}

/** This address's delegate/undelegate requests waiting for the epoch to end, and how long that is. */
export async function getNymPendingEvents(chain: ChainInfo, owner: string): Promise<{ events: NymPendingEvent[]; secondsLeft: number }> {
  const events: NymPendingEvent[] = [];
  let secondsLeft = 0;
  let startAfter: number | undefined;
  for (let page = 0; page < 20; page++) {
    const r: {
      seconds_until_executable: number;
      events: Array<{ event: { kind: Record<string, { owner?: string; node_id?: number; amount?: { amount: string } }> } }>;
      start_next_after?: number | null;
    } = await wasmSmartQuery(chain, NYM_MIXNET_CONTRACT, { get_pending_epoch_events: { start_after: startAfter, limit: 100 } });
    secondsLeft = Math.max(0, r.seconds_until_executable);
    for (const e of r.events) {
      for (const kind of ["delegate", "undelegate"] as const) {
        const v = e.event.kind[kind];
        if (v?.owner === owner && typeof v.node_id === "number") {
          events.push({ kind, nodeId: v.node_id, amount: v.amount ? BigInt(v.amount.amount) : undefined });
        }
      }
    }
    if (r.start_next_after == null || r.events.length === 0) break;
    startAfter = r.start_next_after;
  }
  return { events, secondsLeft };
}

export interface NymNode {
  id: number;
  name?: string;
  website?: string;
  country?: string;
  /** Operator pledge plus delegations, in unym. */
  totalStake: bigint;
  /** Share of the saturation point, capped at 1; past it extra stake earns nothing more. */
  saturation: number;
  profitMargin: number;
  /** Fixed cost the operator takes per interval (720 epochs), in unym. */
  operatingCost: bigint;
  /** 0–1, undefined when the feed doesn't report it. */
  performance?: number;
  delegators: number;
}

interface RewardingDetails {
  cost_params: { profit_margin_percent: string; interval_operating_cost: { amount: string } };
  operator: string;
  delegates: string;
  unique_delegations: number;
}

/** Operators often leave the moniker as a placeholder such as "N/A"; those read as unnamed. */
function realName(s?: string): string | undefined {
  const v = s?.trim();
  return v && !/^(n\/?a|none|null|-+|\?+)$/i.test(v) ? v : undefined;
}

const decToBig = (s: string) => BigInt(s.split(".")[0] || "0");

async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function nodesFromSpectre(): Promise<NymNode[]> {
  const rows = await fetchJson<
    Array<{
      node_id: number;
      bonded: boolean;
      total_stake: number;
      uptime?: number;
      performance_score?: number;
      stake_saturation?: number;
      rewarding_details?: RewardingDetails;
      self_description?: { moniker?: string; website?: string } | null;
      geoip?: { country?: string } | null;
    }>
  >(SPECTRE_NODES_URL);
  return rows
    .filter((n) => n.bonded && n.rewarding_details)
    .map((n) => {
      const rd = n.rewarding_details!;
      return {
        id: n.node_id,
        name: realName(n.self_description?.moniker),
        website: n.self_description?.website?.trim() || undefined,
        country: n.geoip?.country || undefined,
        totalStake: decToBig(rd.operator) + decToBig(rd.delegates),
        saturation: n.stake_saturation ?? 0,
        profitMargin: Number(rd.cost_params.profit_margin_percent),
        operatingCost: BigInt(rd.cost_params.interval_operating_cost.amount),
        performance: n.performance_score ?? n.uptime,
        delegators: rd.unique_delegations,
      };
    });
}

async function nodesFromNymApi(chain: ChainInfo): Promise<NymNode[]> {
  const [bonded, params] = await Promise.all([
    fetchJson<{ data: Array<{ bond_information: { node_id: number; is_unbonding: boolean }; rewarding_details: RewardingDetails }> }>(NYM_API_BONDED_URL),
    wasmSmartQuery<{ interval: { stake_saturation_point: string } }>(chain, NYM_MIXNET_CONTRACT, { get_rewarding_params: {} }),
  ]);
  const point = Number(params.interval.stake_saturation_point);
  return bonded.data
    .filter((n) => !n.bond_information.is_unbonding)
    .map((n) => {
      const rd = n.rewarding_details;
      const totalStake = decToBig(rd.operator) + decToBig(rd.delegates);
      return {
        id: n.bond_information.node_id,
        totalStake,
        saturation: point > 0 ? Math.min(1, Number(totalStake) / point) : 0,
        profitMargin: Number(rd.cost_params.profit_margin_percent),
        operatingCost: BigInt(rd.cost_params.interval_operating_cost.amount),
        delegators: rd.unique_delegations,
      };
    });
}

export async function getNymNodes(chain: ChainInfo): Promise<NymNode[]> {
  try {
    return await nodesFromSpectre();
  } catch {
    return nodesFromNymApi(chain);
  }
}
