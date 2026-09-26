import { formatAmount, formatFiat } from "@/lib/format";
import { useLocale } from "@/i18n";
import { useSettings } from "@/state/settings";
import { cx } from "./ui";

const MASK = "••••";

export function Amount({
  amount,
  decimals,
  symbol,
  className,
  maxDecimals,
}: {
  amount: bigint | string;
  decimals: number;
  symbol?: string;
  className?: string;
  maxDecimals?: number;
}) {
  const locale = useLocale();
  const hidden = useSettings((s) => s.hideBalances);
  return (
    <span className={cx("tabular", className)}>
      {hidden ? MASK : formatAmount(amount, decimals, { locale, maxDecimals })}
      {symbol && <span className="ml-1 text-muted">{symbol}</span>}
    </span>
  );
}

export function Fiat({ value, className }: { value: number | undefined; className?: string }) {
  const locale = useLocale();
  const { fiat, hideBalances, showPrices } = useSettings();
  if (!showPrices || value === undefined || Number.isNaN(value)) return null;
  return <span className={cx("tabular", className)}>{hideBalances ? MASK : formatFiat(value, fiat, locale)}</span>;
}
