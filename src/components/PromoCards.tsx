import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, BellOff, X } from "lucide-react";
import { Card } from "@/components/ui";
import { Headline, PromoArt } from "@/components/PromoArt";
import type { Promo } from "@/data/promos";
import { usePromos } from "@/hooks/usePromos";
import { useT } from "@/i18n";
import { useSettings } from "@/state/settings";
import { isMobileView } from "@/extension/popup/view";

/** Seconds each card stays up before the stack rotates to the next one. */
const ROTATE_MS = 9000;

/**
 * MetaMask-style stack of promo "news" cards on the dashboard (tab, popup and side panel;
 * not the Android app). The cards come from the shared Chihuahua news feed (see
 * data/promos.ts); each carries a small scene that plays when it comes up (and on hover)
 * and its project's accent colour. One card shows at a time and the stack rotates every
 * few seconds, pausing while the pointer is on it. The X dismisses a card for good;
 * dismissing the last one turns news off, with a note on where to turn it back on.
 */
export function PromoCards() {
  const t = useT();
  const { showPromotions, dismissedPromos, set } = useSettings();
  const enabled = !isMobileView() && showPromotions;
  const promos = usePromos(enabled);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [turnedOff, setTurnedOff] = useState(false);
  const queue = enabled ? promos.filter((p) => !dismissedPromos.includes(p.id)) : [];

  useEffect(() => {
    if (queue.length < 2 || paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const iv = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => clearInterval(iv);
  }, [queue.length, paused]);

  if (turnedOff && !isMobileView()) return <NewsOffNote onClose={() => setTurnedOff(false)} />;
  if (queue.length === 0) return null;

  const promo = queue[index % queue.length];
  const behind = Math.min(queue.length - 1, 2); // up to two cards peeking out behind
  const dismiss = () => {
    if (queue.length === 1) {
      set({ dismissedPromos: [...dismissedPromos, promo.id], showPromotions: false });
      setTurnedOff(true);
    } else {
      set({ dismissedPromos: [...dismissedPromos, promo.id] });
    }
  };

  return (
    <div className="relative" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {Array.from({ length: behind }).map((_, i) => {
        const n = i + 1;
        return (
          <div
            key={n}
            aria-hidden
            className="absolute inset-0 rounded-2xl border border-line bg-surface shadow-card"
            style={{ transform: `translateY(${n * 6}px) scale(${1 - n * 0.035})` }}
          />
        );
      })}
      <PromoCard key={promo.id} promo={promo} onDismiss={dismiss} dismissLabel={t("promo.dismiss")} />
      {queue.length > 1 && (
        <div aria-hidden className="pointer-events-none absolute bottom-3 right-3.5 flex gap-1">
          {queue.map((p) => (
            <span key={p.id} className="size-1.5 rounded-full transition-colors" style={{ background: p.id === promo.id ? promo.accent : "color-mix(in srgb, currentColor 22%, transparent)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One promo card: the scene tile, the copy and the dismiss button. */
export function PromoCard({ promo, onDismiss, dismissLabel }: { promo: Promo; onDismiss: () => void; dismissLabel: string }) {
  return (
    <Card
      className="pa-in group relative overflow-hidden"
      style={{
        borderColor: `color-mix(in srgb, ${promo.accent} 40%, transparent)`,
        backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${promo.accent} 13%, transparent), transparent 60%)`,
      }}
    >
      <div aria-hidden className="paw-bg pointer-events-none absolute inset-y-0 right-0 w-2/5 [mask-image:linear-gradient(90deg,transparent,#000)]" />
      <a
        href={promo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative flex items-center gap-3.5 p-3.5 pr-11 transition-colors hover:bg-surface-2/40"
      >
        <PromoArt promo={promo} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: promo.accent }}>
            {promo.eyebrow}
          </div>
          <div className="truncate font-display text-[17px] font-semibold leading-tight text-fg">
            <Headline text={promo.headline} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{promo.body}</p>
          <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: promo.accent }}>
            {promo.cta}
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </a>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </Card>
  );
}

/** Shown once, right after the last card is dismissed: news is now off, and where to turn it back on. */
function NewsOffNote({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Card className="pa-in relative overflow-hidden">
      <div className="flex items-center gap-3.5 p-3.5 pr-11">
        <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted ring-1 ring-black/5 dark:ring-white/10">
          <BellOff className="size-6" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[17px] font-semibold leading-tight text-fg">{t("promo.offTitle")}</div>
          <p className="mt-0.5 text-sm text-muted">{t("promo.offBody")}</p>
          <Link to="/settings" className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-rust hover:underline">
            {t("promo.openSettings")}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("promo.dismiss")}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-4" />
      </button>
    </Card>
  );
}
