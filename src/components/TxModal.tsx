import type { EncodeObject } from "@cosmjs/proto-signing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, FileJson, ListChecks, XCircle } from "lucide-react";
import { useState } from "react";
import { create } from "zustand";
import { useBalanceOf, useAddress, usePrices } from "@/hooks/queries";
import { useLocale, useT, type MessageKey } from "@/i18n";
import { explorerTxUrl, feeCurrencyOf, type ChainInfo } from "@/lib/chains/types";
import { formatAmount, shortAddress, toNumber } from "@/lib/format";
import {
  computeFee,
  explainTxError,
  msgsToJson,
  signAndBroadcast,
  simulate,
  summarize,
  type BroadcastResult,
  type FeeLevel,
  type MsgSummary,
} from "@/lib/cosmos/tx";
import { useWallet } from "@/state/wallet";
import { Fiat } from "./Amount";
import { toast } from "./Toaster";
import { Alert, Badge, Button, Spinner, Tabs, cx, Modal } from "./ui";

export interface TxRequest {
  chain: ChainInfo;
  msgs: EncodeObject[];
  memo?: string;
  title: string;
  denomInfo?: Record<string, { symbol: string; decimals: number }>;
  onSuccess?: (r: BroadcastResult) => void;
}

interface TxStore {
  request: TxRequest | null;
  open: (r: TxRequest) => void;
  close: () => void;
}

export const useTxStore = create<TxStore>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));

export const requestTx = (r: TxRequest) => useTxStore.getState().open(r);

export function TxModalHost() {
  const request = useTxStore((s) => s.request);
  const close = useTxStore((s) => s.close);
  if (!request) return null;
  return <TxModal key={JSON.stringify(request.msgs, (_k, v) => (typeof v === "bigint" ? v.toString() : v))} request={request} onClose={close} />;
}

export function useTxErrorText() {
  const t = useT();
  return (e: unknown) => {
    const code = explainTxError(e);
    const key = `tx.error.${code}` as MessageKey;
    const known = ["insufficient-funds", "account-not-found", "out-of-gas", "timeout", "network", "rejected"];
    return known.includes(code) ? t(key) : code;
  };
}

function MsgRow({ s, chain, denomInfo }: { s: MsgSummary; chain: ChainInfo; denomInfo?: TxRequest["denomInfo"] }) {
  const t = useT();
  const locale = useLocale();
  const fmt = (c: { denom: string; amount: string }) => {
    const cur = chain.currencies.find((x) => x.coinMinimalDenom === c.denom);
    const info = denomInfo?.[c.denom] ?? (cur ? { symbol: cur.coinDenom, decimals: cur.coinDecimals } : { symbol: c.denom, decimals: 0 });
    return `${formatAmount(c.amount, info.decimals, { locale, maxDecimals: info.decimals })} ${info.symbol}`;
  };
  const label = t(`tx.kind.${s.kind}` as MessageKey);
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        {s.coins?.map((c, i) => (
          <span key={i} className="tabular font-semibold">
            {fmt(c)}
          </span>
        ))}
      </div>
      <dl className="mt-2 space-y-1 text-sm">
        {Object.entries(s.fields).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted">{t(`tx.field.${k}` as MessageKey)}</dt>
            <dd className="min-w-0 break-all text-right font-mono text-xs leading-5" title={v}>
              {k === "option" ? t(`gov.option.${v}` as MessageKey) : k === "receive" && denomInfo?.[v] ? denomInfo[v].symbol : v.length > 48 ? shortAddress(v, 16, 10) : v}
            </dd>
          </div>
        ))}
      </dl>
      {s.kind === "unknown" && <p className="mt-2 font-mono text-xs text-muted">{s.typeUrl}</p>}
    </div>
  );
}

function TxModal({ request, onClose }: { request: TxRequest; onClose: () => void }) {
  const { chain, msgs, title } = request;
  const t = useT();
  const locale = useLocale();
  const qc = useQueryClient();
  const { backend, version } = useWallet();
  const address = useAddress(chain);
  const errorText = useTxErrorText();
  const feeCur = feeCurrencyOf(chain);
  const feeBalance = useBalanceOf(chain, address, feeCur.coinMinimalDenom);
  const prices = usePrices(feeCur.coinGeckoId ? [feeCur.coinGeckoId] : []);
  const [level, setLevel] = useState<FeeLevel>("average");
  const [view, setView] = useState<"summary" | "raw">("summary");
  const [phase, setPhase] = useState<"review" | "signing" | "done" | "failed">("review");
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [failure, setFailure] = useState<string>("");
  const memo = request.memo ?? "";

  const sim = useQuery({
    queryKey: ["simulate", chain.chainId, backend?.id, version, msgsToJson(msgs), memo],
    queryFn: async () => simulate(chain, await backend!.getSigner(chain), msgs, memo),
    enabled: !!backend,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });

  const fees = sim.data
    ? (Object.fromEntries((["low", "average", "high"] as FeeLevel[]).map((l) => [l, computeFee(feeCur, l, sim.data.gasLimit)])) as Record<FeeLevel, ReturnType<typeof computeFee>>)
    : undefined;
  const fee = fees?.[level];
  const feeAmount = fee ? BigInt(fee.amount[0].amount) : 0n;

  const spent = msgs
    .map(summarize)
    .flatMap((s) => s.coins ?? [])
    .filter((c) => c.denom === feeCur.coinMinimalDenom)
    .reduce((a, c) => a + BigInt(c.amount), 0n);
  const insufficient = !!fee && feeBalance < feeAmount + spent;

  const approve = async () => {
    if (!backend || !fee) return;
    setPhase("signing");
    try {
      const r = await signAndBroadcast(chain, await backend.getSigner(chain), msgs, fee, memo);
      setResult(r);
      if (r.code === 0) {
        setPhase("done");
        toast.success(t("tx.success"), title);
        request.onSuccess?.(r);
      } else {
        setFailure(r.rawLog || `code ${r.code}`);
        setPhase("failed");
      }
    } catch (e) {
      setFailure(errorText(e));
      setPhase("failed");
    } finally {
      setTimeout(() => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === chain.chainId }), 1500);
    }
  };

  const txUrl = result ? explorerTxUrl(chain, result.txHash) : undefined;

  if (phase === "done" || phase === "failed") {
    const ok = phase === "done";
    return (
      <Modal open onClose={onClose} title={title} size="md" footer={<Button block onClick={onClose}>{t("common.close")}</Button>}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          {ok ? <CheckCircle2 className="size-14 text-success" /> : <XCircle className="size-14 text-danger" />}
          <div className="font-display text-xl font-semibold">{ok ? t("tx.success") : t("tx.failed")}</div>
          {ok ? <p className="text-sm text-muted">{t("tx.successBody")}</p> : <p className="max-w-md break-words text-sm text-muted">{failure}</p>}
          {result && (
            <div className="mt-2 w-full rounded-xl bg-surface-2 p-3 text-left text-xs">
              <div className="text-muted">{t("tx.hash")}</div>
              <div className="break-all font-mono">{result.txHash}</div>
            </div>
          )}
          {txUrl && (
            <a href={txUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-rust hover:underline">
              {t("tx.viewExplorer")} <ExternalLink className="size-4" />
            </a>
          )}
        </div>
      </Modal>
    );
  }

  const signing = phase === "signing";
  return (
    <Modal
      open
      onClose={signing ? () => {} : onClose}
      dismissable={!signing}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose} disabled={signing}>
            {t("common.reject")}
          </Button>
          <Button block onClick={approve} loading={signing} disabled={!fee || insufficient || sim.isError}>
            {backend?.hardware ? t("tx.approveLedger") : backend && !backend.id.startsWith("local") ? t("tx.approveIn", { wallet: backend.label }) : t("tx.approve")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{t("tx.network")}</span>
          <span className="flex items-center gap-2 font-medium">
            {chain.chainName} <Badge>{chain.chainId}</Badge>
          </span>
        </div>

        <div className="flex justify-between">
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { value: "summary", label: <span className="flex items-center gap-1.5"><ListChecks className="size-4" />{t("tx.summary")}</span> },
              { value: "raw", label: <span className="flex items-center gap-1.5"><FileJson className="size-4" />{t("tx.raw")}</span> },
            ]}
          />
        </div>

        {view === "summary" ? (
          <div className="space-y-2">
            {msgs.map((m, i) => (
              <MsgRow key={i} s={summarize(m)} chain={chain} denomInfo={request.denomInfo} />
            ))}
          </div>
        ) : (
          <pre className="max-h-64 overflow-auto rounded-xl bg-ink p-3 text-xs leading-relaxed text-huahua-50">{msgsToJson(msgs)}</pre>
        )}

        {memo && (
          <div className="text-sm">
            <div className="text-muted">{t("tx.memo")}</div>
            <div className="mt-1 break-words rounded-lg bg-surface-2 p-2 font-mono text-xs">{memo}</div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t("tx.fee")}</span>
            {sim.isLoading && <span className="flex items-center gap-2 text-muted"><Spinner className="size-4" /> {t("tx.estimating")}</span>}
            {sim.data && <span className="text-xs text-muted">{t("tx.gas", { gas: sim.data.gasLimit.toLocaleString(locale) })}</span>}
          </div>
          {fees && (
            <div className="grid grid-cols-3 gap-2">
              {(["low", "average", "high"] as FeeLevel[]).map((l) => {
                const amt = BigInt(fees[l].amount[0].amount);
                const price = feeCur.coinGeckoId ? prices.data?.[feeCur.coinGeckoId] : undefined;
                return (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={cx(
                      "rounded-xl border p-2.5 text-left transition-colors",
                      level === l ? "border-rust bg-huahua-300/20 ring-2 ring-rust/20" : "border-line hover:bg-surface-2",
                    )}
                  >
                    <div className="text-xs font-medium text-muted">{t(`tx.feeLevel.${l}`)}</div>
                    <div className="tabular text-sm font-semibold">
                      {formatAmount(amt, feeCur.coinDecimals, { locale })} <span className="text-xs text-muted">{feeCur.coinDenom}</span>
                    </div>
                    <Fiat className="text-xs text-muted" value={price !== undefined ? toNumber(amt, feeCur.coinDecimals) * price : undefined} />
                  </button>
                );
              })}
            </div>
          )}
          {sim.isError && (
            <Alert tone="danger" icon={<AlertTriangle className="size-4 text-danger" />} title={t("tx.simulationFailed")}>
              <span className="break-words">{errorText(sim.error)}</span>
            </Alert>
          )}
          {insufficient && (
            <Alert tone="danger" icon={<AlertTriangle className="size-4 text-danger" />} title={t("tx.error.insufficient-funds")}>
              {t("tx.insufficientBody", { symbol: feeCur.coinDenom })}
            </Alert>
          )}
        </div>

        <p className="text-xs text-muted">
          {signing && backend?.hardware
            ? t("tx.confirmOnLedger")
            : signing && backend && !backend.id.startsWith("local")
              ? t("tx.confirmInWallet", { wallet: backend.label })
              : t("tx.reviewNotice")}
        </p>
      </div>
    </Modal>
  );
}
