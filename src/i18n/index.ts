import { useCallback } from "react";
import { en, type MessageKey } from "./en";

export type { MessageKey };

export function translate(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  return useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(key, vars), []);
}

export const LOCALE = "en-US";

export function useLocale(): string {
  return LOCALE;
}
