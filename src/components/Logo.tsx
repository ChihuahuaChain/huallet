import { useEffect, useRef } from "react";
import logoRaw from "@/assets/chihuahua-logo.svg?raw";
import { cx } from "./ui";

// The SVG without its XML prolog, which the HTML parser can't ingest via innerHTML.
const LOGO_SVG = logoRaw.replace(/<\?xml[\s\S]*?\?>/, "").trim();

// Eye ring centres (SVG user units, viewBox 0 0 800 800) and how far the pupils may travel.
const EYES = [
  { sel: ".hua-eye-l", cx: 288.6, cy: 437.4 },
  { sel: ".hua-eye-r", cx: 542.7, cy: 433.7 },
] as const;
const MAX_SHIFT = 12;

export function Mascot({ size = 40, className, track = true }: { size?: number; className?: string; track?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!track) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const host = ref.current;
    const svg = host?.querySelector("svg");
    if (!host || !svg) return;
    const groups = EYES.map((e) => ({ ...e, nodes: host.querySelectorAll<SVGElement>(e.sel) }));

    let raf = 0;
    const aim = (clientX: number, clientY: number) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      for (const g of groups) {
        const ex = rect.left + (g.cx / 800) * rect.width;
        const ey = rect.top + (g.cy / 800) * rect.height;
        const dx = clientX - ex;
        const dy = clientY - ey;
        const dist = Math.hypot(dx, dy) || 1;
        // Ease in over the first ~120px of cursor distance, then hold at MAX_SHIFT.
        const mag = Math.min(MAX_SHIFT, (dist / 120) * MAX_SHIFT);
        const tx = ((dx / dist) * mag).toFixed(1);
        const ty = ((dy / dist) * mag).toFixed(1);
        g.nodes.forEach((n) => n.setAttribute("transform", `translate(${tx} ${ty})`));
      }
    };
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => aim(e.clientX, e.clientY));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [track]);

  return (
    <span
      ref={ref}
      style={{ width: size, height: size }}
      aria-hidden
      className={cx(
        "inline-block shrink-0 select-none [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&_.hua-eye-l]:transition-transform [&_.hua-eye-r]:transition-transform [&_.hua-eye-l]:duration-100 [&_.hua-eye-r]:duration-100",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
    />
  );
}

export function Logo({
  size = 36,
  className,
  withText = true,
  stacked = false,
}: {
  size?: number;
  className?: string;
  withText?: boolean;
  stacked?: boolean;
}) {
  return (
    <div className={cx("flex gap-2", stacked ? "flex-col items-center" : "items-center", className)}>
      <Mascot size={size} />
      {withText && (
        <span className={cx("font-display font-bold tracking-tight", stacked ? "text-2xl" : "text-xl")}>
          Hua<span className="text-rust">llet</span>
        </span>
      )}
    </div>
  );
}
