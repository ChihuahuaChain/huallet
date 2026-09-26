import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useT } from "@/i18n";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-huahua-400 shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] font-semibold",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2 font-medium",
  ghost: "text-fg hover:bg-surface-2 font-medium",
  danger: "bg-danger text-white hover:opacity-90 font-semibold",
  dark: "bg-ink text-huahua-50 hover:bg-ink-soft font-semibold dark:bg-huahua-50 dark:text-ink dark:hover:bg-huahua-100",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-fg placeholder:text-muted/70 focus:border-rust focus:outline-none focus:ring-2 focus:ring-rust/20 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; right?: ReactNode }>(
  function Input({ className, invalid, right, ...rest }, ref) {
    return (
      <div className="relative">
        <input
          ref={ref}
          className={cx(inputBase, "h-11", !!right && "pr-24", invalid && "border-danger focus:border-danger focus:ring-danger/20", className)}
          {...rest}
        />
        {right && <div className="absolute inset-y-0 right-1.5 flex items-center gap-1">{right}</div>}
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} className={cx(inputBase, "py-2.5 min-h-24", invalid && "border-danger", className)} {...rest} />;
  },
);

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function PasswordInput(props, ref) {
    const [show, setShow] = useState(false);
    const t = useT();
    return (
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        autoComplete={props.autoComplete ?? "current-password"}
        spellCheck={false}
        autoCapitalize="off"
        {...props}
        right={
          <button
            type="button"
            className="rounded-lg p-2 text-muted hover:text-fg"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? t("common.hide") : t("common.show")}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        }
      />
    );
  },
);

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, "h-11 appearance-none pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted">{description}</div>}
      </label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-rust" : "bg-line")}
      >
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-surface-2", className)} />;
}

type Tone = "neutral" | "success" | "danger" | "warning" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success/12 text-success",
  danger: "bg-danger/12 text-danger",
  warning: "bg-warning/12 text-warning",
  accent: "bg-huahua-300/40 text-ink dark:text-huahua-100",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Alert({ tone = "warning", title, children, icon }: { tone?: Exclude<Tone, "accent" | "neutral"> | "info"; title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  const styles = {
    warning: "border-warning/30 bg-warning/8",
    danger: "border-danger/30 bg-danger/8",
    success: "border-success/30 bg-success/8",
    info: "border-line bg-surface-2",
  }[tone];
  return (
    <div className={cx("flex gap-3 rounded-xl border p-3.5 text-sm", styles)} role={tone === "danger" ? "alert" : undefined}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-muted">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <div className="font-display text-base font-semibold">{title}</div>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;
  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={dismissable ? onClose : undefined} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx("relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-pop outline-none sm:rounded-2xl", width)}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {dismissable && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-5" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === it.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export async function copyText(text: string, sensitive = false) {
  await navigator.clipboard.writeText(text);
  if (sensitive) {
    setTimeout(async () => {
      try {
        if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText("");
      } catch {
      }
    }, 60_000);
  }
}

export function CopyButton({ text, sensitive, label, className }: { text: string; sensitive?: boolean; label?: ReactNode; className?: string }) {
  const [done, setDone] = useState(false);
  const t = useT();
  return (
    <button
      type="button"
      className={cx("inline-flex items-center gap-1.5 rounded-lg p-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg", className)}
      onClick={async () => {
        await copyText(text, sensitive);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label={t("common.copy")}
    >
      {done ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      {label && <span>{done ? t("common.copied") : label}</span>}
    </button>
  );
}

export function TokenIcon({ src, symbol, size = 36, className }: { src?: string; symbol: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const letter = symbol.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
  if (!src || failed) {
    return (
      <div
        className={cx("flex shrink-0 items-center justify-center rounded-full bg-huahua-300/60 font-display font-semibold text-ink", className)}
        style={{ width: size, height: size, fontSize: size * 0.42 }}
        aria-hidden
      >
        {letter}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cx("shrink-0 rounded-full bg-surface-2 object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}

function initialOf(text: string): string {
  const ch = Array.from(text).find((c) => /[\p{L}\p{N}]/u.test(c));
  return ch ? ch.toUpperCase() : Array.from(text.trim())[0] ?? "?";
}

export function Monogram({ text, size = 36 }: { text: string; size?: number }) {
  const palette = ["#FED62E", "#FA7F5B", "#F0A841", "#7FAE8A", "#E8C9A0"];
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.4, background: palette[h % palette.length] }}
      aria-hidden
    >
      {initialOf(text)}
    </div>
  );
}
