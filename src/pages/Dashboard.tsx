import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Coins, Eye, EyeOff, Gift, Lock, Search, Repeat, ShieldQuestion, Usb } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Amount, Fiat, MASK } from "@/components/Amount";
import { PageHeader } from "@/components/layout/AppShell";
import { requestTx } from "@/components/TxModal";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, Skeleton, TokenIcon, Toggle, cx } from "@/components/ui";
import { Mascot } from "@/components/Logo";
import { PromoCards } from "@/components/PromoCards";
import { useAccountChains, usePortfolio, usePrices } from "@/hooks/queries";
import { useStakingOverview, type ChainStaking } from "@/hooks/useStakingOverview";
import { useLocale, useT } from "@/i18n";
import { stakeCurrencyOf, type ChainInfo } from "@/lib/chains/types";
import { formatFiat, toNumber } from "@/lib/format";
import { msg } from "@/lib/cosmos/tx";
import { useChainsStore } from "@/state/chains";
import { assetKey, useHiddenAssets } from "@/state/hiddenAssets";
import { useSettings } from "@/state/settings";

export function claimAll(s: ChainStaking, title: string) {
  if (!s.address || s.validatorsWithRewards.length === 0) return;
  requestTx({
    chain: s.chain,
    title,
    msgs: s.validatorsWithRewards.map((v) => msg.withdrawRewards(s.address!, v)),
  });
}

/** Chains enabled in settings that the active Ledger account can't derive an address on. */
export function UnsupportedChainsNote({ chains }: { chains: ChainInfo[] }) {
  const t = useT();
  if (chains.length === 0) return null;
  return (
    <Alert tone="info" icon={<Usb className="size-4 text-muted" />}>
      {t("ledger.unsupportedChains", { chains: chains.map((c) => c.chainName).join(", ") })}
    </Alert>
  );
}

function Stat({ label, children, icon }: { label: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface/70 p-3.5 dark:bg-ink/40">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink/70 dark:text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{children}</div>
    </div>
  );
}

export function Dashboard() {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const { fiat, hideBalances, hideSmallBalances, hideUnverified, set, showPrices } = useSettings();
  const { hidden, hide, unhide } = useHiddenAssets();
  const [showHidden, setShowHidden] = useState(false);
  const selectChain = useChainsStore((s) => s.selectChain);
  const { chains, unsupported } = useAccountChains();
  const portfolio = usePortfolio();
  const staking = useStakingOverview(chains);
  const [query, setQuery] = useState("");

  const geckoIds = useMemo(
    () => [...portfolio.flatMap((p) => p.balances.map((b) => b.asset.coinGeckoId ?? "")), ...chains.map((c) => stakeCurrencyOf(c).coinGeckoId ?? "")].filter(Boolean),
    [portfolio, chains],
  );
  const prices = usePrices(geckoIds).data ?? {};
  const priceOf = (id?: string) => (id ? prices[id] : undefined);

  const rows = portfolio.flatMap((p) =>
    p.balances.map((b) => {
      const price = priceOf(b.asset.coinGeckoId);
      return { chain: p.chain, b, value: price !== undefined ? toNumber(b.amount, b.asset.coinDecimals) * price : undefined };
    }),
  );

  const totals = staking.reduce(
    (acc, s) => {
      const cur = stakeCurrencyOf(s.chain);
      const price = priceOf(cur.coinGeckoId);
      if (price === undefined) return acc;
      const v = (x: bigint) => toNumber(x, cur.coinDecimals) * price;
      return { staked: acc.staked + v(s.staked), rewards: acc.rewards + v(s.rewards), unbonding: acc.unbonding + v(s.unbonding) };
    },
    { staked: 0, rewards: 0, unbonding: 0 },
  );
  const available = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const total = available + totals.staked + totals.rewards + totals.unbonding;
  const loading = portfolio.some((p) => p.isLoading);
  // The headline total is formatted once here, both to render it and to shrink the font as the
  // string gets longer so a big number never overflows the hero.
  const totalStr = !showPrices || Number.isNaN(total) ? "—" : hideBalances ? MASK : formatFiat(total, fiat, locale);
  const totalSize =
    totalStr.length > 21 ? "text-xl sm:text-2xl"
    : totalStr.length > 17 ? "text-2xl sm:text-3xl"
    : totalStr.length > 13 ? "text-3xl sm:text-4xl"
    : "text-4xl sm:text-5xl";

  const q = query.trim().toLowerCase();
  const hiddenSet = new Set(hidden);
  const filtered = rows
    .filter((r) => !hideSmallBalances || r.value === undefined || r.value >= 1)
    .filter((r) => !hideUnverified || r.b.asset.verified || r.b.asset.bridged)
    .filter((r) => !q || r.b.asset.coinDenom.toLowerCase().includes(q) || r.chain.chainName.toLowerCase().includes(q))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const visible = filtered.filter((r) => !hiddenSet.has(assetKey(r.chain.chainId, r.b.denom)));
  const hiddenRows = filtered.filter((r) => hiddenSet.has(assetKey(r.chain.chainId, r.b.denom)));

  const claimable = staking.filter((s) => s.rewards > 0n);

  const renderAsset = ({ chain, b, value }: (typeof filtered)[number], isHiddenRow: boolean) => {
    const key = assetKey(chain.chainId, b.denom);
    return (
      <div key={key} className={cx("group flex min-w-0 items-center rounded-xl pr-1.5 hover:bg-surface-2", isHiddenRow && "opacity-60")}>
        <button
          onClick={() => {
            selectChain(chain.chainId);
            navigate(`/send?denom=${encodeURIComponent(b.denom)}`);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left"
        >
          <div className="relative">
            <TokenIcon src={b.asset.coinImageUrl} symbol={b.asset.coinDenom} />
            <TokenIcon src={chain.chainSymbolImageUrl} symbol={chain.chainName} size={16} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-surface" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-1.5 font-semibold">
              <span className="truncate">{b.asset.coinDenom}</span>
              {!b.asset.verified && b.asset.bridged && <Badge tone="neutral" className="shrink-0">{t("assets.ibc")}</Badge>}
              {/* "Unverified" is long: the text badge where there's room (sm+), a compact icon in the
                  narrow popup / side panel so the token name and amount keep their space. */}
              {!b.asset.verified && !b.asset.bridged && (
                <>
                  <Badge tone="warning" className="hidden shrink-0 sm:inline-flex">{t("assets.unverified")}</Badge>
                  <span className="shrink-0 text-warning sm:hidden" title={t("assets.unverified")} aria-label={t("assets.unverified")}>
                    <ShieldQuestion className="size-4" />
                  </span>
                </>
              )}
            </div>
            <div className="truncate text-xs text-muted">{chain.chainName}</div>
          </div>
          {/* The amount gives way first (shrink-[4]) down to a 72px floor, so an absurd spam balance
              truncates instead of crushing the name or overlapping the badge. */}
          <div className="min-w-[72px] max-w-[40%] shrink-[4] text-right">
            <Amount amount={b.amount} decimals={b.asset.coinDecimals} className="block truncate font-semibold" />
            <div className="truncate text-xs text-muted"><Fiat value={value} /></div>
          </div>
        </button>
        <button
          onClick={() => (isHiddenRow ? unhide(key) : hide(key))}
          title={t(isHiddenRow ? "assets.unhide" : "assets.hide")}
          aria-label={t(isHiddenRow ? "assets.unhide" : "assets.hide")}
          className="ml-1 shrink-0 rounded-lg p-2 text-muted opacity-60 transition hover:text-fg sm:opacity-0 sm:group-hover:opacity-100"
        >
          {isHiddenRow ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <section className="paw-bg relative overflow-hidden rounded-3xl bg-huahua-300 p-6 text-ink shadow-card sm:p-8 dark:bg-surface dark:text-fg">
        <div className="text-sm font-medium text-ink/70 dark:text-muted">{t("dashboard.total")}</div>
        <div className={cx("mt-1 font-display font-bold", totalSize)}>
          {showPrices && loading && total === 0 ? <Skeleton className="h-12 w-48 bg-ink/10" /> : <span className="tabular">{totalStr}</span>}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("dashboard.available")} icon={<Coins className="size-3.5" />}><Fiat value={available} /></Stat>
          <Stat label={t("dashboard.staked")} icon={<Lock className="size-3.5" />}><Fiat value={totals.staked} /></Stat>
          <Stat label={t("dashboard.rewards")} icon={<Gift className="size-3.5" />}><Fiat value={totals.rewards} /></Stat>
          <Stat label={t("dashboard.unbonding")} icon={<ArrowDownLeft className="size-3.5" />}><Fiat value={totals.unbonding} /></Stat>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="dark" icon={<ArrowUpRight className="size-4" />} onClick={() => navigate("/send")}>{t("nav.send")}</Button>
          <Button variant="secondary" icon={<ArrowDownLeft className="size-4" />} onClick={() => navigate("/receive")}>{t("nav.receive")}</Button>
          <Button variant="secondary" icon={<Repeat className="size-4" />} onClick={() => navigate("/swap")}>{t("nav.swap")}</Button>
          <Button variant="secondary" icon={<Coins className="size-4" />} onClick={() => navigate("/stake")}>{t("nav.stake")}</Button>
          <Button variant="secondary" icon={<ArrowLeftRight className="size-4" />} onClick={() => navigate("/ibc")}>{t("nav.ibc")}</Button>
        </div>
      </section>

      <PromoCards />

      <UnsupportedChainsNote chains={unsupported} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <CardHeader
            title={t("dashboard.assets")}
            action={
              <div className="w-44">
                <Input placeholder={t("common.search")} value={query} onChange={(e) => setQuery(e.target.value)} className="h-9" aria-label={t("common.search")} right={<Search className="mr-2 size-4 text-muted" />} />
              </div>
            }
          />
          <div className="px-5 pt-2">
            <Toggle checked={hideSmallBalances} onChange={(v) => set({ hideSmallBalances: v })} label={<span className="text-xs text-muted">{t("dashboard.hideSmall", { currency: fiat.toUpperCase() })}</span>} />
          </div>
          <div className="divide-y divide-line px-2 pb-2">
            {loading && rows.length === 0 &&
              [0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-9 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            {!loading && visible.length === 0 && hiddenRows.length === 0 && (
              <EmptyState icon={<Mascot size={56} />} title={t("dashboard.empty")} action={<Button onClick={() => navigate("/receive")}>{t("nav.receive")}</Button>}>
                {t("dashboard.emptyBody")}
              </EmptyState>
            )}
            {visible.map((r) => renderAsset(r, false))}
            {hiddenRows.length > 0 && (
              <div className="px-3 pt-2">
                <button onClick={() => setShowHidden((v) => !v)} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg">
                  {showHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {t(showHidden ? "dashboard.hideHidden" : "dashboard.showHidden", { n: hiddenRows.length })}
                </button>
              </div>
            )}
            {showHidden && hiddenRows.map((r) => renderAsset(r, true))}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title={t("dashboard.claimable")} subtitle={t("dashboard.claimableBody")} />
          <div className="space-y-1 p-2">
            {claimable.length === 0 && (
              <EmptyState title={t("dashboard.noRewards")}>
                <Link to="/stake" className="font-medium text-rust hover:underline">{t("dashboard.startStaking")}</Link>
              </EmptyState>
            )}
            {claimable.map((s) => {
              const cur = stakeCurrencyOf(s.chain);
              return (
                <div key={s.chain.chainId} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <TokenIcon src={s.chain.chainSymbolImageUrl} symbol={s.chain.chainName} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{s.chain.chainName}</div>
                    <Amount amount={s.rewards} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="text-xs" />
                  </div>
                  <Button size="sm" onClick={() => claimAll(s, t("stake.claimTitle", { chain: s.chain.chainName }))}>
                    {t("stake.claim")}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
