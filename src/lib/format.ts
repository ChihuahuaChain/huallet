export function toBaseUnits(amount: string, decimals: number): bigint {
  const s = amount.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") throw new Error("Invalid amount");
  const [int = "0", frac = ""] = s.split(".");
  if (frac.length > decimals) throw new Error(`Too many decimal places (max ${decimals})`);
  return BigInt(int || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function fromBaseUnits(amount: bigint | string, decimals: number): string {
  const v = typeof amount === "bigint" ? amount : BigInt(amount.split(".")[0] || "0");
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const int = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

export function toNumber(amount: bigint | string, decimals: number): number {
  return Number(fromBaseUnits(amount, decimals));
}

export function formatAmount(
  amount: bigint | string,
  decimals: number,
  opts: { maxDecimals?: number; locale?: string } = {},
): string {
  const plain = fromBaseUnits(amount, decimals);
  const [int, frac = ""] = plain.replace("-", "").split(".");
  const n = Number(int);
  const maxDecimals = opts.maxDecimals ?? (n >= 1000 ? 2 : n >= 1 ? 4 : 6);
  const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "");
  const grouped = BigInt(int).toLocaleString(opts.locale);
  const dec = new Intl.NumberFormat(opts.locale).formatToParts(1.1).find((p) => p.type === "decimal")?.value ?? ".";
  const out = `${plain.startsWith("-") ? "-" : ""}${grouped}${trimmed ? dec + trimmed : ""}`;
  if (out === "0" && /[1-9]/.test(frac)) return `< 0${dec}${"0".repeat(maxDecimals - 1)}1`;
  return out;
}

export function formatFiat(value: number, currency: string, locale?: string): string {
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number, locale?: string, digits = 2): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(value);
}

export function shortAddress(addr: string, head = 10, tail = 6): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function shortDenom(denom: string): string {
  if (denom.startsWith("ibc/")) return `ibc/${denom.slice(4, 10)}…`;
  if (denom.startsWith("factory/")) return denom.split("/").pop() ?? denom;
  if (denom.length > 20) return `${denom.slice(0, 10)}…${denom.slice(-4)}`;
  return denom;
}

export function formatDateTime(iso: string | number | Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function timeUntil(iso: string, locale?: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(ms);
  if (abs >= 86_400_000) return rtf.format(Math.round(ms / 86_400_000), "day");
  if (abs >= 3_600_000) return rtf.format(Math.round(ms / 3_600_000), "hour");
  return rtf.format(Math.round(ms / 60_000), "minute");
}

export function fiatValue(amount: bigint | string, decimals: number, price: number | undefined): number | undefined {
  if (price === undefined) return undefined;
  return toNumber(amount, decimals) * price;
}
