import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, CheckCircle2, Info } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Amount } from "@/components/Amount";
import { PageHeader } from "@/components/layout/AppShell";
import { RecipientInput, useRecipientError } from "@/components/RecipientInput";
import { requestTx } from "@/components/TxModal";
import { Alert, Button, Card, Field, Input, Select, Spinner, TokenIcon } from "@/components/ui";
import { useAddress } from "@/hooks/queries";
import { useT } from "@/i18n";
import { fetchIbcChannel } from "@/lib/chains/registry";
import { supportsFeature } from "@/lib/chains/types";
import { getTransferChannel } from "@/lib/cosmos/rest";
import { msg } from "@/lib/cosmos/tx";
import { fromBaseUnits, toBaseUnits } from "@/lib/format";
import { useAllChains, useSelectedChain } from "@/state/chains";
import { feeReserveFor, useTokenOptions } from "./Send";

export function IbcPage() {
  const t = useT();
  const source = useSelectedChain();
  const all = useAllChains();
  const [params] = useSearchParams();
  const destinations = all.filter((c) => c.chainId !== source.chainId);
  const [destId, setDestId] = useState("");
  const dest = destinations.find((c) => c.chainId === destId);
  const address = useAddress(source);
  const ownDestAddress = useAddress(dest);
  const { options } = useTokenOptions(source, address);
  const bankOptions = options.filter((o) => !o.cw20);
  const [tokenKey, setTokenKey] = useState("");
  const [recipient, setRecipient] = useState(params.get("to") ?? "");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [customChannel, setCustomChannel] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    const to = params.get("to");
    if (!to || destId) return;
    const match = destinations.find((c) => to.startsWith(c.bech32Config.bech32PrefixAccAddr + "1"));
    if (match) setDestId(match.chainId);
  }, [params, destinations, destId]);

  useEffect(() => {
    if (ownDestAddress && !recipient) setRecipient(ownDestAddress);
  }, [ownDestAddress, recipient]);

  useEffect(() => {
    if (bankOptions.length && !bankOptions.some((o) => o.key === tokenKey)) setTokenKey(bankOptions[0].key);
  }, [bankOptions, tokenKey]);

  const registryChannel = useQuery({
    queryKey: ["ibc-channel", source.registryName, dest?.registryName],
    queryFn: () => fetchIbcChannel(source.registryName!, dest!.registryName!).then((c) => c ?? null),
    enabled: !!source.registryName && !!dest?.registryName,
    staleTime: Infinity,
  });
  const channelId = useCustom ? customChannel.trim() : (registryChannel.data?.sourceChannel ?? "");

  const onchain = useQuery({
    queryKey: ["channel-check", source.chainId, channelId],
    queryFn: () => getTransferChannel(source, channelId),
    enabled: /^channel-\d+$/.test(channelId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const channelOk = onchain.data?.state === "STATE_OPEN" && (!onchain.data.counterpartyChainId || onchain.data.counterpartyChainId === dest?.chainId);
  const channelMismatch = onchain.data && onchain.data.counterpartyChainId && dest && onchain.data.counterpartyChainId !== dest.chainId;

  const token = bankOptions.find((o) => o.key === tokenKey);
  const reserve = token ? feeReserveFor(source, token.denom) : 0n;
  const max = token ? (token.amount > reserve ? token.amount - reserve : 0n) : 0n;
  const recipientCheck = useRecipientError(recipient, dest ?? source);

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

  const valid = !!dest && !!token && !!address && channelOk && !!recipient && !recipientCheck.error && parsed !== null && !amountError;
  const ibcEnabled = supportsFeature(source, "ibc-transfer");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !token || !address || parsed === null || !dest) return;
    requestTx({
      chain: source,
      title: t("ibc.confirmTitle", { symbol: token.symbol, chain: dest.chainName }),
      msgs: [msg.ibcTransfer(address, recipient, channelId, token.denom, parsed, memo)],
      denomInfo: { [token.denom]: { symbol: token.symbol, decimals: token.decimals } },
      onSuccess: () => setAmount(""),
    });
  };

  const destSorted = useMemo(() => [...destinations].sort((a, b) => a.chainName.localeCompare(b.chainName)), [destinations]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("ibc.title")} subtitle={t("ibc.subtitle")} />
      <Card className="p-5 sm:p-6">
        {!ibcEnabled && <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("ibc.notSupported")}</Alert>}
        <form onSubmit={submit} className="space-y-5">
          <div className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted">{t("ibc.from")}</div>
            <div className="mt-1 flex items-center gap-2 font-semibold">
              <TokenIcon src={source.chainSymbolImageUrl} symbol={source.chainName} size={24} /> {source.chainName}
            </div>
          </div>
          <div className="-my-2 flex justify-center"><ArrowDown className="size-5 text-muted" /></div>
          <Field label={t("ibc.to")}>
            <Select
              value={destId}
              onChange={(e) => {
                setDestId(e.target.value);
                setRecipient("");
                setUseCustom(false);
              }}
            >
              <option value="">{t("ibc.chooseDest")}</option>
              {destSorted.map((c) => (
                <option key={c.chainId} value={c.chainId}>{c.chainName}</option>
              ))}
            </Select>
          </Field>

          {dest && (
            <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t("ibc.channel")}</span>
                {!useCustom && registryChannel.isLoading && <Spinner className="size-4" />}
                {!useCustom && channelId && <span className="font-mono font-semibold">{channelId}</span>}
                {!useCustom && registryChannel.isFetched && !channelId && <span className="text-warning">{t("ibc.noChannel")}</span>}
              </div>
              {useCustom && (
                <Input value={customChannel} onChange={(e) => setCustomChannel(e.target.value)} placeholder="channel-0" className="h-9 font-mono" />
              )}
              {onchain.isLoading && channelId && <div className="flex items-center gap-2 text-muted"><Spinner className="size-4" /> {t("ibc.verifying")}</div>}
              {channelOk && (
                <div className="flex items-center gap-1.5 text-success">
                  <CheckCircle2 className="size-4" /> {t("ibc.verified", { chain: onchain.data?.counterpartyChainId ?? dest.chainId })}
                </div>
              )}
              {channelMismatch && (
                <div className="flex items-center gap-1.5 text-danger">
                  <AlertTriangle className="size-4" /> {t("ibc.mismatch", { actual: onchain.data!.counterpartyChainId!, expected: dest.chainId })}
                </div>
              )}
              {onchain.isError && <div className="text-danger">{t("ibc.channelError")}</div>}
              <button type="button" className="text-xs font-medium text-rust hover:underline" onClick={() => setUseCustom((u) => !u)}>
                {useCustom ? t("ibc.useRegistry") : t("ibc.useCustom")}
              </button>
            </div>
          )}

          <Field label={t("send.token")}>
            <Select value={tokenKey} onChange={(e) => setTokenKey(e.target.value)}>
              {bankOptions.map((o) => (
                <option key={o.key} value={o.key}>{o.symbol} — {fromBaseUnits(o.amount, o.decimals)}</option>
              ))}
            </Select>
          </Field>

          {dest && <RecipientInput value={recipient} onChange={setRecipient} chain={dest} label={t("ibc.recipient", { chain: dest.chainName })} />}

          <Field
            label={t("send.amount")}
            error={amountError}
            hint={token && <span>{t("send.available")}: <Amount amount={token.amount} decimals={token.decimals} symbol={token.symbol} /></span>}
          >
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
              invalid={!!amountError}
              className="text-lg font-semibold tabular"
              right={token && <Button size="sm" variant="secondary" onClick={() => setAmount(fromBaseUnits(max, token.decimals))}>{t("common.max")}</Button>}
            />
          </Field>

          <Field label={t("send.memo")} hint={t("ibc.memoHint")}>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={256} autoComplete="off" spellCheck={false} />
          </Field>

          <Alert tone="info" icon={<Info className="size-4 text-muted" />}>{t("ibc.note")}</Alert>

          <Button type="submit" size="lg" block disabled={!valid || !ibcEnabled}>{t("common.continue")}</Button>
        </form>
      </Card>
    </div>
  );
}
