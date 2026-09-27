import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PayRequestButtons } from "@/components/PayRequest";
import { toast } from "@/components/Toaster";
import type { PaymentRequest } from "@/lib/payreq";
import { Amount, Fiat } from "@/components/Amount";
import { PageHeader } from "@/components/layout/AppShell";
import { RecipientInput, useRecipientError } from "@/components/RecipientInput";
import { requestTx } from "@/components/TxModal";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { useAddress, useBalances, useCw20Balances, usePrices } from "@/hooks/queries";
import { useT } from "@/i18n";
import { feeCurrencyOf, type ChainInfo } from "@/lib/chains/types";
import { computeFee, msg } from "@/lib/cosmos/tx";
import { fromBaseUnits, toBaseUnits, toNumber } from "@/lib/format";
import { useAllChains, useChainsStore, useEnabledChains, useSelectedChain } from "@/state/chains";
import { checkAddress } from "@/lib/address";

export interface TokenOption {
  key: string;
  denom: string;
  symbol: string;
  decimals: number;
  amount: bigint;
  coinGeckoId?: string;
  cw20?: string;
}

export function useTokenOptions(chain: ChainInfo, address?: string): { options: TokenOption[]; loading: boolean } {
  const balances = useBalances(chain, address);
  const cw20 = useCw20Balances(chain, address);
  const options = useMemo(() => {
    const bank: TokenOption[] = (balances.data ?? []).map((b) => ({
      key: b.denom,
      denom: b.denom,
      symbol: b.asset.coinDenom,
      decimals: b.asset.coinDecimals,
      amount: b.amount,
      coinGeckoId: b.asset.coinGeckoId,
    }));
    const cws: TokenOption[] = cw20
      .filter((q) => q.data && q.data.amount > 0n)
      .map((q) => ({
        key: `cw20:${q.data!.token.contract}`,
        denom: `cw20:${q.data!.token.contract}`,
        symbol: q.data!.token.symbol,
        decimals: q.data!.token.decimals,
        amount: q.data!.amount,
        cw20: q.data!.token.contract,
      }));
    return [...bank, ...cws];
  }, [balances.data, cw20]);
  return { options, loading: balances.isLoading };
}

export function feeReserveFor(chain: ChainInfo, denom: string): bigint {
  const fc = feeCurrencyOf(chain);
  return fc.coinMinimalDenom === denom ? BigInt(computeFee(fc, "high", 300_000).amount[0].amount) : 0n;
}

export function SendPage() {
  const t = useT();
  const chain = useSelectedChain();
  const address = useAddress(chain);
  const [params] = useSearchParams();
  const { options, loading } = useTokenOptions(chain, address);
  const [tokenKey, setTokenKey] = useState(params.get("denom") ?? "");
  const [recipient, setRecipient] = useState(params.get("to") ?? "");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const selectChain = useChainsStore((s) => s.selectChain);
  const enabledChains = useEnabledChains();

  useEffect(() => {
    if (options.length && !options.some((o) => o.key === tokenKey)) setTokenKey(options[0].key);
  }, [options, tokenKey]);

  const token = options.find((o) => o.key === tokenKey);
  const price = usePrices(token?.coinGeckoId ? [token.coinGeckoId] : []).data?.[token?.coinGeckoId ?? ""];
  const recipientCheck = useRecipientError(recipient, chain, address);
  const everyChain = useAllChains();
  const check = recipient ? checkAddress(recipient, chain, everyChain) : undefined;
  const otherChain = check && !check.ok ? check.otherChain : undefined;
  const max = token ? (token.amount > feeReserveFor(chain, token.denom) ? token.amount - feeReserveFor(chain, token.denom) : 0n) : 0n;

  let parsed: bigint | null = null;
  let amountError = "";
  if (amount && token) {
    try {
      parsed = toBaseUnits(amount, token.decimals);
      if (parsed <= 0n) amountError = t("send.error.zero");
      else if (parsed > token.amount) amountError = t("send.error.exceeds");
    } catch (e) {
      amountError = e instanceof Error ? e.message : String(e);
    }
  }
  const memoSuspicious = /\b([a-z]+\s+){11,}[a-z]+\b/i.test(memo) || /^(0x)?[0-9a-f]{64}$/i.test(memo.trim());
  const valid = !!token && !!address && !!recipient && !recipientCheck.error && parsed !== null && !amountError && !memoSuspicious;

  // A request from a QR code or NFC fills the form; the user still reviews and signs.
  const applyRequest = (r: PaymentRequest, via: "qr" | "nfc") => {
    if (r.prefix !== chain.bech32Config.bech32PrefixAccAddr) {
      const target = enabledChains.find((c) => (r.chainId ? c.chainId === r.chainId : c.bech32Config.bech32PrefixAccAddr === r.prefix));
      if (!target || target.bech32Config.bech32PrefixAccAddr !== r.prefix) {
        toast.error(t("payreq.unknownChain", { prefix: r.prefix }));
        return;
      }
      selectChain(target.chainId);
      toast.info(t("payreq.otherChain", { chain: target.chainName }));
    }
    setRecipient(r.address);
    if (r.denom) setTokenKey(r.denom);
    if (r.amount) setAmount(r.amount);
    if (r.memo !== undefined) setMemo(r.memo);
    toast.success(t("payreq.filled", { via: via === "qr" ? "QR" : "NFC" }), t("payreq.checkAddress", { address: r.address }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !token || !address || parsed === null) return;
    const m = token.cw20 ? msg.cw20Transfer(address, token.cw20, recipient, parsed) : msg.send(address, recipient, token.denom, parsed);
    requestTx({
      chain,
      title: t("send.confirmTitle", { symbol: token.symbol }),
      msgs: [m],
      memo,
      denomInfo: { [token.denom]: { symbol: token.symbol, decimals: token.decimals } },
      onSuccess: () => {
        setAmount("");
        setMemo("");
      },
    });
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("send.title")} subtitle={t("send.subtitle", { chain: chain.chainName })} />
      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-5">
          <Field label={t("send.token")}>
            <Select value={tokenKey} onChange={(e) => setTokenKey(e.target.value)} disabled={loading || options.length === 0}>
              {options.length === 0 && <option>{loading ? t("common.loading") : t("send.noTokens")}</option>}
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.symbol} — {fromBaseUnits(o.amount, o.decimals)}
                </option>
              ))}
            </Select>
          </Field>

          <PayRequestButtons onRequest={applyRequest} />
          <RecipientInput value={recipient} onChange={setRecipient} onMemo={setMemo} chain={chain} own={address} />

          <Field
            label={t("send.amount")}
            error={amountError}
            hint={
              token && (
                <span className="flex justify-between">
                  <span>
                    {t("send.available")}: <Amount amount={token.amount} decimals={token.decimals} symbol={token.symbol} />
                  </span>
                  {parsed !== null && price !== undefined && <Fiat value={toNumber(parsed, token.decimals) * price} />}
                </span>
              )
            }
          >
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
              invalid={!!amountError}
              className="text-lg font-semibold tabular"
              right={
                token && (
                  <>
                    <span className="text-sm text-muted">{token.symbol}</span>
                    <Button size="sm" variant="secondary" onClick={() => setAmount(fromBaseUnits(max, token.decimals))}>
                      {t("common.max")}
                    </Button>
                  </>
                )
              }
            />
          </Field>

          <Field label={t("send.memo")} hint={t("send.memoHint")} error={memoSuspicious ? t("send.memoSecret") : undefined}>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={256} autoComplete="off" spellCheck={false} />
          </Field>

          {otherChain && (
            <Alert tone="info" icon={<ArrowLeftRight className="size-4 text-muted" />}>
              <Link to={`/ibc?to=${encodeURIComponent(recipient)}`} className="font-medium text-rust hover:underline">{t("send.useIbc")}</Link>
            </Alert>
          )}
          {!token && !loading && (
            <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("send.noTokensBody")}</Alert>
          )}

          <Button type="submit" size="lg" block disabled={!valid}>
            {t("common.continue")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
