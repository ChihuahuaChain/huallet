import { AlertTriangle, Eye, KeyRound, ShieldCheck } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Alert, Button, CopyButton, Field, Input, PasswordInput, Tabs, Textarea, cx } from "@/components/ui";
import { useT } from "@/i18n";
import { passwordStrength } from "@/lib/crypto/vault";
import { generateMnemonic, isValidMnemonic, isValidPrivateKey, normalizeMnemonic, type NewKey } from "@/lib/keyring/keyring";

export function MnemonicGrid({ words, blurred }: { words: string[]; blurred?: boolean }) {
  return (
    <ol className={cx("grid grid-cols-2 gap-2 sm:grid-cols-3", blurred && "secret-blur")} aria-hidden={blurred}>
      {words.map((w, i) => (
        <li key={i} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 font-mono text-sm">
          <span className="w-5 text-right text-xs text-muted">{i + 1}</span>
          <span className="font-semibold">{w}</span>
        </li>
      ))}
    </ol>
  );
}

export function ShowMnemonic({ onNext, onBack }: { onNext: (mnemonic: string) => void; onBack?: () => void }) {
  const t = useT();
  const [length, setLength] = useState<"12" | "24">("24");
  const [mnemonic, setMnemonic] = useState(() => generateMnemonic(24));
  const [revealed, setRevealed] = useState(false);
  const [ack, setAck] = useState(false);
  const words = mnemonic.split(" ");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t("onboarding.create.title")}</h2>
        <Tabs
          value={length}
          onChange={(v) => {
            setLength(v);
            setMnemonic(generateMnemonic(v === "24" ? 24 : 12));
            setRevealed(false);
          }}
          items={[
            { value: "12", label: t("onboarding.words", { n: 12 }) },
            { value: "24", label: t("onboarding.words", { n: 24 }) },
          ]}
        />
      </div>
      <Alert tone="warning" icon={<AlertTriangle className="size-4 text-warning" />} title={t("onboarding.create.warnTitle")}>
        {t("onboarding.create.warnBody")}
      </Alert>
      <div className="relative">
        <MnemonicGrid words={words} blurred={!revealed} />
        {!revealed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button variant="dark" icon={<Eye className="size-4" />} onClick={() => setRevealed(true)}>
              {t("onboarding.create.reveal")}
            </Button>
          </div>
        )}
      </div>
      {revealed && (
        <div className="flex justify-end">
          <CopyButton text={mnemonic} sensitive label={t("onboarding.create.copy")} />
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-rust" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>{t("onboarding.create.ack")}</span>
      </label>
      <div className="flex gap-2">
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            {t("common.back")}
          </Button>
        )}
        <Button block disabled={!revealed || !ack} onClick={() => onNext(mnemonic)}>
          {t("common.continue")}
        </Button>
      </div>
    </div>
  );
}

function pickPositions(total: number, count: number): number[] {
  const set = new Set<number>();
  const buf = new Uint32Array(1);
  while (set.size < count) {
    crypto.getRandomValues(buf);
    set.add(buf[0] % total);
  }
  return [...set].sort((a, b) => a - b);
}

export function VerifyMnemonic({ mnemonic, onVerified, onBack, onSkip }: { mnemonic: string; onVerified: () => void; onBack: () => void; onSkip?: () => void }) {
  const t = useT();
  const words = mnemonic.split(" ");
  const positions = useMemo(() => pickPositions(words.length, 3), [words.length]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ok = positions.every((p) => (answers[p] ?? "").trim().toLowerCase() === words[p]);
    setError(!ok);
    if (ok) onVerified();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{t("onboarding.verify.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("onboarding.verify.body")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {positions.map((p) => (
          <Field key={p} label={t("onboarding.verify.word", { n: p + 1 })}>
            <Input
              value={answers[p] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [p]: e.target.value }))}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              invalid={error && (answers[p] ?? "").trim().toLowerCase() !== words[p]}
            />
          </Field>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{t("onboarding.verify.error")}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button block type="submit" icon={<ShieldCheck className="size-4" />}>
          {t("onboarding.verify.submit")}
        </Button>
      </div>
      {onSkip && (
        <button type="button" onClick={onSkip} className="w-full text-center text-xs text-muted underline-offset-2 hover:underline">
          {t("onboarding.verify.skip")}
        </button>
      )}
    </form>
  );
}

export function ImportSecret({ onNext, onBack }: { onNext: (k: Omit<NewKey, "name">) => void; onBack?: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<"mnemonic" | "privateKey">("mnemonic");
  const [value, setValue] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [hdAccount, setHdAccount] = useState("0");
  const [hdIndex, setHdIndex] = useState("0");

  const valid = mode === "mnemonic" ? isValidMnemonic(value) : isValidPrivateKey(value);
  const wordCount = normalizeMnemonic(value).split(" ").filter(Boolean).length;
  const acc = Number(hdAccount);
  const idx = Number(hdIndex);
  const hdValid = Number.isInteger(acc) && acc >= 0 && Number.isInteger(idx) && idx >= 0;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && hdValid) onNext({ type: mode, secret: value, hdAccount: acc, hdIndex: idx, backedUp: true });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t("onboarding.import.title")}</h2>
        <Tabs
          value={mode}
          onChange={(m) => {
            setMode(m);
            setValue("");
          }}
          items={[
            { value: "mnemonic", label: t("onboarding.import.mnemonic") },
            { value: "privateKey", label: t("onboarding.import.privateKey") },
          ]}
        />
      </div>
      <Field
        label={mode === "mnemonic" ? t("onboarding.import.mnemonicLabel") : t("onboarding.import.privateKeyLabel")}
        error={value && !valid ? (mode === "mnemonic" ? t("onboarding.import.invalidMnemonic") : t("onboarding.import.invalidPrivateKey")) : undefined}
        hint={mode === "mnemonic" ? t("onboarding.import.wordCount", { n: wordCount }) : t("onboarding.import.privateKeyHint")}
      >
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="font-mono"
          rows={mode === "mnemonic" ? 4 : 2}
          invalid={!!value && !valid}
          placeholder={mode === "mnemonic" ? "word1 word2 word3 …" : "0x…"}
        />
      </Field>
      {mode === "mnemonic" && (
        <div>
          <button type="button" className="text-sm font-medium text-rust hover:underline" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? t("onboarding.import.hideAdvanced") : t("onboarding.import.showAdvanced")}
          </button>
          {advanced && (
            <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
              <p className="text-xs text-muted">{t("onboarding.import.hdHint")}</p>
              <div className="flex items-center gap-2 font-mono text-sm">
                <span className="text-muted">m/44'/…'/</span>
                <Input className="w-20" inputMode="numeric" value={hdAccount} onChange={(e) => setHdAccount(e.target.value)} aria-label="account" />
                <span className="text-muted">'/0/</span>
                <Input className="w-20" inputMode="numeric" value={hdIndex} onChange={(e) => setHdIndex(e.target.value)} aria-label="index" />
              </div>
            </div>
          )}
        </div>
      )}
      <Alert tone="info" icon={<KeyRound className="size-4 text-muted" />}>
        {t("onboarding.import.privacy")}
      </Alert>
      <div className="flex gap-2">
        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            {t("common.back")}
          </Button>
        )}
        <Button block type="submit" disabled={!valid || !hdValid}>
          {t("common.continue")}
        </Button>
      </div>
    </form>
  );
}

export function StrengthMeter({ password }: { password: string }) {
  const t = useT();
  const s = passwordStrength(password);
  const colors = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cx("h-1.5 flex-1 rounded-full", password && s >= i ? colors[s] : "bg-line")} />
        ))}
      </div>
      {password && <div className="text-xs text-muted">{t(`password.strength.${s}`)}</div>}
    </div>
  );
}

export function NameAndPassword({
  withPassword,
  submitLabel,
  onSubmit,
  onBack,
  defaultName,
}: {
  withPassword: boolean;
  submitLabel: string;
  onSubmit: (name: string, password: string) => Promise<void>;
  onBack?: () => void;
  defaultName: string;
}) {
  const t = useT();
  const [name, setName] = useState(defaultName);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pwOk = !withPassword || (pw.length >= 8 && pw === pw2 && ack);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pwOk) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(name.trim(), pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <h2 className="text-xl font-semibold">{withPassword ? t("onboarding.password.title") : t("onboarding.name.title")}</h2>
      <Field label={t("onboarding.name.label")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="off" />
      </Field>
      {withPassword && (
        <>
          <Field label={t("onboarding.password.label")} hint={t("onboarding.password.hint")}>
            <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <StrengthMeter password={pw} />
          <Field label={t("onboarding.password.confirm")} error={pw2 && pw !== pw2 ? t("onboarding.password.mismatch") : undefined}>
            <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" invalid={!!pw2 && pw !== pw2} />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-rust" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{t("onboarding.password.ack")}</span>
          </label>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {onBack && (
          <Button variant="secondary" onClick={onBack} disabled={busy}>
            {t("common.back")}
          </Button>
        )}
        <Button block type="submit" loading={busy} disabled={!name.trim() || !pwOk}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
