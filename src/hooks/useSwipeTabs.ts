import { useEffect, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Swipe left/right on `ref` to move between the bottom-bar tabs, like a
 * phone app. Ignores vertical scrolls, slow drags, form fields and anything
 * that scrolls sideways on its own.
 */
export function useSwipeTabs(ref: RefObject<HTMLElement | null>, tabs: string[]) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(pointer: coarse)").matches) return;
    const current = tabs.reduce((best, to, i) => {
      const hit = to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
      return hit && (best < 0 || to.length > tabs[best].length) ? i : best;
    }, -1);
    if (current < 0) return;

    let start: { x: number; y: number; t: number } | null = null;
    const blocked = (target: EventTarget | null) => {
      for (let n = target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable) return true;
        if (n.scrollWidth > n.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 && !blocked(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      const fast = Date.now() - start.t < 600;
      start = null;
      if (!fast || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
      const next = current + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= tabs.length) return;
      document.documentElement.dataset.swipe = dx < 0 ? "left" : "right";
      navigate(tabs[next]);
      setTimeout(() => delete document.documentElement.dataset.swipe, 300);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [ref, tabs, pathname, navigate]);
}
