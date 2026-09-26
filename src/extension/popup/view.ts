export type ExtView = "popup" | "approval" | "tab";

export function extView(): ExtView {
  const v = new URLSearchParams(window.location.search).get("view");
  return v === "popup" || v === "approval" ? v : "tab";
}

export const isPopupView = () => extView() === "popup";
