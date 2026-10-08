import { toBech32 } from "@cosmjs/encoding";
import { rawSecp256k1PubkeyToRawAddress } from "@cosmjs/amino";
import { fromHex } from "@cosmjs/encoding";
import { CheckCircle2, ExternalLink, Eye, Usb } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { useT } from "@/i18n";
import { extApi } from "@/lib/kv";
import type { NewKey } from "@/lib/keyring/keyring";
import { isLedgerSupported, isNativeLedger, readLedgerPubkey, showAddressOnLedger } from "../ledger/ledger";
import { isFullTab } from "../popup/view";

export function LedgerConnect({ onNext, onBack }: { onNext: (k: Omit<NewKey, "name">) => void; onBack?: () => void }) {
  const t = useT();
  const [account, setAccount] = useState("0");
  const [index, setIndex] = useState("0");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<"read" | "verify" | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");

  const acc = Number(account);
  const idx = Number(index);
  const pathOk = Number.isInteger(acc) && acc >= 0 && Number.isInteger(idx) && idx >= 0;
  const address = (prefix: string) => (pubkey ? toBech32(prefix, rawSecp256k1PubkeyToRawAddress(fromHex(pubkey))) : "");

  if (!isLedgerSupported()) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("ledger.title")}</h2>
        <Alert tone="warning" icon={<Usb className="size-4 text-warning" />} title={t("ledger.unsupportedTitle")}>
          {t("ledger.unsupportedBody")}
        </Alert>
        {onBack && <Button variant="secondary" onClick={onBack}>{t("common.back")}</Button>}
      </div>
    );
  }

  if (!isFullTab()) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{t("ledger.title")}</h2>
        <p className="text-sm text-muted">{t("ledger.fullViewBody")}</p>
        <Button
          block
          icon={<ExternalLink className="size-4" />}
          onClick={() => {
            void extApi()?.tabs.create({ url: extApi()!.runtime.getURL("popup.html#/accounts/add") });
            window.close();
          }}
        >
          {t("ext.expand")}
        </Button>
      </div>
    );
  }

  const read = async () => {
    setBusy("read");
    setError("");
    setVerified(false);
    try {
      setPubkey(await readLedgerPubkey(acc, idx));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setBusy("verify");
    setError("");
    try {
      const shown = await showAddressOnLedger(acc, idx);
      if (shown !== address("cosmos")) throw new Error(t("ledger.mismatch"));
      setVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-ink text-huahua-50 dark:bg-huahua-50 dark:text-ink">
          <Usb className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">{t("ledger.title")}</h2>
          <p className="text-sm text-muted">{t("ledger.subtitle")}</p>
        </div>
      </div>

      <ol className="space-y-2 text-sm">
        {(isNativeLedger() ? (["ledger.mobile.step1", "ledger.step2", "ledger.mobile.step3"] as const) : (["ledger.step1", "ledger.step2", "ledger.step3"] as const)).map((k, i) => (
          <li key={k} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-huahua-300 text-xs font-bold text-ink">{i + 1}</span>
            <span className="pt-0.5">{t(k)}</span>
          </li>
        ))}
      </ol>

      <div>
        <button type="button" className="text-sm font-medium text-rust hover:underline" onClick={() => setAdvanced((a) => !a)}>
          {advanced ? t("onboarding.import.hideAdvanced") : t("ledger.advanced")}
        </button>
        {advanced && (
          <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
            <p className="text-xs text-muted">{t("ledger.pathHint")}</p>
            <div className="flex items-center gap-2 font-mono text-sm">
              <span className="text-muted">m/44'/118'/</span>
              <Input className="w-20" inputMode="numeric" value={account} onChange={(e) => { setAccount(e.target.value); setPubkey(null); }} aria-label="account" />
              <span className="text-muted">'/0/</span>
              <Input className="w-20" inputMode="numeric" value={index} onChange={(e) => { setIndex(e.target.value); setPubkey(null); }} aria-label="index" />
            </div>
          </div>
        )}
      </div>

      {pubkey && (
        <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
          <Field label={t("ledger.address")}>
            <div className="break-all font-mono text-xs">{address("chihuahua")}</div>
          </Field>
          <div className="break-all font-mono text-[11px] text-muted">{address("cosmos")}</div>
          {verified ? (
            <div className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="size-4" /> {t("ledger.verified")}
            </div>
          ) : (
            <Button size="sm" variant="secondary" icon={<Eye className="size-4" />} loading={busy === "verify"} onClick={verify}>
              {t("ledger.verify")}
            </Button>
          )}
        </div>
      )}

      {busy && (
        <Alert tone="info" icon={<Usb className="size-4 text-muted" />}>
          {busy === "verify" ? t("ledger.checkScreen") : t("ledger.connecting")}
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex gap-2">
        {onBack && (
          <Button variant="secondary" onClick={onBack} disabled={!!busy}>
            {t("common.back")}
          </Button>
        )}
        {pubkey ? (
          <Button block onClick={() => onNext({ type: "ledger", secret: pubkey, hdAccount: acc, hdIndex: idx, backedUp: true })} disabled={!!busy}>
            {t("common.continue")}
          </Button>
        ) : (
          <Button block icon={<Usb className="size-4" />} loading={busy === "read"} disabled={!pathOk} onClick={read}>
            {t("ledger.connect")}
          </Button>
        )}
      </div>
    </div>
  );
}
