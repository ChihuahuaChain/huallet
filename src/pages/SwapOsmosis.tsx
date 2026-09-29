import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Amount } from "@/components/Amount";
import { requestTx } from "@/components/TxModal";
import { Alert, Button, Card, Skeleton, Spinner, cx } from "@/components/ui";
import { useAddress, useBalances } from "@/hooks/queries";
import { useLocale, useT } from "@/i18n";
import type { ChainInfo } from "@/lib/chains/types";
import { fetchOsmosisAssets, fetchOsmosisQuote, minOut, osmosisSwapMsg, OSMO, OSMOSIS_HUAHUA } from "@/lib/dex/osmosis";
import { formatAmount, formatPercent, fromBaseUnits, shortDenom } from "@/lib/format";
import { feeReserveFor } from "./Send";
import { parseAmount, SlippageControl, TokenButton, TokenPicker } from "./Swap";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function OsmosisSwapPanel({ chain }: { chain: ChainInfo }) {
  const t = useT();
  const locale = useLocale();
  const address = useAddress(chain);
  const assetsQ = useQuery({ queryKey: ["osmosis-assets"], queryFn: fetchOsmosisAssets, staleTime: 60 * 60_000, gcTime: 24 * 60 * 60_000 });
  const balancesQ = useBalances(chain, address);
  const assets = assetsQ.data ?? {};
  const balances = useMemo(() => Object.fromEntries((balancesQ.data ?? []).map((b) => [b.denom, b.amount])) as Record<string, bigint>, [balancesQ.data]);

  const [from, setFrom] = useState(OSMO);
  const [to, setTo] = useState(OSMOSIS_HUAHUA);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);

  const fromAsset = assets[from];
  const toAsset = assets[to];
  const parsed = fromAsset ? parseAmount(amount, fromAsset.coinDecimals) : { value: null, error: false };
  const debounced = useDebounced(parsed.value, 350);
  const quoteQ = useQuery({
    queryKey: ["osmosis-quote", from, to, debounced?.toString()],
    queryFn: ({ signal }) => fetchOsmosisQuote(from, debounced!, to, signal),
    enabled: !!debounced && debounced > 0n && from !== to,
    refetchInterval: 15_000,
    retry: false,
  });
  const quote = quoteQ.data && parsed.value === debounced ? quoteQ.data : undefined;
  const balance = balances[from] ?? 0n;
  const reserve = feeReserveFor(chain, from);
  const max = balance > reserve ? balance - reserve : 0n;

  let error = "";
  if (parsed.error) error = t("swap.error.amount");
  else if (parsed.value !== null && parsed.value > balance) error = t("send.error.exceeds");
  else if (quoteQ.isError && parsed.value === debounced) error = t("swap.error.noRoute");

  const impact = quote?.priceImpact ?? 0;
  const valid = !!quote && !!address && !error && quote.outAmount > 0n;
  const rate =
    quote && fromAsset && toAsset
      ? Number(fromBaseUnits(quote.outAmount, toAsset.coinDecimals)) / Number(fromBaseUnits(quote.tokenInAmount, fromAsset.coinDecimals))
      : undefined;
  const path = quote ? [from, ...quote.routes[0].pools.map((p) => p.tokenOutDenom)].map((d) => assets[d]?.coinDenom ?? shortDenom(d)).join(" → ") : "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !quote || !address || !fromAsset || !toAsset) return;
    requestTx({
      chain,
      title: t("swap.confirmTitle", { from: fromAsset.coinDenom, to: toAsset.coinDenom }),
      msgs: [osmosisSwapMsg(quote, address, slippageBps)],
      denomInfo: {
        [from]: { symbol: fromAsset.coinDenom, decimals: fromAsset.coinDecimals },
        [to]: { symbol: toAsset.coinDenom, decimals: toAsset.coinDecimals },
      },
      onSuccess: () => setAmount(""),
    });
  };

  if (assetsQ.isLoading) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </Card>
    );
  }
  if (assetsQ.isError) return <Card className="p-5 text-sm text-danger">{t("common.loadError")}</Card>;

  const denoms = Object.keys(assets);
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
              setFrom(to);
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
              {quote && toAsset ? (
                formatAmount(quote.outAmount, toAsset.coinDecimals, { locale })
              ) : quoteQ.isFetching && parsed.value ? (
                <Spinner className="size-6" />
              ) : (
                <span className="text-muted/50">0</span>
              )}
            </div>
            <TokenButton asset={toAsset} onClick={() => setPicker("to")} />
          </div>
        </div>

        {quote && fromAsset && toAsset && (
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
              <dd className="tabular"><Amount amount={minOut(quote, slippageBps)} decimals={toAsset.coinDecimals} symbol={toAsset.coinDenom} /></dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("swap.osmosis.fees")}</dt>
              <dd className="tabular">{formatPercent(quote.effectiveFee, locale, 2)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("swap.route")}</dt>
              <dd className="text-right">
                {path}
                {quote.routes.length > 1 && <span className="text-muted"> · {t("swap.osmosis.splitRoutes", { n: quote.routes.length })}</span>}
              </dd>
            </div>
          </dl>
        )}

        {[fromAsset, toAsset].some((a) => a?.unstable) && (
          <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>
            {t("swap.osmosis.unstable", { symbol: [fromAsset, toAsset].filter((a) => a?.unstable).map((a) => a!.coinDenom).join(", ") })}
          </Alert>
        )}
        {impact > 0.1 && <Alert tone="danger" icon={<AlertTriangle className="size-4 text-danger" />}>{t("swap.highImpact")}</Alert>}
        {error && <p className="text-sm text-danger">{error}</p>}

        <Button type="submit" size="lg" block disabled={!valid}>
          {address ? t("swap.review") : t("common.loading")}
        </Button>
        <p className="text-center text-xs text-muted">{t("swap.osmosis.poweredBy")}</p>
      </form>

      <TokenPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        denoms={denoms.filter((d) => (picker === "from" ? d !== to : d !== from))}
        assets={assets}
        balances={balances}
        pinned={OSMOSIS_HUAHUA}
        pinnedLabel="Chihuahua · IBC"
        onPick={(d) => {
          if (picker === "from") setFrom(d);
          else setTo(d);
          setAmount("");
        }}
      />
    </Card>
  );
}
