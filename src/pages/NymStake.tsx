import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Clock, ExternalLink, Info, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Amount, Fiat } from "@/components/Amount";
import { PageHeader } from "@/components/layout/AppShell";
import { SortSelect } from "@/components/SortSelect";
import { requestTx } from "@/components/TxModal";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Monogram, Skeleton, TokenIcon } from "@/components/ui";
import { useAddress, useBalanceOf, usePrices } from "@/hooks/queries";
import { useLocale, useT } from "@/i18n";
import { feeCurrencyOf, type ChainInfo, type Currency } from "@/lib/chains/types";
import { computeFee } from "@/lib/cosmos/tx";
import { formatPercent, fromBaseUnits, timeUntil, toBaseUnits, toNumber } from "@/lib/format";
import {
  getNymDelegations,
  getNymNodes,
  getNymPendingEvents,
  getNymPendingReward,
  NYM_DENOM,
  NYX_CHAIN_ID,
  nymMsg,
  type NymNode,
} from "@/lib/nym/mixnet";
import { useAllChains } from "@/state/chains";
import { useSortPref } from "@/state/settings";

const MIN = 60_000;
const NODE_SORTS = ["performance", "stake", "saturation", "margin", "nameAsc", "nameDesc"] as const;
const PAGE = 50;
/** At or past this share of the saturation point a node is flagged as a poor pick. */
const SATURATED = 0.95;
const LOW_PERFORMANCE = 0.8;

const FALLBACK_NYM: Currency = { coinDenom: "NYM", coinMinimalDenom: NYM_DENOM, coinDecimals: 6, coinGeckoId: "nym" };

function nymCurrencyOf(chain: ChainInfo): Currency {
  return chain.currencies.find((c) => c.coinMinimalDenom === NYM_DENOM) ?? FALLBACK_NYM;
}

/** NYM kept back for fees when they are paid in NYM too. */
function feeReserve(chain: ChainInfo): bigint {
  const fc = feeCurrencyOf(chain);
  return fc.coinMinimalDenom === NYM_DENOM ? BigInt(computeFee(fc, "high", 400_000).amount[0].amount) : 0n;
}

function nodeName(t: ReturnType<typeof useT>, node: NymNode | undefined, id: number): string {
  return node?.name ?? t("nym.node", { id });
}

function safeUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function NymStake() {
  const chain = useAllChains().find((c) => c.chainId === NYX_CHAIN_ID);
  if (!chain) return <Navigate to="/stake" replace />;
  return <NymStakeInner chain={chain} />;
}

function NymStakeInner({ chain }: { chain: ChainInfo }) {
  const t = useT();
  const locale = useLocale();
  const cur = nymCurrencyOf(chain);
  const address = useAddress(chain);
  const available = useBalanceOf(chain, address, NYM_DENOM);
  const price = usePrices(cur.coinGeckoId ? [cur.coinGeckoId] : []).data?.[cur.coinGeckoId ?? ""];

  const nodes = useQuery({ queryKey: ["nym-nodes", chain.chainId], queryFn: () => getNymNodes(chain), staleTime: 10 * MIN });
  const delegations = useQuery({
    queryKey: ["nym-delegations", chain.chainId, address],
    queryFn: () => getNymDelegations(chain, address!),
    enabled: !!address,
    refetchInterval: MIN,
  });
  const delegated = delegations.data ?? [];
  const rewards = useQuery({
    queryKey: ["nym-rewards", chain.chainId, address, delegated.map((d) => d.nodeId).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(delegated.map(async (d) => [d.nodeId, await getNymPendingReward(chain, address!, d.nodeId)] as const));
      return new Map(entries);
    },
    enabled: !!address && delegated.length > 0,
    refetchInterval: MIN,
  });
  const pending = useQuery({
    queryKey: ["nym-pending", chain.chainId, address],
    queryFn: () => getNymPendingEvents(chain, address!),
    enabled: !!address,
    refetchInterval: 30_000,
  });

  const [search, setSearch] = useState("");
  const [sort, setSort] = useSortPref("nymNodes", NODE_SORTS, "performance");
  const [shown, setShown] = useState(PAGE);
  const [delegateTo, setDelegateTo] = useState<{ id: number; node?: NymNode } | null>(null);
  const [undelegate, setUndelegate] = useState<{ id: number; amount: bigint } | null>(null);
  // Re-render every half minute so the epoch countdown stays current between refetches.
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(h);
  }, []);

  const byId = useMemo(() => new Map((nodes.data ?? []).map((n) => [n.id, n])), [nodes.data]);
  const rewardOf = (id: number) => rewards.data?.get(id) ?? 0n;
  const totalDelegated = delegated.reduce((s, d) => s + d.amount, 0n);
  const totalRewards = delegated.reduce((s, d) => s + rewardOf(d.nodeId), 0n);
  const claimable = delegated.filter((d) => !d.proxy && rewardOf(d.nodeId) > 0n);
  const fiat = (x: bigint) => (price === undefined ? undefined : toNumber(x, cur.coinDecimals) * price);

  const epochEnd = pending.data ? new Date(pending.dataUpdatedAt + pending.data.secondsLeft * 1000).toISOString() : undefined;
  const epochText = epochEnd
    ? new Date(epochEnd).getTime() > Date.now()
      ? t("nym.epochEnds", { when: timeUntil(epochEnd, locale) })
      : t("nym.epochAdvancing")
    : undefined;

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byName = (a: NymNode, b: NymNode) => (a.name ?? `~${a.id}`).localeCompare(b.name ?? `~${b.id}`, locale, { sensitivity: "base" });
    const byStake = (a: NymNode, b: NymNode) => (b.totalStake > a.totalStake ? 1 : b.totalStake < a.totalStake ? -1 : 0);
    return (nodes.data ?? [])
      .filter((n) => !q || n.name?.toLowerCase().includes(q) || String(n.id) === q)
      .sort((a, b) => {
        switch (sort) {
          case "saturation": return a.saturation - b.saturation || byStake(a, b);
          case "margin": return a.profitMargin - b.profitMargin || byStake(a, b);
          case "performance": return (b.performance ?? -1) - (a.performance ?? -1) || byStake(a, b);
          case "nameAsc": return byName(a, b);
          case "nameDesc": return -byName(a, b);
          default: return byStake(a, b);
        }
      });
  }, [nodes.data, search, sort, locale]);

  const claimAll = () =>
    address &&
    claimable.length > 0 &&
    requestTx({ chain, title: t("nym.claimTitle"), msgs: claimable.map((d) => nymMsg.withdrawReward(address, d.nodeId)) });

  return (
    <div className="space-y-6">
      <Link to="/stake" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> {t("stake.title")}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <TokenIcon src={cur.coinImageUrl ?? chain.chainSymbolImageUrl} symbol={cur.coinDenom} size={40} />
            {t("nym.title")}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t("nym.subtitle")}</span>
            {epochText && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {epochText}</span>}
          </span>
        }
      />

      <Alert tone="info" icon={<Info className="size-4 text-muted" />}>{t("nym.intro")}</Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted">{t("stake.available")}</div>
          <Amount amount={available} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="mt-1 block truncate text-2xl font-semibold" />
          <Fiat value={fiat(available)} className="text-sm text-muted" />
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">{t("nym.delegated")}</div>
          <Amount amount={totalDelegated} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="mt-1 block truncate text-2xl font-semibold" />
          <Fiat value={fiat(totalDelegated)} className="text-sm text-muted" />
        </Card>
        <Card className="bg-huahua-300/25 p-5 dark:bg-surface">
          <div className="text-sm text-muted">{t("stake.rewards")}</div>
          <Amount amount={totalRewards} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="mt-1 block truncate text-2xl font-semibold" />
          <Fiat value={fiat(totalRewards)} className="text-sm text-muted" />
          <div className="mt-3">
            <Button size="sm" disabled={claimable.length === 0} onClick={claimAll}>{t("stake.claimAll")}</Button>
          </div>
        </Card>
      </div>

      {(pending.data?.events.length ?? 0) > 0 && (
        <Card>
          <CardHeader title={t("nym.pending")} subtitle={epochText} />
          <div className="divide-y divide-line p-2">
            {pending.data!.events.map((e, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Clock className="size-5 text-muted" />
                <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {t(e.kind === "delegate" ? "nym.pendingDelegate" : "nym.pendingUndelegate", { node: nodeName(t, byId.get(e.nodeId), e.nodeId) })}
                </div>
                {e.amount !== undefined && <Amount amount={e.amount} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="font-semibold" />}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={t("stake.myDelegations")} />
        <div className="divide-y divide-line p-2">
          {delegations.isLoading && <Skeleton className="m-3 h-12" />}
          {delegations.isError && <p className="px-3 py-3 text-sm text-danger">{t("common.loadError")}</p>}
          {!delegations.isLoading && !delegations.isError && delegated.length === 0 && (
            <EmptyState title={t("nym.noDelegations")}>{t("nym.noDelegationsBody")}</EmptyState>
          )}
          {delegated.map((d) => {
            const node = byId.get(d.nodeId);
            const name = nodeName(t, node, d.nodeId);
            const r = rewardOf(d.nodeId);
            return (
              <div key={`${d.nodeId}-${d.proxy ?? ""}`} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <Monogram text={name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-xs font-normal text-muted">#{d.nodeId}</span>
                    {d.proxy && <Badge className="shrink-0 whitespace-nowrap">{t("nym.vesting")}</Badge>}
                    {nodes.data && !node && <Badge tone="warning" className="shrink-0 whitespace-nowrap">{t("stake.inactive")}</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {d.proxy ? t("nym.vestingNote") : <>{t("stake.rewards")}: <Amount amount={r} decimals={cur.coinDecimals} symbol={cur.coinDenom} /></>}
                  </div>
                </div>
                <Amount amount={d.amount} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="font-semibold" />
                {!d.proxy && (
                  <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                    {node && <Button size="sm" onClick={() => setDelegateTo({ id: d.nodeId, node })}>{t("nym.delegate")}</Button>}
                    <Button size="sm" variant="secondary" onClick={() => setUndelegate({ id: d.nodeId, amount: d.amount })}>{t("nym.undelegate")}</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={r === 0n}
                      onClick={() => address && requestTx({ chain, title: t("nym.claimTitle"), msgs: [nymMsg.withdrawReward(address, d.nodeId)] })}
                    >
                      {t("stake.claim")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title={t("nym.nodes")} subtitle={t("nym.nodesBody")} />
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <div className="min-w-48 flex-1">
            <Input className="h-9" placeholder={t("nym.searchNode")} value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} right={<Search className="mr-2 size-4 text-muted" />} />
          </div>
          <SortSelect
            className="h-9 w-auto! min-w-40"
            value={sort}
            onChange={(v) => { setSort(v); setShown(PAGE); }}
            options={NODE_SORTS.map((v) => ({ value: v, label: t(v === "nameAsc" || v === "nameDesc" ? `sort.${v}` : `nym.sort.${v}`) }))}
          />
        </div>
        <div className="mt-2 divide-y divide-line p-2">
          {nodes.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-3 h-12" />)}
          {nodes.isError && <p className="px-3 py-3 text-sm text-danger">{t("common.loadError")}</p>}
          {list.slice(0, shown).map((n) => {
            const name = nodeName(t, n, n.id);
            const web = safeUrl(n.website);
            return (
              <div key={n.id} className="flex items-center gap-2.5 px-2 py-3 sm:gap-3 sm:px-3">
                <Monogram text={name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{name}</span>
                    <span className="shrink-0 text-xs text-muted">#{n.id}{n.country ? ` · ${n.country}` : ""}</span>
                    {web && (
                      <a href={web} target="_blank" rel="noopener noreferrer nofollow" className="text-muted hover:text-fg" aria-label="website">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="whitespace-nowrap">{t("nym.stake")}: <Amount amount={n.totalStake} decimals={cur.coinDecimals} symbol={cur.coinDenom} /></span>
                    <span className={n.saturation >= SATURATED ? "whitespace-nowrap text-warning" : "whitespace-nowrap"}>
                      {t("nym.saturation")}: {formatPercent(n.saturation, locale, 1)}
                    </span>
                    <span className="whitespace-nowrap">{t("nym.margin")}: {formatPercent(n.profitMargin, locale, 1)}</span>
                    {n.performance !== undefined && (
                      <span className={n.performance < LOW_PERFORMANCE ? "whitespace-nowrap text-warning" : "whitespace-nowrap"}>
                        {t("nym.performance")}: {formatPercent(n.performance, locale, 1)}
                      </span>
                    )}
                  </div>
                </div>
                <Button size="sm" onClick={() => setDelegateTo({ id: n.id, node: n })}>{t("nym.delegate")}</Button>
              </div>
            );
          })}
          {list.length > shown && (
            <div className="flex justify-center p-3">
              <Button size="sm" variant="secondary" onClick={() => setShown((s) => s + PAGE)}>{t("nym.showMore")}</Button>
            </div>
          )}
        </div>
      </Card>

      {delegateTo && address && (
        <DelegateModal
          chain={chain}
          cur={cur}
          address={address}
          id={delegateTo.id}
          node={delegateTo.node}
          available={available}
          epochText={epochText}
          onClose={() => setDelegateTo(null)}
        />
      )}
      <Modal
        open={!!undelegate}
        onClose={() => setUndelegate(null)}
        title={undelegate ? t("nym.undelegateTitle", { node: nodeName(t, byId.get(undelegate.id), undelegate.id) }) : ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setUndelegate(null)}>{t("common.cancel")}</Button>
            <Button
              block
              onClick={() => {
                if (!undelegate || !address) return;
                const title = t("nym.undelegateTitle", { node: nodeName(t, byId.get(undelegate.id), undelegate.id) });
                setUndelegate(null);
                requestTx({ chain, title, msgs: [nymMsg.undelegate(address, undelegate.id)] });
              }}
            >
              {t("common.continue")}
            </Button>
          </>
        }
      >
        {undelegate && (
          <p className="text-sm">
            {t("nym.undelegateBody", {
              amount: `${fromBaseUnits(undelegate.amount, cur.coinDecimals)} ${cur.coinDenom}`,
              node: nodeName(t, byId.get(undelegate.id), undelegate.id),
            })}
          </p>
        )}
      </Modal>
    </div>
  );
}

function DelegateModal({
  chain,
  cur,
  address,
  id,
  node,
  available,
  epochText,
  onClose,
}: {
  chain: ChainInfo;
  cur: Currency;
  address: string;
  id: number;
  node?: NymNode;
  available: bigint;
  epochText?: string;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [amount, setAmount] = useState("");
  const reserve = feeReserve(chain);
  const max = available > reserve ? available - reserve : 0n;
  const name = nodeName(t, node, id);

  let parsed: bigint | null = null;
  let error = "";
  if (amount) {
    try {
      parsed = toBaseUnits(amount, cur.coinDecimals);
      if (parsed <= 0n) error = t("send.error.zero");
      else if (parsed > max) error = t("send.error.exceeds");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const valid = parsed !== null && !error;

  const submit = () => {
    if (!valid || parsed === null) return;
    onClose();
    requestTx({ chain, title: t("nym.delegateTitle", { node: name }), msgs: [nymMsg.delegate(address, id, parsed)] });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={name}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>{t("common.cancel")}</Button>
          <Button block disabled={!valid} onClick={submit}>{t("common.continue")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {node && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">{t("nym.saturation")}</div>
              <div className="font-semibold">{formatPercent(node.saturation, locale, 1)}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">{t("nym.margin")}</div>
              <div className="font-semibold">{formatPercent(node.profitMargin, locale, 1)}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">{t("nym.cost")}</div>
              <Amount amount={node.operatingCost} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="font-semibold" />
              <div className="text-xs text-muted">{t("nym.perInterval")}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">{node.performance !== undefined ? t("nym.performance") : t("nym.delegators")}</div>
              <div className="font-semibold">{node.performance !== undefined ? formatPercent(node.performance, locale, 1) : node.delegators}</div>
            </div>
          </div>
        )}

        <Field
          label={t("send.amount")}
          error={error}
          hint={
            <span>
              {t("stake.available")}: <Amount amount={max} decimals={cur.coinDecimals} symbol={cur.coinDenom} />
            </span>
          }
        >
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))}
            invalid={!!error}
            className="text-lg font-semibold tabular"
            right={
              <>
                <span className="text-sm text-muted">{cur.coinDenom}</span>
                <Button size="sm" variant="secondary" onClick={() => setAmount(fromBaseUnits(max, cur.coinDecimals))}>
                  {t("common.max")}
                </Button>
              </>
            }
          />
        </Field>

        {node && node.saturation >= SATURATED && (
          <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("nym.saturatedWarn")}</Alert>
        )}
        {node?.performance !== undefined && node.performance < LOW_PERFORMANCE && (
          <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("nym.lowPerformanceWarn")}</Alert>
        )}
        <Alert tone="info" icon={<Clock className="size-4 text-muted" />}>{epochText ? `${t("nym.effectNote")} ${epochText}.` : t("nym.effectNote")}</Alert>
        {reserve > 0n && <p className="text-xs text-muted">{t("stake.feeReserveNote")}</p>}
      </div>
    </Modal>
  );
}

/** Points NYM holders on Nyx to the NYM staking page; renders nothing on other chains. */
export function NymStakeEntry({ chains }: { chains: ChainInfo[] }) {
  const t = useT();
  const navigate = useNavigate();
  if (!chains.some((c) => c.chainId === NYX_CHAIN_ID)) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4">
      <Info className="size-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">{t("nym.entryTitle")}</div>
        <div className="text-muted">{t("nym.entryBody")}</div>
      </div>
      <Button size="sm" onClick={() => navigate("/stake/nyx/nym")}>{t("nym.entryAction")}</Button>
    </Card>
  );
}
