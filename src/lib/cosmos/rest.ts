import type { ChainInfo } from "../chains/types";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const preferred = new Map<string, string>();

export function restEndpoints(chain: ChainInfo): string[] {
  const all = [chain.rest, ...(chain.restFallbacks ?? [])];
  const p = preferred.get(chain.chainId);
  return p ? [p, ...all.filter((u) => u !== p)] : all;
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) msg = body.message;
      } catch {
      }
      throw new HttpError(res.status, msg);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function restGet<T>(chain: ChainInfo, path: string, timeoutMs = 12_000): Promise<T> {
  let lastErr: unknown;
  for (const base of restEndpoints(chain)) {
    try {
      const out = await fetchJson<T>(base + path, timeoutMs);
      preferred.set(chain.chainId, base);
      return out;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All endpoints failed");
}

const enc = encodeURIComponent;

export interface Coin {
  denom: string;
  amount: string;
}

export interface Validator {
  operator_address: string;
  jailed: boolean;
  status: string;
  tokens: string;
  description: { moniker: string; identity?: string; website?: string; details?: string; security_contact?: string };
  commission: { commission_rates: { rate: string; max_rate: string; max_change_rate: string } };
}

export interface Delegation {
  delegation: { delegator_address: string; validator_address: string; shares: string };
  balance: Coin;
}

export interface UnbondingDelegation {
  validator_address: string;
  entries: Array<{ creation_height: string; completion_time: string; balance: string }>;
}

export interface Rewards {
  rewards: Array<{ validator_address: string; reward: Array<{ denom: string; amount: string }> }>;
  total: Array<{ denom: string; amount: string }>;
}

export type ProposalStatus =
  | "PROPOSAL_STATUS_DEPOSIT_PERIOD"
  | "PROPOSAL_STATUS_VOTING_PERIOD"
  | "PROPOSAL_STATUS_PASSED"
  | "PROPOSAL_STATUS_REJECTED"
  | "PROPOSAL_STATUS_FAILED";

export interface Proposal {
  id: string;
  title: string;
  summary: string;
  status: ProposalStatus;
  votingStart?: string;
  votingEnd?: string;
  submitTime?: string;
  messageTypes: string[];
  tally?: TallyResult;
  expedited?: boolean;
}

export interface TallyResult {
  yes: string;
  no: string;
  abstain: string;
  noWithVeto: string;
}

export type VoteOption = "VOTE_OPTION_YES" | "VOTE_OPTION_ABSTAIN" | "VOTE_OPTION_NO" | "VOTE_OPTION_NO_WITH_VETO";

export async function getNodeChainId(chain: ChainInfo): Promise<string> {
  const r = await restGet<{ default_node_info?: { network: string }; node_info?: { network: string } }>(
    chain,
    "/cosmos/base/tendermint/v1beta1/node_info",
  );
  return r.default_node_info?.network ?? r.node_info?.network ?? "";
}

export async function probeRest(url: string): Promise<string> {
  const r = await fetchJson<{ default_node_info?: { network: string } }>(
    url.replace(/\/+$/, "") + "/cosmos/base/tendermint/v1beta1/node_info",
    10_000,
  );
  return r.default_node_info?.network ?? "";
}

export async function probeRpc(url: string): Promise<string> {
  const r = await fetchJson<{ result?: { node_info?: { network: string } } }>(url.replace(/\/+$/, "") + "/status", 10_000);
  return r.result?.node_info?.network ?? "";
}

export async function getBalances(chain: ChainInfo, address: string): Promise<Coin[]> {
  const r = await restGet<{ balances: Coin[] }>(chain, `/cosmos/bank/v1beta1/balances/${enc(address)}?pagination.limit=1000`);
  return r.balances;
}

export interface DenomMetadata {
  base: string;
  display: string;
  symbol?: string;
  name?: string;
  uri?: string;
  denom_units: Array<{ denom: string; exponent: number }>;
}

export async function getDenomMetadata(chain: ChainInfo, denom: string): Promise<DenomMetadata | undefined> {
  try {
    const r = await restGet<{ metadata: DenomMetadata }>(chain, `/cosmos/bank/v1beta1/denoms_metadata_by_query_string?denom=${enc(denom)}`);
    return r.metadata;
  } catch {
    return undefined;
  }
}

export interface DenomTrace {
  path: string;
  baseDenom: string;
}

export async function getDenomTrace(chain: ChainInfo, ibcDenom: string): Promise<DenomTrace | undefined> {
  const hash = ibcDenom.replace(/^ibc\//, "");
  try {
    const r = await restGet<{ denom: { base: string; trace: Array<{ port_id: string; channel_id: string }> } }>(
      chain,
      `/ibc/apps/transfer/v1/denoms/${enc(hash)}`,
    );
    return { baseDenom: r.denom.base, path: r.denom.trace.map((t) => `${t.port_id}/${t.channel_id}`).join("/") };
  } catch {
  }
  try {
    const r = await restGet<{ denom_trace: { path: string; base_denom: string } }>(chain, `/ibc/apps/transfer/v1/denom_traces/${enc(hash)}`);
    return { baseDenom: r.denom_trace.base_denom, path: r.denom_trace.path };
  } catch {
    return undefined;
  }
}

export interface ChannelInfo {
  state: string;
  counterpartyChannel: string;
  counterpartyChainId?: string;
}

export async function getTransferChannel(chain: ChainInfo, channelId: string): Promise<ChannelInfo> {
  const ch = await restGet<{ channel: { state: string; counterparty: { channel_id: string } } }>(
    chain,
    `/ibc/core/channel/v1/channels/${enc(channelId)}/ports/transfer`,
  );
  let counterpartyChainId: string | undefined;
  try {
    const cs = await restGet<{ identified_client_state: { client_state: { chain_id?: string } } }>(
      chain,
      `/ibc/core/channel/v1/channels/${enc(channelId)}/ports/transfer/client_state`,
    );
    counterpartyChainId = cs.identified_client_state.client_state.chain_id;
  } catch {
  }
  return { state: ch.channel.state, counterpartyChannel: ch.channel.counterparty.channel_id, counterpartyChainId };
}

export async function getValidators(chain: ChainInfo, status = "BOND_STATUS_BONDED"): Promise<Validator[]> {
  const r = await restGet<{ validators: Validator[] }>(
    chain,
    `/cosmos/staking/v1beta1/validators?status=${status}&pagination.limit=1000`,
  );
  return r.validators;
}

export async function getAllValidators(chain: ChainInfo): Promise<Validator[]> {
  const r = await restGet<{ validators: Validator[] }>(chain, `/cosmos/staking/v1beta1/validators?pagination.limit=2000`);
  return r.validators;
}

/**
 * Validator logos (valoper → image URL) from the public validator registry (cosmos.directory).
 * Validators without a logo are simply absent; callers fall back to initials.
 */
export async function getValidatorLogos(registrySlug: string): Promise<Record<string, string>> {
  const r = await fetchJson<{ validators?: Array<{ operator_address?: string; image?: string; keybase_image?: string }> }>(
    `https://validators.cosmos.directory/chains/${enc(registrySlug)}`,
    15_000,
  );
  const out: Record<string, string> = {};
  for (const v of r.validators ?? []) {
    const img = v.image ?? v.keybase_image;
    if (v.operator_address && img && img.startsWith("https://")) out[v.operator_address] = img;
  }
  return out;
}

export async function getDelegations(chain: ChainInfo, address: string): Promise<Delegation[]> {
  try {
    const r = await restGet<{ delegation_responses: Delegation[] }>(
      chain,
      `/cosmos/staking/v1beta1/delegations/${enc(address)}?pagination.limit=500`,
    );
    return r.delegation_responses;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}

export async function getUnbondings(chain: ChainInfo, address: string): Promise<UnbondingDelegation[]> {
  try {
    const r = await restGet<{ unbonding_responses: UnbondingDelegation[] }>(
      chain,
      `/cosmos/staking/v1beta1/delegators/${enc(address)}/unbonding_delegations?pagination.limit=500`,
    );
    return r.unbonding_responses;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}

export async function getRewards(chain: ChainInfo, address: string): Promise<Rewards> {
  try {
    return await restGet<Rewards>(chain, `/cosmos/distribution/v1beta1/delegators/${enc(address)}/rewards`);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return { rewards: [], total: [] };
    throw e;
  }
}

export interface AuthzGrant {
  grantee: string;
  /** The authorization's "@type" Any URL. */
  type: string;
  /** For a GenericAuthorization, the message type URL it authorizes. */
  msg?: string;
  /** For a StakeAuthorization, the validators the grantee may delegate to. */
  allowList?: string[];
  expiration: string | null;
}

/** All authz grants given BY `granter` (used to detect which validators have auto-compound on). */
export async function getGrants(chain: ChainInfo, granter: string): Promise<AuthzGrant[]> {
  try {
    const r = await restGet<{
      grants?: Array<{
        grantee: string;
        authorization: { "@type": string; msg?: string; allow_list?: { address?: string[] } };
        expiration: string | null;
      }>;
    }>(chain, `/cosmos/authz/v1beta1/grants/granter/${enc(granter)}`);
    return (r.grants ?? []).map((g) => ({
      grantee: g.grantee,
      type: g.authorization?.["@type"] ?? "",
      msg: g.authorization?.msg,
      allowList: g.authorization?.allow_list?.address,
      expiration: g.expiration ?? null,
    }));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}

export interface RestakeOperator {
  moniker: string;
  valoper: string;
  /** The validator's bot account — the grantee of a REStake grant, never the valoper. */
  botAddress: string;
  /** How often the bot compounds, e.g. "every 1 hour" or "21:00"; free-form from the registry. */
  runTime: string;
  /** Minimum pending reward (base units) before the bot compounds. */
  minimumReward: string;
}

/**
 * REStake operators for a chain, read from the public validator registry (cosmos.directory).
 * Only validators that actually run the auto-compound bot appear here, so the wallet can offer
 * auto-compound exclusively toward an operator whose grant will really be executed.
 */
export async function getRestakeOperators(registrySlug: string): Promise<RestakeOperator[]> {
  const r = await fetchJson<{
    validators?: Array<{
      moniker?: string;
      operator_address?: string;
      restake?: { address?: string; run_time?: string | string[]; minimum_reward?: number | string };
    }>;
  }>(`https://validators.cosmos.directory/chains/${enc(registrySlug)}`, 15_000);
  return (r.validators ?? [])
    .filter((v) => v.operator_address && v.restake?.address)
    .map((v) => ({
      moniker: v.moniker ?? v.operator_address!,
      valoper: v.operator_address!,
      botAddress: v.restake!.address!,
      runTime: Array.isArray(v.restake!.run_time) ? v.restake!.run_time.join(", ") : String(v.restake!.run_time ?? ""),
      minimumReward: String(v.restake!.minimum_reward ?? "0"),
    }));
}

export interface StakingParams {
  unbondingTimeSeconds: number;
  bondDenom: string;
  bondedTokens: bigint;
}

export async function getStakingInfo(chain: ChainInfo): Promise<StakingParams> {
  const [params, pool] = await Promise.all([
    restGet<{ params: { unbonding_time: string; bond_denom: string } }>(chain, "/cosmos/staking/v1beta1/params"),
    restGet<{ pool: { bonded_tokens: string } }>(chain, "/cosmos/staking/v1beta1/pool"),
  ]);
  return {
    unbondingTimeSeconds: parseInt(params.params.unbonding_time, 10) || 0,
    bondDenom: params.params.bond_denom,
    bondedTokens: BigInt(pool.pool.bonded_tokens),
  };
}

export async function getStakingApr(chain: ChainInfo): Promise<number | undefined> {
  try {
    const [prov, dist, info] = await Promise.all([
      restGet<{ annual_provisions: string }>(chain, "/cosmos/mint/v1beta1/annual_provisions"),
      restGet<{ params: { community_tax: string } }>(chain, "/cosmos/distribution/v1beta1/params"),
      getStakingInfo(chain),
    ]);
    const provisions = Number(prov.annual_provisions);
    const tax = Number(dist.params.community_tax);
    const bonded = Number(info.bondedTokens);
    if (!provisions || !bonded) return undefined;
    return (provisions * (1 - tax)) / bonded;
  } catch {
    return undefined;
  }
}

interface V1Proposal {
  id: string;
  title?: string;
  summary?: string;
  metadata?: string;
  status: ProposalStatus;
  voting_start_time?: string;
  voting_end_time?: string;
  submit_time?: string;
  messages?: Array<{ "@type": string; content?: { "@type": string; title?: string; description?: string } }>;
  final_tally_result?: { yes_count: string; no_count: string; abstain_count: string; no_with_veto_count: string };
  expedited?: boolean;
}

interface V1Beta1Proposal {
  proposal_id: string;
  content: { "@type": string; title?: string; description?: string };
  status: ProposalStatus;
  voting_start_time?: string;
  voting_end_time?: string;
  submit_time?: string;
  final_tally_result?: { yes: string; no: string; abstain: string; no_with_veto: string };
}

function fromV1(p: V1Proposal): Proposal {
  const legacy = p.messages?.find((m) => m.content)?.content;
  let title = p.title || legacy?.title || "";
  let summary = p.summary || legacy?.description || "";
  if (!title && p.metadata) {
    try {
      const md = JSON.parse(p.metadata);
      title = md.title ?? "";
      summary = summary || md.summary || md.description || "";
    } catch {
    }
  }
  const t = p.final_tally_result;
  return {
    id: p.id,
    title: title || `Proposal #${p.id}`,
    summary,
    status: p.status,
    votingStart: p.voting_start_time,
    votingEnd: p.voting_end_time,
    submitTime: p.submit_time,
    messageTypes: p.messages?.map((m) => m.content?.["@type"] ?? m["@type"]) ?? [],
    tally: t ? { yes: t.yes_count, no: t.no_count, abstain: t.abstain_count, noWithVeto: t.no_with_veto_count } : undefined,
    expedited: p.expedited,
  };
}

function fromV1Beta1(p: V1Beta1Proposal): Proposal {
  const t = p.final_tally_result;
  return {
    id: p.proposal_id,
    title: p.content?.title || `Proposal #${p.proposal_id}`,
    summary: p.content?.description ?? "",
    status: p.status,
    votingStart: p.voting_start_time,
    votingEnd: p.voting_end_time,
    submitTime: p.submit_time,
    messageTypes: p.content ? [p.content["@type"]] : [],
    tally: t ? { yes: t.yes, no: t.no, abstain: t.abstain, noWithVeto: t.no_with_veto } : undefined,
  };
}

export async function getProposals(chain: ChainInfo, limit = 50): Promise<Proposal[]> {
  const q = `pagination.limit=${limit}&pagination.reverse=true`;
  try {
    const r = await restGet<{ proposals: V1Proposal[] }>(chain, `/cosmos/gov/v1/proposals?${q}`);
    return r.proposals.map(fromV1);
  } catch (e) {
    if (e instanceof HttpError && e.status !== 404 && e.status !== 501) throw e;
    const r = await restGet<{ proposals: V1Beta1Proposal[] }>(chain, `/cosmos/gov/v1beta1/proposals?${q}`);
    return r.proposals.map(fromV1Beta1);
  }
}

export async function getProposal(chain: ChainInfo, id: string): Promise<Proposal> {
  try {
    const r = await restGet<{ proposal: V1Proposal }>(chain, `/cosmos/gov/v1/proposals/${enc(id)}`);
    return fromV1(r.proposal);
  } catch (e) {
    if (e instanceof HttpError && e.status !== 404 && e.status !== 501) throw e;
    const r = await restGet<{ proposal: V1Beta1Proposal }>(chain, `/cosmos/gov/v1beta1/proposals/${enc(id)}`);
    return fromV1Beta1(r.proposal);
  }
}

export async function getLiveTally(chain: ChainInfo, id: string): Promise<TallyResult | undefined> {
  try {
    const r = await restGet<{ tally: { yes_count: string; no_count: string; abstain_count: string; no_with_veto_count: string } }>(
      chain,
      `/cosmos/gov/v1/proposals/${enc(id)}/tally`,
    );
    return { yes: r.tally.yes_count, no: r.tally.no_count, abstain: r.tally.abstain_count, noWithVeto: r.tally.no_with_veto_count };
  } catch {
    return undefined;
  }
}

export async function getMyVote(chain: ChainInfo, id: string, voter: string): Promise<VoteOption | undefined> {
  try {
    const r = await restGet<{ vote: { options: Array<{ option: VoteOption; weight: string }> } }>(
      chain,
      `/cosmos/gov/v1/proposals/${enc(id)}/votes/${enc(voter)}`,
    );
    const opts = r.vote.options;
    return opts.reduce((a, b) => (Number(b.weight) > Number(a.weight) ? b : a), opts[0])?.option;
  } catch {
    return undefined;
  }
}

export interface TxResponse {
  txhash: string;
  height: string;
  code: number;
  timestamp: string;
  raw_log?: string;
  gas_used?: string;
  tx: {
    body: { messages: Array<Record<string, unknown> & { "@type": string }>; memo: string };
    auth_info: { fee: { amount: Coin[] } };
  };
}

async function searchTxs(chain: ChainInfo, event: string, limit: number): Promise<TxResponse[]> {
  const common = `pagination.limit=${limit}&order_by=ORDER_BY_DESC`;
  try {
    const r = await restGet<{ tx_responses: TxResponse[] }>(chain, `/cosmos/tx/v1beta1/txs?query=${enc(event)}&${common}&limit=${limit}&page=1`);
    return r.tx_responses ?? [];
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    const r = await restGet<{ tx_responses: TxResponse[] }>(chain, `/cosmos/tx/v1beta1/txs?events=${enc(event)}&${common}`);
    return r.tx_responses ?? [];
  }
}

export async function getAccountTxs(chain: ChainInfo, address: string, limit = 25): Promise<TxResponse[]> {
  const [sent, received] = await Promise.all([
    searchTxs(chain, `message.sender='${address}'`, limit),
    searchTxs(chain, `transfer.recipient='${address}'`, limit).catch(() => [] as TxResponse[]),
  ]);
  const byHash = new Map<string, TxResponse>();
  for (const tx of [...sent, ...received]) byHash.set(tx.txhash, tx);
  return [...byHash.values()].sort((a, b) => Number(b.height) - Number(a.height)).slice(0, limit);
}

function b64json(obj: unknown): string {
  return btoa(JSON.stringify(obj));
}

export async function wasmSmartQuery<T>(chain: ChainInfo, contract: string, query: unknown): Promise<T> {
  const r = await restGet<{ data: T }>(chain, `/cosmwasm/wasm/v1/contract/${enc(contract)}/smart/${enc(b64json(query))}`);
  return r.data;
}

export interface Cw20Info {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
}

export async function getCw20Info(chain: ChainInfo, contract: string): Promise<Cw20Info> {
  return wasmSmartQuery<Cw20Info>(chain, contract, { token_info: {} });
}

export async function getCw20Balance(chain: ChainInfo, contract: string, address: string): Promise<string> {
  const r = await wasmSmartQuery<{ balance: string }>(chain, contract, { balance: { address } });
  return r.balance;
}
