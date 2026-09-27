import { Nfc as NfcIcon, QrCode as QrIcon, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { toast } from "@/components/Toaster";
import { Alert, Button, Field, Input, Modal, Select } from "@/components/ui";
import { useT } from "@/i18n";
import { fromBaseUnits, toBaseUnits } from "@/lib/format";
import type { ChainInfo } from "@/lib/chains/types";
import { nfcApi, qrScanner } from "@/lib/native";
import { buildPaymentUri, parsePaymentRequest, type PaymentRequest } from "@/lib/payreq";

export interface PayToken {
  key: string;
  symbol: string;
  decimals: number;
  amount: bigint;
}

/** What the payer chose before tapping: it wins over any amount in the request. */
export interface ChosenAmount {
  tokenKey: string;
  amount: string;
}

/** "Scan QR" and "Tap NFC" buttons for the Send form; hidden where the phone features are missing. */
export function PayRequestButtons({
  tokens,
  onRequest,
}: {
  tokens: PayToken[];
  onRequest: (r: PaymentRequest, via: "qr" | "nfc", chosen?: ChosenAmount) => void;
}) {
  const t = useT();
  const scanner = qrScanner();
  const nfc = nfcApi();
  const [nfcOk, setNfcOk] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => void nfc?.status().then((s) => setNfcOk(s.supported)), [nfc]);
  if (!scanner && !nfcOk) return null;

  const scan = async () => {
    try {
      const text = await scanner!.scan();
      if (text === null) return;
      const r = parsePaymentRequest(text);
      if (r) onRequest(r, "qr");
      else toast.error(t("payreq.notAddress"));
    } catch (e) {
      toast.error(t("payreq.scanFailed"), e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {scanner && (
        <Button type="button" variant="secondary" icon={<ScanLine className="size-4" />} onClick={() => void scan()}>
          {t("payreq.scan")}
        </Button>
      )}
      {nfcOk && (
        <Button type="button" variant="secondary" icon={<NfcIcon className="size-4" />} onClick={() => setReading(true)}>
          {t("payreq.tap")}
        </Button>
      )}
      {reading && (
        <NfcPayModal
          tokens={tokens}
          onClose={() => setReading(false)}
          onRequest={(r, chosen) => {
            setReading(false);
            onRequest(r, "nfc", chosen);
          }}
        />
      )}
    </div>
  );
}

/** Tap to pay: the payer picks the amount first, then holds the phone to the other one. */
function NfcPayModal({
  tokens,
  onClose,
  onRequest,
}: {
  tokens: PayToken[];
  onClose: () => void;
  onRequest: (r: PaymentRequest, chosen: ChosenAmount) => void;
}) {
  const t = useT();
  const [tokenKey, setTokenKey] = useState(tokens[0]?.key ?? "");
  const [amount, setAmount] = useState("");
  const [chosen, setChosen] = useState<ChosenAmount | null>(null);
  const token = tokens.find((x) => x.key === tokenKey);
  let error = "";
  let ok = false;
  if (amount && token) {
    try {
      const v = toBaseUnits(amount, token.decimals);
      if (v <= 0n) error = t("send.error.zero");
      else if (v > token.amount) error = t("send.error.exceeds");
      else ok = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("payreq.tapTitle")} size="sm">
      {!chosen ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) setChosen({ tokenKey, amount });
          }}
        >
          {tokens.length === 0 ? (
            <Alert tone="warning">{t("send.noTokensBody")}</Alert>
          ) : (
            <>
              <p className="text-sm text-muted">{t("payreq.payAmountFirst")}</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label={t("send.amount")} error={error || undefined}>
                  <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").trim())} placeholder="0" />
                </Field>
                <Field label={t("send.token")}>
                  <Select value={tokenKey} onChange={(e) => setTokenKey(e.target.value)}>
                    {tokens.map((x) => <option key={x.key} value={x.key}>{x.symbol}</option>)}
                  </Select>
                </Field>
              </div>
              {token && <p className="text-xs text-muted">{t("send.available")}: {fromBaseUnits(token.amount, token.decimals)} {token.symbol}</p>}
            </>
          )}
          <Button type="submit" block icon={<NfcIcon className="size-4" />} disabled={!ok}>
            {t("payreq.tapNow")}
          </Button>
        </form>
      ) : (
        <NfcReading
          label={`${chosen.amount} ${token?.symbol ?? ""}`}
          onBack={() => setChosen(null)}
          onRequest={(r) => onRequest(r, chosen)}
        />
      )}
    </Modal>
  );
}

function NfcReading({ label, onBack, onRequest }: { label: string; onBack: () => void; onRequest: (r: PaymentRequest) => void }) {
  const t = useT();
  const nfc = nfcApi()!;
  const [error, setError] = useState("");
  useEffect(() => {
    let done = false;
    nfc
      .startReading(({ value, error }) => {
        if (done) return;
        const r = value ? parsePaymentRequest(value) : null;
        if (r) {
          done = true;
          onRequest(r);
        } else setError(error ?? t("payreq.notAddress"));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      done = true;
      void nfc.stopReading();
    };
  }, [nfc, onRequest, t]);
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <NfcPulse />
      <div className="font-display text-2xl font-bold">{label}</div>
      <p className="text-sm text-muted">{t("payreq.tapBody")}</p>
      {error && <Alert tone="warning">{error}</Alert>}
      <Button variant="secondary" block onClick={onBack}>{t("payreq.changeAmount")}</Button>
    </div>
  );
}

function NfcPulse() {
  return (
    <div className="relative grid size-24 place-items-center">
      <span className="absolute inset-0 animate-ping rounded-full bg-huahua-300/40" />
      <span className="relative grid size-20 place-items-center rounded-full bg-huahua-300 text-ink">
        <NfcIcon className="size-9" />
      </span>
    </div>
  );
}

/** Receive: builds a payment request and shares it over NFC (and as a QR code). */
export function NfcReceive({ chain, address }: { chain: ChainInfo; address?: string }) {
  const t = useT();
  const nfc = nfcApi();
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => void nfc?.status().then((s) => setSupported(s.supported && s.hce)), [nfc]);
  if (!nfc || !supported || !address) return null;
  return (
    <>
      <Button variant="secondary" icon={<NfcIcon className="size-4" />} onClick={() => setOpen(true)}>
        {t("payreq.receiveNfc")}
      </Button>
      {open && <NfcReceiveModal chain={chain} address={address} onClose={() => setOpen(false)} />}
    </>
  );
}

function NfcReceiveModal({ chain, address, onClose }: { chain: ChainInfo; address: string; onClose: () => void }) {
  const t = useT();
  const [denom, setDenom] = useState(chain.currencies[0]?.coinMinimalDenom ?? "");
  const [amount, setAmount] = useState("");
  const [sharing, setSharing] = useState(false);
  const amountOk = /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0;
  const cur = chain.currencies.find((c) => c.coinMinimalDenom === denom);

  return (
    <Modal open onClose={onClose} title={t("payreq.receiveNfc")} size="sm">
      {!sharing ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (amountOk) setSharing(true);
          }}
        >
          <p className="text-sm text-muted">{t("payreq.amountFirst")}</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Field label={t("send.amount")} error={amount && !amountOk ? t("send.error.zero") : undefined}>
              <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", ".").trim())} placeholder="0" />
            </Field>
            <Field label={t("send.token")}>
              <Select value={denom} onChange={(e) => setDenom(e.target.value)}>
                {chain.currencies.map((c) => <option key={c.coinMinimalDenom} value={c.coinMinimalDenom}>{c.coinDenom}</option>)}
              </Select>
            </Field>
          </div>
          <Button type="submit" block icon={<NfcIcon className="size-4" />} disabled={!amountOk}>
            {t("payreq.startNfc")}
          </Button>
        </form>
      ) : (
        <NfcSharing
          uri={buildPaymentUri({ address, chainId: chain.chainId, amount, denom })}
          label={`${amount} ${cur?.coinDenom ?? ""}`}
          onEdit={() => setSharing(false)}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

/** Shares `uri` over NFC while mounted. */
function NfcSharing({ uri, label, onEdit, onClose }: { uri: string; label: string; onEdit: () => void; onClose: () => void }) {
  const t = useT();
  const nfc = nfcApi()!;
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    void nfc.status().then((s) => setEnabled(s.enabled));
    nfc.startEmulation(uri).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => void nfc.stopEmulation();
  }, [nfc, uri]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <NfcPulse />
        <div className="font-display text-2xl font-bold">{label}</div>
        <p className="text-sm text-muted">{t("payreq.receiveBody")}</p>
      </div>
      {!enabled && <Alert tone="warning">{t("payreq.nfcOff")}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <details className="rounded-xl bg-surface-2 p-3 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium"><QrIcon className="size-4" /> {t("payreq.orQr")}</summary>
        <div className="mt-3 flex justify-center"><QrCode value={uri} size={200} /></div>
      </details>
      <div className="flex gap-2">
        <Button variant="secondary" block onClick={onEdit}>{t("payreq.changeAmount")}</Button>
        <Button variant="secondary" block onClick={onClose}>{t("payreq.stop")}</Button>
      </div>
    </div>
  );
}
