import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileJson, Globe, Link2, ListChecks, Network, PenLine, Usb } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Mascot } from "@/components/Logo";
import { Alert, Badge, Button, Spinner, Tabs, TokenIcon } from "@/components/ui";
import { useLocale, useT, type MessageKey } from "@/i18n";
import { formatAmount, shortAddress } from "@/lib/format";
import { extApi } from "@/lib/kv";
import { useAllChains } from "@/state/chains";
import type { Approval, ApprovalMsg } from "../shared/protocol";
import { signAminoWithLedger } from "../ledger/ledger";
import { bg } from "./background";
import { useSelectedKey } from "../state/keyringStore";

function useKeepAlive() {
  useEffect(() => {
    const port = extApi()?.runtime.connect({ name: "huallet-approval" });
    const timer = setInterval(() => port?.postMessage("ping"), 20_000);
    return () => {
      clearInterval(timer);
      port?.disconnect();
    };
  }, []);
}

function Origin({ origin }: { origin: string }) {
  const host = (() => {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  })();
  return (
    <div className="flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm">
      <Globe className="size-4 text-muted" />
      <span className="font-semibold">{host}</span>
      {origin.startsWith("http://") && <Badge tone="warning">http</Badge>}
    </div>
  );
}

function Layout({ icon, title, origin, children, footer }: { icon: ReactNode; title: string; origin: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Mascot size={26} />
        <span className="font-display font-semibold">Huallet</span>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-huahua-300 text-ink">{icon}</div>
          <h1 className="text-xl font-bold">{title}</h1>
          <Origin origin={origin} />
        </div>
        {children}
      </div>
      <footer className="flex gap-2 border-t border-line p-4">{footer}</footer>
    </div>
  );
}

function MsgCard({ m, chainId }: { m: ApprovalMsg; chainId: string }) {
  const t = useT();
  const locale = useLocale();
  const chains = useAllChains();
  const chain = chains.find((c) => c.chainId === chainId);
  const fmt = (c: { denom: string; amount: string }) => {
    const cur = chain?.currencies.find((x) => x.coinMinimalDenom === c.denom);
    return cur ? `${formatAmount(c.amount, cur.coinDecimals, { locale, maxDecimals: cur.coinDecimals })} ${cur.coinDenom}` : `${c.amount} ${shortAddress(c.denom, 10, 4)}`;
  };
  const known = ["send", "cw20-send", "delegate", "undelegate", "redelegate", "claim", "vote", "ibc", "swap", "curve-buy", "curve-sell"].includes(m.kind);
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{known ? t(`tx.kind.${m.kind}` as MessageKey) : m.typeUrl.split(".").pop()?.replace(/^\//, "")}</span>
        {m.coins?.map((c, i) => (
          <span key={i} className="tabular font-semibold">
            {fmt(c)}
          </span>
        ))}
      </div>
      {!known && <div className="mt-1 break-all font-mono text-[11px] text-muted">{m.typeUrl}</div>}
      <dl className="mt-2 space-y-1 text-xs">
        {Object.entries(m.fields).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted">{t(`tx.field.${k}` as MessageKey)}</dt>
            <dd className="min-w-0 break-all text-right font-mono">{v.length > 40 ? shortAddress(v, 14, 8) : v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Approve() {
  const { id = "" } = useParams();
  const t = useT();
  useKeepAlive();
  const approval = useQuery({ queryKey: ["approval", id], queryFn: () => bg<Approval>({ type: "getApproval", id }), retry: false, staleTime: Infinity });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const respond = async (approved: boolean) => {
    setBusy(true);
    setError("");
    try {
      const a = approval.data;
      let result: unknown;
      if (approved && a?.type === "sign" && a.ledger && a.signDoc) {
        result = await signAminoWithLedger(a.signDoc, a.signer, a.ledger.prefix, a.ledger.hdAccount, a.ledger.hdIndex, { allowChooser: true });
      }
      await bg({ type: "resolveApproval", id, approved, result });
      window.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (approval.data?.type === "unlock") void respond(true);
  }, [approval.data?.type]);

  if (approval.isLoading || approval.data?.type === "unlock") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!approval.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Mascot size={64} />
        <p className="text-sm text-muted">{t("ext.approve.expired")}</p>
        <Button onClick={() => window.close()}>{t("common.close")}</Button>
      </div>
    );
  }

  const a = approval.data;
  const footer = (
    <>
      <Button variant="secondary" block disabled={busy} onClick={() => respond(false)}>
        {t("common.reject")}
      </Button>
      <Button block loading={busy} onClick={() => respond(true)} icon={a.type === "sign" && a.ledger ? <Usb className="size-4" /> : undefined}>
        {a.type === "sign" ? (a.ledger ? t("ext.approve.signLedger") : t("ext.approve.sign")) : t("ext.approve.approve")}
      </Button>
    </>
  );
  const errorBox = (
    <>
      {busy && a.type === "sign" && a.ledger && (
        <Alert tone="info" icon={<Usb className="size-4 text-muted" />} title={t("tx.confirmOnLedger")}>
          {t("ledger.checkScreen")}
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </>
  );

  if (a.type === "connect") return <ConnectApproval a={a} footer={footer} error={errorBox} />;
  if (a.type === "suggest-chain") return <SuggestApproval a={a} footer={footer} error={errorBox} />;
  if (a.type === "sign") return <SignApproval a={a} footer={footer} error={errorBox} />;
  return null;
}

function ConnectApproval({ a, footer, error }: { a: Extract<Approval, { type: "connect" }>; footer: ReactNode; error: ReactNode }) {
  const t = useT();
  const key = useSelectedKey();
  return (
    <Layout icon={<Link2 className="size-6" />} title={t("ext.approve.connectTitle")} origin={a.origin} footer={footer}>
      <p className="text-center text-sm text-muted">{t("ext.approve.connectBody", { account: key?.name ?? "" })}</p>
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("ext.approve.chains")}</div>
        <ul className="space-y-1 text-sm">
          {a.chainNames.map((n, i) => (
            <li key={a.chainIds[i]} className="flex justify-between gap-2">
              <span className="font-semibold">{n}</span>
              <span className="font-mono text-xs text-muted">{a.chainIds[i]}</span>
            </li>
          ))}
        </ul>
      </div>
      <ul className="space-y-1.5 text-xs text-muted">
        <li>✓ {t("ext.approve.connectCan")}</li>
        <li>✕ {t("ext.approve.connectCannot")}</li>
      </ul>
      {error}
    </Layout>
  );
}

function SuggestApproval({ a, footer, error }: { a: Extract<Approval, { type: "suggest-chain" }>; footer: ReactNode; error: ReactNode }) {
  const t = useT();
  const c = a.chain;
  return (
    <Layout icon={<Network className="size-6" />} title={t("ext.approve.suggestTitle")} origin={a.origin} footer={footer}>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <TokenIcon src={c.chainSymbolImageUrl} symbol={c.chainName} />
        <div className="min-w-0">
          <div className="font-semibold">{c.chainName}</div>
          <div className="truncate text-xs text-muted">{c.chainId} · {c.currencies[0]?.coinDenom}</div>
        </div>
      </div>
      <dl className="space-y-1 rounded-xl bg-surface-2 p-3 text-xs">
        <div className="flex justify-between gap-2"><dt className="text-muted">RPC</dt><dd className="truncate font-mono">{c.rpc}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">REST</dt><dd className="truncate font-mono">{c.rest}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Prefix</dt><dd className="font-mono">{c.bech32Config.bech32PrefixAccAddr}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Coin type</dt><dd className="font-mono">{c.bip44.coinType}</dd></div>
      </dl>
      <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />} title={t("chains.trustTitle")}>
        {t("chains.trustBody")}
      </Alert>
      {error}
    </Layout>
  );
}

function SignApproval({ a, footer, error }: { a: Extract<Approval, { type: "sign" }>; footer: ReactNode; error: ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const chain = useAllChains().find((c) => c.chainId === a.chainId);
  const fmtCoin = (c: { denom: string; amount: string }) => {
    const cur = chain?.feeCurrencies.find((x) => x.coinMinimalDenom === c.denom) ?? chain?.currencies.find((x) => x.coinMinimalDenom === c.denom);
    return cur ? `${formatAmount(c.amount, cur.coinDecimals, { locale, maxDecimals: cur.coinDecimals })} ${cur.coinDenom}` : `${c.amount} ${shortAddress(c.denom, 10, 4)}`;
  };
  const [view, setView] = useState<"summary" | "raw">("summary");
  return (
    <Layout icon={<PenLine className="size-6" />} title={a.mode === "arbitrary" ? t("ext.approve.signMessageTitle") : t("ext.approve.signTitle")} origin={a.origin} footer={footer}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{t("tx.network")}</span>
        <span className="flex items-center gap-2 font-medium">
          {a.chainName} <Badge>{a.chainId}</Badge>
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{t("ext.approve.signer")}</span>
        <span className="font-mono text-xs">{shortAddress(a.signer, 12, 6)}</span>
      </div>

      {a.mode === "arbitrary" ? (
        <>
          <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-3 font-mono text-xs">{a.data}</div>
          <Alert tone="info">{t("ext.approve.arbitraryNote")}</Alert>
        </>
      ) : (
        <>
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { value: "summary", label: <span className="flex items-center gap-1.5"><ListChecks className="size-4" />{t("tx.summary")}</span> },
              { value: "raw", label: <span className="flex items-center gap-1.5"><FileJson className="size-4" />{t("tx.raw")}</span> },
            ]}
          />
          {view === "summary" ? (
            <div className="space-y-2">
              {a.messages.map((m, i) => <MsgCard key={i} m={m} chainId={a.chainId} />)}
              {a.mode === "amino" && <p className="text-xs text-muted">{t("ext.approve.aminoNote")}</p>}
            </div>
          ) : (
            <pre className="max-h-64 overflow-auto rounded-xl bg-ink p-3 text-[11px] leading-relaxed text-huahua-50">{a.json}</pre>
          )}
          {a.memo && (
            <div className="text-sm">
              <div className="text-muted">{t("tx.memo")}</div>
              <div className="mt-1 break-words rounded-lg bg-surface-2 p-2 font-mono text-xs">{a.memo}</div>
            </div>
          )}
          {a.fee && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{t("tx.fee")}</span>
              <span className="tabular text-xs font-semibold">{a.fee.amount.map(fmtCoin).join(" + ") || "0"} · gas {Number(a.fee.gas).toLocaleString(locale)}</span>
            </div>
          )}
          {a.messages.some((m) => m.kind === "unknown") && (
            <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("ext.approve.unknownMsg")}</Alert>
          )}
        </>
      )}
      <p className="text-xs text-muted">{t("tx.reviewNotice")}</p>
      {error}
    </Layout>
  );
}
