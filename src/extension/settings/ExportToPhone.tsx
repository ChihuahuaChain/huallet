import { MonitorSmartphone, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { AnimatedQr } from "@/components/QrCode";
import { Alert, Button, Card, CardHeader, Modal } from "@/components/ui";
import { useT } from "@/i18n";
import { createTransfer } from "@/lib/sync/transfer";
import { keyring } from "@/extension/popup/keyring";
import { PasswordPrompt } from "@/extension/PasswordPrompt";

/** The card on the Accounts page. */
export function ExportToPhone() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card>
        <CardHeader title={t("transfer.export.title")} subtitle={t("transfer.export.body")} />
        <div className="px-5 pb-5 pt-4">
          <Button icon={<MonitorSmartphone className="size-4" />} onClick={() => setOpen(true)}>
            {t("transfer.export.button")}
          </Button>
        </div>
      </Card>
      <ExportToPhoneFlow open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Password, then every account as an animated QR (plus a one-time code) for Huallet on a phone to scan. */
export function ExportToPhoneFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [transfer, setTransfer] = useState<{ code: string; frames: string[]; count: number } | null>(null);
  const done = () => {
    setTransfer(null);
    onClose();
  };

  return (
    <>
      <PasswordPrompt
        open={open && !transfer}
        onClose={onClose}
        title={t("transfer.export.passwordTitle")}
        allowBiometric
        body={<Alert tone="warning" icon={<ShieldAlert className="size-4 text-warning" />}>{t("transfer.export.passwordBody")}</Alert>}
        onConfirm={async (pw) => {
          const keys = await keyring.exportKeys(pw);
          const { code, frames } = await createTransfer(keys);
          setTransfer({ code, frames, count: keys.length });
        }}
      />

      {transfer && (
        <Modal open onClose={done} title={t("transfer.export.modalTitle")} footer={<Button block onClick={done}>{t("common.done")}</Button>}>
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>{t("transfer.export.step1")}</li>
              <li>{t("transfer.export.step2")}</li>
              <li>{t("transfer.export.step3")}</li>
            </ol>
            <div className="flex justify-center">
              <AnimatedQr frames={transfer.frames} />
            </div>
            <p className="text-center text-xs text-muted">
              {t("transfer.export.count", { n: transfer.count, frames: transfer.frames.length })}
            </p>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">{t("transfer.export.code")}</div>
              <div className="mt-1 select-all font-mono text-2xl font-bold tracking-widest">{transfer.code}</div>
            </div>
            <Alert tone="danger" icon={<ShieldAlert className="size-4 text-danger" />}>{t("transfer.export.warn")}</Alert>
          </div>
        </Modal>
      )}
    </>
  );
}
