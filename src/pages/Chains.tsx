import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Plus, Search, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/AppShell";
import { toast } from "@/components/Toaster";
import { Alert, Badge, Button, Card, Field, Input, Modal, Spinner, Tabs, Textarea, TokenIcon, Toggle } from "@/components/ui";
import { useT } from "@/i18n";
import { fetchDirectory, fetchRegistryChain } from "@/lib/chains/registry";
import { bech32ConfigFromPrefix, keyAlgoOf, type ChainInfo } from "@/lib/chains/types";
import { validateChainInfo } from "@/lib/chains/validate";
import { probeRest, probeRpc } from "@/lib/cosmos/rest";
import { isBuiltinChain, useAllChains, useChainsStore } from "@/state/chains";

export function ChainsPage() {
  const t = useT();
  const chains = useAllChains();
  const { enabledChainIds, setEnabled, removeCustomChain } = useChainsStore();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChainInfo | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("chains.title")}
        subtitle={t("chains.subtitle")}
        action={<Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>{t("chains.add")}</Button>}
      />
      <Card className="divide-y divide-line">
        {chains.map((c) => (
          <div key={c.chainId} className="flex items-center gap-3 px-5 py-3.5">
            <TokenIcon src={c.chainSymbolImageUrl} symbol={c.chainName} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-semibold">
                {c.chainName}
                {!isBuiltinChain(c.chainId) && <Badge tone="accent">{t("chains.custom")}</Badge>}
                {c.isTestnet && <Badge>{t("chains.testnet")}</Badge>}
                {keyAlgoOf(c) === "ethsecp256k1" && <Badge tone="warning">EVM · {t("chains.experimental")}</Badge>}
              </div>
              <div className="truncate text-xs text-muted">{c.chainId} · {c.currencies[0]?.coinDenom}</div>
            </div>
            {!isBuiltinChain(c.chainId) && (
              <button onClick={() => setRemoving(c)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger" aria-label={t("common.remove")}>
                <Trash2 className="size-4" />
              </button>
            )}
            <Toggle checked={enabledChainIds.includes(c.chainId)} onChange={(v) => setEnabled(c.chainId, v)} label={<span className="sr-only">{c.chainName}</span>} />
          </div>
        ))}
      </Card>

      {adding && <AddChainModal onClose={() => setAdding(false)} />}
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t("chains.removeTitle")}
        size="sm"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setRemoving(null)}>{t("common.cancel")}</Button>
            <Button variant="danger" block onClick={() => { removeCustomChain(removing!.chainId); setRemoving(null); }}>{t("common.remove")}</Button>
          </>
        }
      >
        <p className="text-sm">{t("chains.removeBody", { chain: removing?.chainName ?? "" })}</p>
      </Modal>
    </div>
  );
}

type Source = "registry" | "json" | "manual";

function AddChainModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const addCustomChain = useChainsStore((s) => s.addCustomChain);
  const [source, setSource] = useState<Source>("registry");
  const [candidate, setCandidate] = useState<ChainInfo | null>(null);
  const [error, setError] = useState("");

  const prepare = async (get: () => Promise<ChainInfo> | ChainInfo) => {
    setError("");
    try {
      const c = await get();
      if (isBuiltinChain(c.chainId)) throw new Error(t("chains.alreadyBuiltin"));
      setCandidate(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal open onClose={onClose} title={t("chains.add")} size="lg">
      {candidate ? (
        <ChainPreview
          chain={candidate}
          onBack={() => setCandidate(null)}
          onConfirm={() => {
            try {
              addCustomChain(candidate);
              toast.success(t("chains.added"), candidate.chainName);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setCandidate(null);
            }
          }}
        />
      ) : (
        <div className="space-y-4">
          <Tabs
            value={source}
            onChange={(s) => { setSource(s); setError(""); }}
            items={[
              { value: "registry", label: t("chains.src.registry") },
              { value: "json", label: t("chains.src.json") },
              { value: "manual", label: t("chains.src.manual") },
            ]}
          />
          {source === "registry" && <RegistrySearch onPick={(name) => prepare(() => fetchRegistryChain(name))} />}
          {source === "json" && <JsonImport onSubmit={(json) => prepare(() => validateChainInfo(JSON.parse(json)))} />}
          {source === "manual" && <ManualForm onSubmit={(c) => prepare(() => validateChainInfo(c))} />}
          {error && <Alert tone="danger" icon={<XCircle className="size-4 text-danger" />}>{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

function RegistrySearch({ onPick }: { onPick: (registryName: string) => Promise<void> }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const dir = useQuery({ queryKey: ["cosmos-directory"], queryFn: fetchDirectory, staleTime: 60 * 60_000 });
  const existing = useAllChains();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ids = new Set(existing.map((c) => c.chainId));
    return (dir.data ?? [])
      .filter((c) => !ids.has(c.chainId))
      .filter((c) => !s || c.prettyName.toLowerCase().includes(s) || c.chainId.toLowerCase().includes(s) || c.symbol?.toLowerCase().includes(s))
      .slice(0, 60);
  }, [dir.data, q, existing]);

  return (
    <div className="space-y-3">
      <Input autoFocus placeholder={t("chains.searchRegistry")} value={q} onChange={(e) => setQ(e.target.value)} right={<Search className="mr-2 size-4 text-muted" />} />
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {dir.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {dir.isError && <p className="text-sm text-danger">{t("common.loadError")}</p>}
        {list.map((c) => (
          <button
            key={c.name}
            disabled={!!busy}
            onClick={async () => {
              setBusy(c.name);
              await onPick(c.name);
              setBusy(null);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
          >
            <TokenIcon src={c.image} symbol={c.prettyName} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{c.prettyName}</div>
              <div className="text-xs text-muted">{c.chainId}{c.symbol ? ` · ${c.symbol}` : ""}</div>
            </div>
            {c.networkType === "testnet" && <Badge>{t("chains.testnet")}</Badge>}
            {busy === c.name && <Spinner className="size-4" />}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{t("chains.registryNote")}</p>
    </div>
  );
}

function JsonImport({ onSubmit }: { onSubmit: (json: string) => Promise<void> }) {
  const t = useT();
  const [json, setJson] = useState("");
  return (
    <div className="space-y-3">
      <Field label={t("chains.jsonLabel")} hint={t("chains.jsonHint")}>
        <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={10} className="font-mono text-xs" spellCheck={false} placeholder='{ "chainId": "...", "chainName": "...", "rpc": "https://...", ... }' />
      </Field>
      <Button block disabled={!json.trim()} onClick={() => onSubmit(json)}>{t("common.continue")}</Button>
    </div>
  );
}

function ManualForm({ onSubmit }: { onSubmit: (c: unknown) => Promise<void> }) {
  const t = useT();
  const [f, setF] = useState({
    chainId: "", chainName: "", rpc: "", rest: "", prefix: "", coinType: "118",
    symbol: "", denom: "", decimals: "6", low: "0.01", average: "0.025", high: "0.04", coinGeckoId: "", image: "", explorer: "",
  });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const build = () => {
    const cur = {
      coinDenom: f.symbol.trim(),
      coinMinimalDenom: f.denom.trim(),
      coinDecimals: Number(f.decimals),
      coinGeckoId: f.coinGeckoId.trim() || undefined,
      coinImageUrl: f.image.trim() || undefined,
    };
    return {
      chainId: f.chainId.trim(),
      chainName: f.chainName.trim(),
      rpc: f.rpc.trim(),
      rest: f.rest.trim(),
      bip44: { coinType: Number(f.coinType) },
      bech32Config: bech32ConfigFromPrefix(f.prefix.trim()),
      currencies: [cur],
      feeCurrencies: [{ ...cur, gasPriceStep: { low: Number(f.low), average: Number(f.average), high: Number(f.high) } }],
      stakeCurrency: cur,
      features: ["ibc-transfer", "ibc-go"],
      chainSymbolImageUrl: cur.coinImageUrl,
      txExplorer: f.explorer.trim() || undefined,
    };
  };
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(build()); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Chain ID"><Input value={f.chainId} onChange={up("chainId")} placeholder="mychain-1" /></Field>
        <Field label={t("chains.form.name")}><Input value={f.chainName} onChange={up("chainName")} /></Field>
        <Field label="RPC"><Input value={f.rpc} onChange={up("rpc")} placeholder="https://rpc…" /></Field>
        <Field label="REST (LCD)"><Input value={f.rest} onChange={up("rest")} placeholder="https://api…" /></Field>
        <Field label={t("chains.form.prefix")}><Input value={f.prefix} onChange={up("prefix")} placeholder="cosmos" /></Field>
        <Field label="Coin type (BIP44)"><Input value={f.coinType} onChange={up("coinType")} inputMode="numeric" /></Field>
        <Field label={t("chains.form.symbol")}><Input value={f.symbol} onChange={up("symbol")} placeholder="ATOM" /></Field>
        <Field label={t("chains.form.denom")}><Input value={f.denom} onChange={up("denom")} placeholder="uatom" /></Field>
        <Field label={t("chains.form.decimals")}><Input value={f.decimals} onChange={up("decimals")} inputMode="numeric" /></Field>
        <Field label="CoinGecko ID"><Input value={f.coinGeckoId} onChange={up("coinGeckoId")} placeholder={t("common.optional")} /></Field>
      </div>
      <Field label={t("chains.form.gas")}>
        <div className="grid grid-cols-3 gap-2">
          <Input value={f.low} onChange={up("low")} aria-label="low" />
          <Input value={f.average} onChange={up("average")} aria-label="average" />
          <Input value={f.high} onChange={up("high")} aria-label="high" />
        </div>
      </Field>
      <Field label={t("chains.form.image")}><Input value={f.image} onChange={up("image")} placeholder="https://…png" /></Field>
      <Field label={t("chains.form.explorer")} hint="https://explorer/tx/${txHash}"><Input value={f.explorer} onChange={up("explorer")} /></Field>
      <Button type="submit" block>{t("common.continue")}</Button>
    </form>
  );
}

function ProbeRow({ label, url, probe, expected }: { label: string; url: string; probe: (u: string) => Promise<string>; expected: string }) {
  const t = useT();
  const q = useQuery({ queryKey: ["probe", label, url], queryFn: () => probe(url), retry: false, staleTime: 60_000 });
  return (
    <div className="flex items-center gap-2 text-sm">
      {q.isLoading ? <Spinner className="size-4" /> : q.data === expected ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-danger" />}
      <span className="w-12 font-medium">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{url}</span>
      {q.data && q.data !== expected && <span className="text-xs text-danger">{t("chains.probeMismatch", { actual: q.data })}</span>}
      {q.isError && <span className="text-xs text-danger">{t("chains.probeFail")}</span>}
    </div>
  );
}

function ChainPreview({ chain, onBack, onConfirm }: { chain: ChainInfo; onBack: () => void; onConfirm: () => void }) {
  const t = useT();
  const [ack, setAck] = useState(false);
  const fee = chain.feeCurrencies[0];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <TokenIcon src={chain.chainSymbolImageUrl} symbol={chain.chainName} size={44} />
        <div>
          <div className="font-display text-lg font-semibold">{chain.chainName}</div>
          <div className="text-sm text-muted">{chain.chainId}</div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-surface-2 p-4 text-sm">
        <dt className="text-muted">{t("chains.form.prefix")}</dt><dd className="font-mono">{chain.bech32Config.bech32PrefixAccAddr}</dd>
        <dt className="text-muted">Coin type</dt><dd className="font-mono">{chain.bip44.coinType}</dd>
        <dt className="text-muted">{t("chains.form.symbol")}</dt><dd>{chain.currencies[0]?.coinDenom} ({chain.currencies[0]?.coinMinimalDenom}, {chain.currencies[0]?.coinDecimals})</dd>
        <dt className="text-muted">{t("tx.fee")}</dt><dd>{fee.coinDenom} · {fee.gasPriceStep?.low}/{fee.gasPriceStep?.average}/{fee.gasPriceStep?.high}</dd>
      </dl>
      <div className="space-y-2">
        <div className="text-sm font-medium">{t("chains.endpointCheck")}</div>
        <ProbeRow label="RPC" url={chain.rpc} probe={probeRpc} expected={chain.chainId} />
        <ProbeRow label="REST" url={chain.rest} probe={probeRest} expected={chain.chainId} />
      </div>
      {keyAlgoOf(chain) === "ethsecp256k1" && (
        <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />}>{t("chains.evmWarning")}</Alert>
      )}
      <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />} title={t("chains.trustTitle")}>
        {t("chains.trustBody")}
      </Alert>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-rust" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>{t("chains.trustAck")}</span>
      </label>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>{t("common.back")}</Button>
        <Button block disabled={!ack} onClick={onConfirm}>{t("chains.add")}</Button>
      </div>
    </div>
  );
}
