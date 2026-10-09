export type ExtView = "popup" | "approval" | "tab" | "sidepanel";

export function extView(): ExtView {
  const v = new URLSearchParams(window.location.search).get("view");
  return v === "popup" || v === "approval" || v === "sidepanel" ? v : "tab";
}

export const isPopupView = () => extView() === "popup";

/** True in the small action popup or the side panel — any view that isn't a
 * full browser tab. Flows that need a persistent tab (WebHID/Ledger, seed
 * backup breathing room) key off this. */
export const isFullTab = () => extView() === "tab";

/** True on the Android (Capacitor) build, which sets data-view="mobile" at boot
 * (src/mobile/main.tsx). The single source of truth for "is this the mobile app?". */
export const isMobileView = () => typeof document !== "undefined" && document.documentElement.dataset.view === "mobile";
