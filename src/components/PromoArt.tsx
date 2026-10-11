import type { ReactNode } from "react";
import type { Promo } from "@/data/promos";

/**
 * The small illustration on a promo card's tile. Each scene plays once when the card
 * appears and again on hover (the card is the `group`), then rests on its last frame —
 * a wallet is a tool, so nothing loops. Without a scene the tile shows the promo's icon.
 */
export function PromoArt({ promo }: { promo: Promo }) {
  const tile = (children: ReactNode, background?: string) => (
    <div
      aria-hidden
      className="pa-tile relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      style={{ backgroundImage: background ?? `linear-gradient(135deg, ${promo.accent}, color-mix(in srgb, ${promo.accent} 80%, transparent))` }}
    >
      {children}
    </div>
  );

  switch (promo.scene) {
    case "morning":
      return tile(
        <>
          <span className="pa-sun" />
          <svg className="absolute inset-x-0 bottom-0 h-5 w-full" viewBox="0 0 56 20" preserveAspectRatio="none">
            <path d="M0 9 C14 3 26 3 34 6 C44 9 50 5 56 6 L56 20 L0 20 Z" fill="#7a3b26" fillOpacity="0.85" />
          </svg>
          <span className="pa-pup">🐕</span>
        </>,
        "linear-gradient(180deg, #ffe6b8 0%, #ffb27a 100%)",
      );
    case "burn":
      return tile(
        <>
          <span className="pa-ember" style={{ left: "26%" }} />
          <span className="pa-ember" style={{ left: "58%", animationDelay: ".35s" }} />
          <span className="pa-ember" style={{ left: "72%", animationDelay: ".7s" }} />
          <span className="pa-flame">🔥</span>
        </>,
      );
    case "predict":
      return tile(
        <svg className="h-9 w-11" viewBox="0 0 44 36" fill="none">
          <line x1="0" y1="22" x2="44" y2="22" stroke="white" strokeOpacity="0.45" strokeDasharray="3 3" />
          <polyline className="pa-line" points="2,24 9,21 15,25 21,19 27,21 33,13 40,8" stroke="white" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          <path className="pa-up" d="M36 3 L42 3 L42 9" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>,
      );
    case "dogtags":
      return tile(
        <span className="pa-tag flex flex-col items-center">
          <span className="size-1.5 rounded-full bg-white/90" />
          <span className="h-1.5 w-0.5 bg-white/90" />
          <span className="rounded-md bg-white px-1.5 py-0.5 font-display text-[10px] font-bold leading-none text-ink">@woof</span>
        </span>,
      );
    case "otc":
      return tile(
        <span className="flex w-10 flex-col gap-1">
          <span className="pa-bar h-1.5 self-end rounded-full bg-white/95" style={{ width: "70%" }} />
          <span className="pa-bar h-1.5 self-end rounded-full bg-white/70" style={{ width: "45%", animationDelay: ".12s" }} />
          <span className="text-center text-[10px] font-bold leading-none text-white">⇄</span>
          <span className="pa-bar h-1.5 rounded-full bg-white/70" style={{ width: "50%", animationDelay: ".24s" }} />
          <span className="pa-bar h-1.5 rounded-full bg-white/95" style={{ width: "80%", animationDelay: ".36s" }} />
        </span>,
      );
    default:
      return tile(<promo.icon className="size-7 text-white" strokeWidth={2.4} />);
  }
}

/** Renders a feed headline like the explorer does: *word* in coral, +word+ in green. Plain text only. */
export function Headline({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*|\+[^+]+\+)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <span key={i} className="text-coral">{p.slice(1, -1)}</span>
        ) : p.startsWith("+") && p.endsWith("+") && p.length > 2 ? (
          <span key={i} className="text-success">{p.slice(1, -1)}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
