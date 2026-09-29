import { AlertTriangle, ArrowDown, ChevronDown, Info, Rocket, Search, Settings2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Amount } from "@/components/Amount";
import { PageHeader } from "@/components/layout/AppShell";
import { requestTx } from "@/components/TxModal";
import { Alert, Badge, Button, Card, EmptyState, Input, Modal, Skeleton, Spinner, Tabs, TokenIcon, cx } from "@/components/ui";
import { useAddress, useBalances } from "@/hooks/queries";
import { useCurveQuote, useCurveState, useDexAssets, useDexParams, useDexPools, useLaunchpadTokens } from "@/hooks/useDex";
import { useLocale, useT } from "@/i18n";
import type { ResolvedAsset } from "@/lib/assets";
import { CHIHUAHUA_CHAIN_ID } from "@/lib/chains/builtin";
import type { ChainInfo } from "@/lib/chains/types";
import { OSMOSIS_CHAIN_ID } from "@/lib/dex/osmosis";
import { curveBuyMsg, curveSellMsg, HUAHUA, routeSwap, swapMsgs, type LaunchpadToken } from "@/lib/dex/huahuaswap";
import { formatAmount, formatPercent, fromBaseUnits, shortAddress, toBaseUnits } from "@/lib/format";
import { useAllChains, useChainsStore, useSelectedChain } from "@/state/chains";
import { feeReserveFor } from "./Send";
import { OsmosisSwapPanel } from "./SwapOsmosis";

export const SLIPPAGE_PRESETS = [50, 100, 300];

export function parseAmount(v: string, decimals: number): { value: bigint | null; error: boolean } {
  if (!v) return { value: null, error: false };
  try {
    return { value: toBaseUnits(v, decimals), error: false };
  } catch {
    return { value: null, error: true };
  }
}

export function TokenButton({ asset, onClick }: { asset?: ResolvedAsset; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3 font-semibold hover:bg-surface-2">
      {asset ? <TokenIcon src={asset.coinImageUrl} symbol={asset.coinDenom} size={28} /> : <div className="size-7 rounded-full bg-surface-2" />}
      <span className="max-w-28 truncate">{asset?.coinDenom ?? "…"}</span>
      <ChevronDown className="size-4 text-muted" />
    </button>
  );
}

export function TokenPicker({
  open,
  onClose,
  denoms,
  assets,
  balances,
  onPick,
  pinned = HUAHUA,
  pinnedLabel = "Chihuahua",
}: {
  open: boolean;
  onClose: () => void;
  denoms: string[];
  assets: Record<string, ResolvedAsset>;
  balances: Record<string, bigint>;
  onPick: (d: string) => void;
  pinned?: string;
  pinnedLabel?: string;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const list = denoms
    .filter((d) => {
      const a = assets[d];
      const s = q.trim().toLowerCase();
      return !s || a?.coinDenom.toLowerCase().includes(s) || d.toLowerCase().includes(s);
    })
    .sort((a, b) => (a === pinned ? -1 : b === pinned ? 1 : Number((balances[b] ?? 0n) - (balances[a] ?? 0n))));
  return (
    <Modal open={open} onClose={onClose} title={t("swap.selectToken")} size="sm">
      <Input autoFocus placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} right={<Search className="mr-2 size-4 text-muted" />} />
      <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
        {list.map((d) => {
          const a = assets[d];
          return (
            <button
              key={d}
              onClick={() => {
                onPick(d);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2"
            >
              <TokenIcon src={a?.coinImageUrl} symbol={a?.coinDenom ?? "?"} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{a?.coinDenom ?? shortAddress(d, 10, 4)}</div>
                <div className="truncate font-mono text-[11px] text-muted">{d === pinned ? pinnedLabel : shortAddress(d, 16, 8)}</div>
              </div>
              {!!balances[d] && a && <Amount amount={balances[d]} decimals={a.coinDecimals} className="text-sm" />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function SlippageControl({ value: slippageBps, onChange: setSlippageBps }: { value: number; onChange: (bps: number) => void }) {
  const t = useT();
  const locale = useLocale();
  const [showSettings, setShowSettings] = useState(false);
  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => setShowSettings((s) => !s)} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg">
          <Settings2 className="size-4" /> {t("swap.slippage")}: {formatPercent(slippageBps / 10_000, locale, 2)}
        </button>
      </div>
      {showSettings && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <span className="text-muted">{t("swap.slippageTolerance")}</span>
          {SLIPPAGE_PRESETS.map((b) => (
            <button key={b} type="button" onClick={() => setSlippageBps(b)} className={cx("rounded-lg px-2.5 py-1 font-medium", slippageBps === b ? "bg-accent text-accent-fg" : "bg-surface hover:bg-line")}>
              {formatPercent(b / 10_000, locale, 1)}
            </button>
          ))}
          <Input
            className="h-8 w-20"
            inputMode="decimal"
            placeholder="%"
            onChange={(e) => {
              const v = Number(e.target.value.replace(",", "."));
              if (v > 0 && v <= 50) setSlippageBps(Math.round(v * 100));
            }}
            aria-label={t("swap.slippageTolerance")}
          />
        </div>
      )}
    </>
  );
}

export function SwapPage() {
  const t = useT();
  const chain = useSelectedChain();
  const all = useAllChains();
  const chihuahua = all.find((c) => c.chainId === CHIHUAHUA_CHAIN_ID);
  const osmosis = all.find((c) => c.chainId === OSMOSIS_CHAIN_ID);
  const selectChain = useChainsStore((s) => s.selectChain);
  const setEnabled = useChainsStore((s) => s.setEnabled);
  const [tab, setTab] = useState<"swap" | "launchpad" | "osmosis">(chain.chainId === OSMOSIS_CHAIN_ID ? "osmosis" : "swap");
  const switchTo = (chainId: string) => {
    setEnabled(chainId, true);
    selectChain(chainId);
  };

  const needed = tab === "osmosis" ? osmosis : chihuahua;
  const tabs = (
    <Tabs
      value={tab}
      onChange={setTab}
      items={[
        { value: "swap", label: t("swap.tab.swap") },
        { value: "launchpad", label: t("swap.tab.launchpad") },
        ...(osmosis ? [{ value: "osmosis" as const, label: t("swap.tab.osmosis") }] : []),
      ]}
    />
  );

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("swap.title")} subtitle={t(tab === "osmosis" ? "swap.osmosis.subtitle" : "swap.subtitle")} action={tabs} />
      {!needed || chain.chainId !== needed.chainId ? (
        <Card>
          {tab === "osmosis" ? (
            <EmptyState icon={<Rocket className="size-8" />} title={t("swap.osmosis.only")} action={osmosis && <Button onClick={() => switchTo(OSMOSIS_CHAIN_ID)}>{t("swap.osmosis.switch")}</Button>}>
              {t("swap.osmosis.onlyBody")}
            </EmptyState>
          ) : (
            <EmptyState icon={<Rocket className="size-8" />} title={t("swap.onlyChihuahua")} action={chihuahua && <Button onClick={() => switchTo(CHIHUAHUA_CHAIN_ID)}>{t("swap.switchChain")}</Button>}>
              {t("swap.onlyChihuahuaBody")}
            </EmptyState>
          )}
        </Card>
      ) : tab === "osmosis" ? (
        <OsmosisSwapPanel chain={chain} />
      ) : tab === "swap" ? (
        <SwapPanel chain={chain} />
      ) : (
        <LaunchpadPanel chain={chain} />
      )}
    </div>
  );
}

function SwapPanel({ chain }: { chain: ChainInfo }) {
  const t = useT();
  const locale = useLocale();
  const address = useAddress(chain);
  const pools = useDexPools(chain);
  const params = useDexParams(chain);
  const balancesQ = useBalances(chain, address);
  const denoms = useMemo(() => [...new Set((pools.data ?? []).flatMap((p) => p.denoms))], [pools.data]);
  const assets = useDexAssets(chain, denoms).data ?? {};
  const balances = useMemo(() => Object.fromEntries((balancesQ.data ?? []).map((b) => [b.denom, b.amount])) as Record<string, bigint>, [balancesQ.data]);

  const [from, setFrom] = useState(HUAHUA);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);

  const liquidity = useMemo(() => {
    const m: Record<string, bigint> = {};
    for (const p of pools.data ?? []) for (const d of p.denoms) if (d !== HUAHUA) m[d] = (m[d] ?? 0n) + (p.reserves[HUAHUA] ?? 0n);
    return m;
  }, [pools.data]);
  const byLiquidity = useMemo(() => [...denoms].sort((a, b) => (a === HUAHUA ? -1 : b === HUAHUA ? 1 : Number((liquidity[b] ?? 0n) - (liquidity[a] ?? 0n)))), [denoms, liquidity]);
  const toDenom = to || byLiquidity.find((d) => d !== from) || "";
  const fromAsset = assets[from];
  const toAsset = assets[toDenom];
  const parsed = fromAsset ? parseAmount(amount, fromAsset.coinDecimals) : { value: null, error: false };
  const route = parsed.value && params.data && pools.data ? routeSwap(pools.data, params.data, from, toDenom, parsed.value, slippageBps) : undefined;
  const balance = balances[from] ?? 0n;
  const max = balance > feeReserveFor(chain, from) ? balance - feeReserveFor(chain, from) : 0n;

  let error = "";
  if (parsed.error) error = t("swap.error.amount");
  else if (parsed.value !== null && parsed.value > balance) error = t("send.error.exceeds");
  else if (parsed.value && !route) error = t("swap.error.noRoute");
  else if (route?.exceedsMaxOrder) error = t("swap.error.maxOrder");
  else if (params.data?.circuitBreaker) error = t("swap.error.paused");

  const impact = route?.priceImpact ?? 0;
  const valid = !!route && !!address && !error && route.received > 0n;
  const rate =
    route && fromAsset && toAsset && parsed.value
      ? Number(fromBaseUnits(route.received, toAsset.coinDecimals)) / Number(fromBaseUnits(parsed.value, fromAsset.coinDecimals))
      : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !route || !address || !params.data || !fromAsset || !toAsset) return;
    const denomInfo = Object.fromEntries(
      [from, toDenom, HUAHUA].map((d) => [d, { symbol: assets[d]?.coinDenom ?? d, decimals: assets[d]?.coinDecimals ?? 0 }]),
    );
    requestTx({
      chain,
      title: t("swap.confirmTitle", { from: fromAsset.coinDenom, to: toAsset.coinDenom }),
      msgs: swapMsgs(route, address, params.data),
      denomInfo,
      onSuccess: () => setAmount(""),
    });
  };

  if (pools.isLoading || params.isLoading) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </Card>
    );
  }
  if (pools.isError) return <Card className="p-5 text-sm text-danger">{t("common.loadError")}</Card>;

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-3">
        <SlippageControl value={slippageBps} onChange={setSlippageBps} />

        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t("swap.youPay")}</span>
            {fromAsset && (
              <button type="button" onClick={() => setAmount(fromBaseUnits(max, fromAsset.coinDecimals))} className="hover:text-fg">
                {t("send.available")}: <Amount amount={balance} decimals={fromAsset.coinDecimals} /> · <span className="font-semibold text-rust">{t("common.max")}</span>
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
              className="tabular min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none placeholder:text-muted/50"
              aria-label={t("swap.youPay")}
            />
            <TokenButton asset={fromAsset} onClick={() => setPicker("from")} />
          </div>
        </div>

        <div className="-my-5 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setFrom(toDenom);
              setTo(from);
              setAmount("");
            }}
            className="relative z-10 rounded-xl border-4 border-surface bg-accent p-1.5 text-accent-fg hover:bg-huahua-400"
            aria-label={t("swap.flip")}
          >
            <ArrowDown className="size-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="text-xs text-muted">{t("swap.youReceive")}</div>
          <div className="mt-2 flex items-center gap-3">
            <div className="tabular min-w-0 flex-1 truncate text-3xl font-semibold">
              {route && toAsset ? formatAmount(route.received, toAsset.coinDecimals, { locale }) : <span className="text-muted/50">0</span>}
            </div>
            <TokenButton asset={toAsset} onClick={() => setPicker("to")} />
          </div>
        </div>

        {route && fromAsset && toAsset && (
          <dl className="space-y-1.5 rounded-xl px-1 pt-1 text-sm">
            {rate !== undefined && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t("swap.rate")}</dt>
                <dd className="tabular">1 {fromAsset.coinDenom} ≈ {rate.toLocaleString(locale, { maximumSignificantDigits: 6 })} {toAsset.coinDenom}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("swap.priceImpact")}</dt>
              <dd className={cx("tabular font-medium", impact > 0.1 ? "text-danger" : impact > 0.03 ? "text-warning" : "text-success")}>{formatPercent(impact, locale, 2)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("swap.minReceived")}</dt>
              <dd className="tabular"><Amount amount={route.minReceived} decimals={toAsset.coinDecimals} symbol={toAsset.coinDenom} /></dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("swap.poolFee")}</dt>
              <dd>{params.data ? formatPercent(Number(params.data.swapFeeRate) / 1e18, locale, 2) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("swap.route")}</dt>
              <dd className="text-right">{[from, ...route.hops.map((h) => h.demandDenom)].map((d) => assets[d]?.coinDenom ?? "?").join(" → ")}</dd>
            </div>
          </dl>
        )}

        {route && route.hops.length > 1 && route.leftover && route.leftover.amount > 0n && (
          <p className="text-xs text-muted">{t("swap.leftover", { amount: formatAmount(route.leftover.amount, 6, { locale }) })}</p>
        )}
        {impact > 0.1 && <Alert tone="danger" icon={<AlertTriangle className="size-4 text-danger" />}>{t("swap.highImpact")}</Alert>}
        {error && <p className="text-sm text-danger">{error}</p>}

        <Button type="submit" size="lg" block disabled={!valid}>
          {address ? t("swap.review") : t("common.loading")}
        </Button>
        <p className="text-center text-xs text-muted">{t("swap.poweredBy")}</p>
      </form>

      <TokenPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        denoms={byLiquidity.filter((d) => (picker === "from" ? d !== toDenom : d !== from))}
        assets={assets}
        balances={balances}
        onPick={(d) => {
          if (picker === "from") setFrom(d);
          else setTo(d);
          setAmount("");
        }}
      />
    </Card>
  );
}

function LaunchpadPanel({ chain }: { chain: ChainInfo }) {
  const t = useT();
  const tokens = useLaunchpadTokens(chain);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LaunchpadToken | null>(null);
  const live = (tokens.data ?? []).filter((x) => !x.completed).sort((a, b) => b.createdAt - a.createdAt);
  const list = live.filter((x) => {
    const s = q.trim().toLowerCase();
    return !s || x.name.toLowerCase().includes(s) || x.subdenom.toLowerCase().includes(s);
  });
  const visible = list.slice(0, 40);
  const assets = useDexAssets(chain, visible.map((x) => x.denom)).data ?? {};

  if (selected) return <CurveTrade chain={chain} token={selected} asset={assets[selected.denom]} onBack={() => setSelected(null)} />;

  return (
    <Card className="p-5 sm:p-6">
      <Alert tone="info" icon={<Info className="size-4 text-muted" />} title={t("launchpad.whatTitle")}>
        {t("launchpad.whatBody")}
      </Alert>
      <div className="mt-4">
        <Input placeholder={t("launchpad.search")} value={q} onChange={(e) => setQ(e.target.value)} right={<Search className="mr-2 size-4 text-muted" />} />
      </div>
      <div className="mt-3 divide-y divide-line">
        {tokens.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="my-2 h-12" />)}
        {tokens.isError && <p className="py-4 text-sm text-danger">{t("common.loadError")}</p>}
        {!tokens.isLoading && list.length === 0 && <EmptyState title={t("launchpad.empty")} />}
        {visible.map((x) => {
          const a = assets[x.denom];
          return (
            <button key={x.denom} onClick={() => setSelected(x)} className="flex w-full items-center gap-3 px-1 py-3 text-left hover:bg-surface-2/60">
              <TokenIcon src={a?.coinImageUrl} symbol={a?.coinDenom ?? x.subdenom} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <span className="truncate">{x.name}</span>
                  <Badge>{(a?.coinDenom ?? x.subdenom).toUpperCase()}</Badge>
                </div>
                <div className="truncate text-xs text-muted">{x.description}</div>
              </div>
            </button>
          );
        })}
        {list.length > visible.length && <p className="pt-3 text-center text-xs text-muted">{t("launchpad.more", { n: list.length - visible.length })}</p>}
      </div>
    </Card>
  );
}

function CurveTrade({ chain, token, asset, onBack }: { chain: ChainInfo; token: LaunchpadToken; asset?: ResolvedAsset; onBack: () => void }) {
  const t = useT();
  const locale = useLocale();
  const address = useAddress(chain);
  const balancesQ = useBalances(chain, address);
  const state = useCurveState(chain, token.curve);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const decimals = asset?.coinDecimals ?? 6;
  const symbol = (asset?.coinDenom ?? token.subdenom).toUpperCase();
  const payDecimals = side === "buy" ? 6 : decimals;
  const parsed = parseAmount(amount, payDecimals);
  const quote = useCurveQuote(chain, token.curve, side, side === "buy" ? HUAHUA : token.denom, parsed.value);
  const bal = (d: string) => balancesQ.data?.find((b) => b.denom === d)?.amount ?? 0n;
  const payBalance = side === "buy" ? bal(HUAHUA) : bal(token.denom);
  const max = side === "buy" ? (payBalance > feeReserveFor(chain, HUAHUA) ? payBalance - feeReserveFor(chain, HUAHUA) : 0n) : payBalance;

  let error = "";
  if (parsed.error) error = t("swap.error.amount");
  else if (parsed.value !== null && parsed.value > payBalance) error = t("send.error.exceeds");
  else if (state.data?.completed) error = t("launchpad.graduated");
  else if (quote.isError) error = t("launchpad.quoteError");
  const valid = !!address && !!parsed.value && parsed.value > 0n && !error && !!quote.data && quote.data > 0n;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !address || !parsed.value) return;
    requestTx({
      chain,
      title: side === "buy" ? t("launchpad.buyTitle", { symbol }) : t("launchpad.sellTitle", { symbol }),
      msgs: [side === "buy" ? curveBuyMsg(address, token.curve, parsed.value) : curveSellMsg(address, token.curve, token.denom, parsed.value)],
      denomInfo: { [HUAHUA]: { symbol: "HUAHUA", decimals: 6 }, [token.denom]: { symbol, decimals } },
      onSuccess: () => setAmount(""),
    });
  };

  return (
    <Card className="p-5 sm:p-6">
      <button onClick={onBack} className="mb-4 text-sm text-muted hover:text-fg">← {t("swap.tab.launchpad")}</button>
      <div className="flex items-center gap-3">
        <TokenIcon src={asset?.coinImageUrl} symbol={symbol} size={48} />
        <div className="min-w-0">
          <div className="font-display text-xl font-semibold">{token.name}</div>
          <div className="text-sm text-muted">{symbol}</div>
        </div>
      </div>
      {token.description && <p className="mt-3 text-sm text-muted">{token.description}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-xs text-muted">{t("launchpad.collected")}</div>
          {state.data ? <Amount amount={state.data.collected} decimals={6} symbol="HUAHUA" className="font-semibold" /> : <Spinner className="size-4" />}
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="text-xs text-muted">{t("launchpad.yourBalance")}</div>
          <Amount amount={bal(token.denom)} decimals={decimals} symbol={symbol} className="font-semibold" />
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <Tabs value={side} onChange={(s) => { setSide(s); setAmount(""); }} items={[{ value: "buy", label: t("launchpad.buy") }, { value: "sell", label: t("launchpad.sell") }]} />
        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t("swap.youPay")}</span>
            <button type="button" onClick={() => setAmount(fromBaseUnits(max, payDecimals))} className="hover:text-fg">
              {t("send.available")}: <Amount amount={payBalance} decimals={payDecimals} /> · <span className="font-semibold text-rust">{t("common.max")}</span>
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
              className="tabular min-w-0 flex-1 bg-transparent text-3xl font-semibold outline-none placeholder:text-muted/50"
              aria-label={t("swap.youPay")}
            />
            <span className="font-semibold">{side === "buy" ? "HUAHUA" : symbol}</span>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl px-1 text-sm">
          <span className="text-muted">{t("launchpad.estimated")}</span>
          <span className="tabular font-semibold">
            {quote.isFetching && !quote.data ? <Spinner className="size-4" /> : quote.data ? `${formatAmount(quote.data, side === "buy" ? decimals : 6, { locale })} ${side === "buy" ? symbol : "HUAHUA"}` : "—"}
          </span>
        </div>
        <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("launchpad.noSlippageProtection")}</Alert>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" block disabled={!valid}>
          {side === "buy" ? t("launchpad.buy") : t("launchpad.sell")}
        </Button>
      </form>
    </Card>
  );
}
