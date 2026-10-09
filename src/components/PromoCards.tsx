import { ArrowUpRight, X } from "lucide-react";
import { Card } from "@/components/ui";
import { PROMOS } from "@/data/promos";
import { useT } from "@/i18n";
import { useSettings } from "@/state/settings";
import { isMobileView } from "@/extension/popup/view";

/**
 * MetaMask-style stack of promo "news" cards, shown on the desktop dashboard only.
 * Each card carries the project's real brand image and accent colour. One card
 * shows at a time; the X dismisses it (remembered forever) and reveals the next.
 * When the queue is empty the section disappears until a promo with a new id is
 * added. The whole feature can be turned off and back on in Settings.
 */
export function PromoCards() {
  const t = useT();
  const { showPromotions, dismissedPromos, set } = useSettings();

  if (isMobileView() || !showPromotions) return null;
  const queue = PROMOS.filter((p) => !dismissedPromos.includes(p.id));
  if (queue.length === 0) return null;

  const promo = queue[0];
  const behind = Math.min(queue.length - 1, 2); // up to two cards peeking out behind
  const dismiss = () => set({ dismissedPromos: [...dismissedPromos, promo.id] });

  return (
    <div className="relative">
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
      <Card
        className="relative overflow-hidden"
        style={{
          borderColor: `color-mix(in srgb, ${promo.accent} 40%, transparent)`,
          backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${promo.accent} 13%, transparent), transparent 60%)`,
        }}
      >
        <a
          href={promo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3.5 p-3.5 pr-11 transition-colors hover:bg-surface-2/40"
        >
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10"
            style={{ backgroundImage: `linear-gradient(135deg, ${promo.accent}, color-mix(in srgb, ${promo.accent} 80%, transparent))` }}
          >
            <promo.icon className="size-7 text-white" strokeWidth={2.4} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: promo.accent }}>
              {promo.eyebrow}
            </div>
            <div className="truncate font-semibold text-fg">{promo.title}</div>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">{promo.body}</p>
            <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: promo.accent }}>
              {promo.cta}
              <ArrowUpRight className="size-3.5" />
            </span>
          </div>
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("promo.dismiss")}
          className="absolute right-2 top-2 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </Card>
    </div>
  );
}
