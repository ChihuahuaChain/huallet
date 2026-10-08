import { Eye, KeyRound, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MnemonicGrid } from "@/extension/onboarding/parts";
import { AddressAvatar } from "@/components/AddressAvatar";
import { toast } from "@/components/Toaster";
import { Alert, Badge, Button, Card, CardHeader, CopyButton, Input, Modal } from "@/components/ui";
import { useT } from "@/i18n";
import { hdPathFor, type KeyMeta } from "@/lib/keyring/keyring";
import { keyring } from "@/extension/popup/keyring";
import { useKeyring as useWallet } from "@/extension/state/keyringStore";
import { PasswordPrompt } from "@/extension/PasswordPrompt";

export function AccountsSettings() {
  const t = useT();
  const navigate = useNavigate();
  const keys = useWallet((s) => s.keys);
  const [renaming, setRenaming] = useState<KeyMeta | null>(null);
  const [name, setName] = useState("");
  const [revealFor, setRevealFor] = useState<KeyMeta | null>(null);
  const [secret, setSecret] = useState<{ key: KeyMeta; value: string } | null>(null);
  const [removing, setRemoving] = useState<KeyMeta | null>(null);

  return (
    <>
      <Card>
        <CardHeader
          title={t("settings.accounts")}
          action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => navigate("/accounts/add")}>{t("accounts.add")}</Button>}
        />
        <div className="divide-y divide-line p-2">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <AddressAvatar seed={k.name} />
              <div className="min-w-0 flex-1 basis-40">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                  {k.name}
                  {!k.backedUp && <Badge tone="warning" className="whitespace-nowrap"><ShieldAlert className="size-3" />{t("backup.notBackedUp")}</Badge>}
                </div>
                <div className="text-xs text-muted">
                  {k.type === "mnemonic"
                    ? `${t("accounts.type.mnemonic")} · ${hdPathFor(118, k.hdAccount, k.hdIndex).replace("118", "…")}`
                    : k.type === "ledger"
                      ? `${t("accounts.type.ledger")} · ${hdPathFor(118, k.hdAccount, k.hdIndex)}`
                      : t("accounts.type.privateKey")}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                {!k.backedUp && <Link to={`/backup/${k.id}`}><Button size="sm">{t("backup.now")}</Button></Link>}
                <Button size="sm" variant="ghost" onClick={() => { setRenaming(k); setName(k.name); }} aria-label={t("accounts.rename")}><Pencil className="size-4" /></Button>
                {k.type !== "ledger" && <Button size="sm" variant="ghost" onClick={() => setRevealFor(k)} aria-label={t("accounts.reveal")}><KeyRound className="size-4" /></Button>}
                <Button size="sm" variant="ghost" disabled={keys.length <= 1} onClick={() => setRemoving(k)} aria-label={t("common.remove")}><Trash2 className="size-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title={t("accounts.rename")}
        size="sm"
        footer={<Button block disabled={!name.trim()} onClick={async () => { await keyring.renameKey(renaming!.id, name); setRenaming(null); }}>{t("common.save")}</Button>}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
      </Modal>

      <PasswordPrompt
        open={!!revealFor}
        onClose={() => setRevealFor(null)}
        title={revealFor?.type === "mnemonic" ? t("accounts.revealMnemonic") : t("accounts.revealPrivateKey")}
        allowBiometric
        body={<Alert tone="danger" icon={<ShieldAlert className="size-4 text-danger" />}>{t("accounts.revealWarn")}</Alert>}
        onConfirm={async (pw) => {
          const value = await keyring.revealSecret(revealFor!.id, pw);
          setSecret({ key: revealFor!, value });
          setRevealFor(null);
        }}
      />
      {secret && <SecretModal secret={secret} onClose={() => setSecret(null)} />}

      <PasswordPrompt
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={t("accounts.removeTitle", { name: removing?.name ?? "" })}
        body={t("accounts.removeBody")}
        danger
        confirmLabel={t("common.remove")}
        onConfirm={async (pw) => {
          await keyring.removeKey(removing!.id, pw);
          toast.success(t("accounts.removed"));
          setRemoving(null);
        }}
      />
    </>
  );
}

function SecretModal({ secret, onClose }: { secret: { key: KeyMeta; value: string }; onClose: () => void }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <Modal open onClose={onClose} title={secret.key.name} footer={<Button block onClick={onClose}>{t("common.done")}</Button>}>
      <div className="space-y-4">
        <div className="relative">
          {secret.key.type === "mnemonic" ? (
            <MnemonicGrid words={secret.value.split(" ")} blurred={!shown} />
          ) : (
            <div className={`break-all rounded-xl bg-surface-2 p-3 font-mono text-sm ${shown ? "" : "secret-blur"}`}>{secret.value}</div>
          )}
          {!shown && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button variant="dark" icon={<Eye className="size-4" />} onClick={() => setShown(true)}>{t("onboarding.create.reveal")}</Button>
            </div>
          )}
        </div>
        {shown && <div className="flex justify-end"><CopyButton text={secret.value} sensitive label={t("common.copy")} /></div>}
        <p className="text-xs text-muted">{t("accounts.clipboardNote")}</p>
      </div>
    </Modal>
  );
}
