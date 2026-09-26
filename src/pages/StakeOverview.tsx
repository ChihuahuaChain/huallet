import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Amount, Fiat } from "@/components/Amount";
import { PageHeader } from "@/components/layout/AppShell";
import { Button, Card, Skeleton, TokenIcon } from "@/components/ui";
import { usePrices } from "@/hooks/queries";
import { useStakingOverview } from "@/hooks/useStakingOverview";
import { useLocale, useT } from "@/i18n";
import { stakeCurrencyOf } from "@/lib/chains/types";
import { formatPercent, toNumber } from "@/lib/format";
import { useEnabledChains } from "@/state/chains";
import { claimAll } from "./Dashboard";

export function StakeOverview() {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const chains = useEnabledChains();
  const overview = useStakingOverview(chains);
  const prices = usePrices(chains.map((c) => stakeCurrencyOf(c).coinGeckoId ?? "")).data ?? {};

  const fiat = (amount: bigint, chainIdx: number) => {
    const cur = stakeCurrencyOf(chains[chainIdx]);
    const p = cur.coinGeckoId ? prices[cur.coinGeckoId] : undefined;
    return p === undefined ? undefined : toNumber(amount, cur.coinDecimals) * p;
  };
  const sum = (pick: (i: number) => number | undefined) => chains.reduce((s, _c, i) => s + (pick(i) ?? 0), 0);
  const totalStaked = sum((i) => fiat(overview[i].staked, i));
  const totalRewards = sum((i) => fiat(overview[i].rewards, i));

  return (
    <div className="space-y-6">
      <PageHeader title={t("stake.title")} subtitle={t("stake.subtitle")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="text-sm text-muted">{t("stake.totalStaked")}</div>
          <div className="mt-1 font-display text-3xl font-bold"><Fiat value={totalStaked} /></div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">{t("stake.totalRewards")}</div>
          <div className="mt-1 font-display text-3xl font-bold"><Fiat value={totalRewards} /></div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1.5fr_0.7fr_1fr_1fr_auto] gap-4 border-b border-line px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted md:grid">
          <span>{t("stake.chain")}</span>
          <span>{t("stake.apr")}</span>
          <span>{t("stake.staked")}</span>
          <span>{t("stake.rewards")}</span>
          <span className="w-40" />
        </div>
        <div className="divide-y divide-line">
          {overview.map((s, i) => {
            const cur = stakeCurrencyOf(s.chain);
            return (
              <div
                key={s.chain.chainId}
                className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 px-5 py-4 hover:bg-surface-2/60 md:grid-cols-[1.5fr_0.7fr_1fr_1fr_auto] md:gap-4"
                onClick={() => navigate(`/stake/${encodeURIComponent(s.chain.chainId)}`)}
              >
                <div className="flex items-center gap-3">
                  <TokenIcon src={s.chain.chainSymbolImageUrl} symbol={s.chain.chainName} />
                  <div>
                    <div className="font-semibold">{s.chain.chainName}</div>
                    <div className="text-xs text-muted">{cur.coinDenom}</div>
                  </div>
                </div>
                <div className="hidden text-sm font-semibold text-success md:block">
                  {s.apr === undefined ? <Skeleton className="h-4 w-12" /> : s.apr === null ? "—" : formatPercent(s.apr, locale, 1)}
                </div>
                <div className="hidden md:block">
                  {s.isLoading ? <Skeleton className="h-4 w-24" /> : <Amount amount={s.staked} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="text-sm font-semibold" />}
                  <div className="text-xs text-muted"><Fiat value={fiat(s.staked, i)} /></div>
                </div>
                <div className="hidden md:block">
                  {s.isLoading ? <Skeleton className="h-4 w-20" /> : <Amount amount={s.rewards} decimals={cur.coinDecimals} symbol={cur.coinDenom} className="text-sm" />}
                  <div className="text-xs text-muted"><Fiat value={fiat(s.rewards, i)} /></div>
                </div>
                <div className="flex w-auto items-center justify-end gap-2 md:w-40" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="secondary" disabled={s.rewards === 0n} onClick={() => claimAll(s, t("stake.claimTitle", { chain: s.chain.chainName }))}>
                    {t("stake.claim")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/stake/${encodeURIComponent(s.chain.chainId)}`)} aria-label={t("stake.manage")}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="col-span-2 flex justify-between text-sm md:hidden">
                  <span className="text-muted">{t("stake.staked")}: <Amount amount={s.staked} decimals={cur.coinDecimals} className="font-semibold text-fg" /></span>
                  <span className="font-semibold text-success">{s.apr ? formatPercent(s.apr, locale, 1) : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
