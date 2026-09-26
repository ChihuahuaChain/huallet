import { create } from "zustand";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  title: ReactNode;
  body?: ReactNode;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.tone === "error" ? 9000 : 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: ReactNode, body?: ReactNode) => useToasts.getState().push({ tone: "success", title, body }),
  error: (title: ReactNode, body?: ReactNode) => useToasts.getState().push({ tone: "error", title, body }),
  info: (title: ReactNode, body?: ReactNode) => useToasts.getState().push({ tone: "info", title, body }),
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop"
        >
          {t.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          ) : t.tone === "error" ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
          ) : (
            <Info className="mt-0.5 size-5 shrink-0 text-muted" />
          )}
          <div className={cx("min-w-0 flex-1 text-sm")}>
            <div className="font-semibold">{t.title}</div>
            {t.body && <div className="mt-0.5 break-words text-muted">{t.body}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
