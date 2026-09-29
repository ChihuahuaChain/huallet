import { Bluetooth, Usb } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { Button, Modal, Spinner } from "@/components/ui";
import { useT } from "@/i18n";
import { ledgerNativeApi, type LedgerDevice } from "@/lib/native";

interface PickerState {
  pending: { resolve: (d: LedgerDevice) => void; reject: (e: Error) => void } | null;
  error: string;
  choose: (error?: string) => Promise<LedgerDevice>;
  finish: (d: LedgerDevice | null) => void;
}

export class PickerCancelled extends Error {
  constructor() {
    super("No Ledger selected.");
    this.name = "PickerCancelled";
  }
}

const usePicker = create<PickerState>()((set, get) => ({
  pending: null,
  error: "",
  choose: (error = "") =>
    new Promise<LedgerDevice>((resolve, reject) => {
      get().pending?.reject(new PickerCancelled());
      set({ pending: { resolve, reject }, error });
    }),
  finish: (d) => {
    const p = get().pending;
    set({ pending: null, error: "" });
    if (d) p?.resolve(d);
    else p?.reject(new PickerCancelled());
  },
}));

/** Asks the user to pick a Ledger on USB or Bluetooth (Android app only). `error` explains why it is asking again. */
export const chooseLedgerDevice = (error?: string) => usePicker.getState().choose(error);

export function LedgerDevicePickerHost() {
  const t = useT();
  const pending = usePicker((s) => s.pending);
  const error = usePicker((s) => s.error);
  const finish = usePicker((s) => s.finish);
  const [devices, setDevices] = useState<LedgerDevice[]>([]);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    const native = ledgerNativeApi();
    if (!pending || !native) return;
    let alive = true;
    setDevices([]);
    setScanError("");
    void (async () => {
      while (alive) {
        try {
          const found = await native.list(4_000);
          if (!alive) return;
          setScanError("");
          setDevices((prev) => {
            const byId = new Map(prev.filter((d) => d.transport === "ble").map((d) => [d.id, d]));
            for (const d of found) byId.set(d.id, d);
            const usbNow = new Set(found.filter((d) => d.transport === "usb").map((d) => d.id));
            return [...byId.values()].filter((d) => d.transport === "ble" || usbNow.has(d.id)).sort((a, b) => a.transport.localeCompare(b.transport) * -1);
          });
        } catch (e) {
          if (!alive) return;
          setScanError(e instanceof Error ? e.message : String(e));
          await new Promise((r) => setTimeout(r, 2_000));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [pending]);

  return (
    <Modal open={!!pending} onClose={() => finish(null)} title={t("ledger.picker.title")} size="sm">
      <div className="space-y-3">
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        <p className="text-sm text-muted">{t("ledger.picker.body")}</p>
        <div className="space-y-2">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => finish(d)}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left hover:bg-surface-2"
            >
              {d.transport === "usb" ? <Usb className="size-5" /> : <Bluetooth className="size-5" />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{d.name}</div>
                <div className="text-xs text-muted">{t(d.transport === "usb" ? "ledger.picker.usb" : "ledger.picker.ble")}</div>
              </div>
            </button>
          ))}
          <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted">
            <Spinner className="size-4" /> {t("ledger.picker.searching")}
          </div>
        </div>
        {scanError && <p className="text-sm text-danger">{scanError}</p>}
        <Button variant="secondary" block onClick={() => finish(null)}>
          {t("common.cancel")}
        </Button>
      </div>
    </Modal>
  );
}
