import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { useSettings } from "@/state/settings";
import { en, type MessageKey } from "./en";

export type { MessageKey };

export type Locale = "en" | "it" | "es" | "pt-BR" | "fr" | "de" | "ko" | "zh-CN" | "ja";

/** Languages with a shipped dictionary. Add a row here AND a LOADERS entry when a
 * new locale file lands under ./locales. `label` is the language's own endonym. */
export const LANGUAGES: { code: Locale; label: string; bcp47: string }[] = [
  { code: "en", label: "English", bcp47: "en-US" },
  { code: "it", label: "Italiano", bcp47: "it-IT" },
  { code: "es", label: "Español", bcp47: "es-ES" },
  { code: "pt-BR", label: "Português", bcp47: "pt-BR" },
  { code: "fr", label: "Français", bcp47: "fr-FR" },
  { code: "de", label: "Deutsch", bcp47: "de-DE" },
  { code: "ko", label: "한국어", bcp47: "ko-KR" },
  { code: "zh-CN", label: "简体中文", bcp47: "zh-CN" },
  { code: "ja", label: "日本語", bcp47: "ja-JP" },
];

const LOADERS: Partial<Record<Locale, () => Promise<{ default: Record<string, string> }>>> = {
  it: () => import("./locales/it"),
  es: () => import("./locales/es"),
  "pt-BR": () => import("./locales/pt-BR"),
  fr: () => import("./locales/fr"),
  de: () => import("./locales/de"),
  ko: () => import("./locales/ko"),
  "zh-CN": () => import("./locales/zh-CN"),
  ja: () => import("./locales/ja"),
};

const bcp47 = (code: Locale): string => LANGUAGES.find((l) => l.code === code)?.bcp47 ?? "en-US";

function detectLocale(): Locale {
  const nav = (typeof navigator !== "undefined" && navigator.language) || "en";
  const lower = nav.toLowerCase();
  if (lower.startsWith("pt")) return LANGUAGES.some((l) => l.code === "pt-BR") ? "pt-BR" : "en";
  if (lower.startsWith("zh")) return LANGUAGES.some((l) => l.code === "zh-CN") ? "zh-CN" : "en";
  const two = lower.slice(0, 2) as Locale;
  return LANGUAGES.some((l) => l.code === two) ? two : "en";
}

interface I18nState {
  lang: Locale;
  locale: string;
  messages: Record<string, string>;
}

// Module-level mirror for non-React callers of translate().
let active: Record<string, string> = en;

const useI18n = create<I18nState>(() => ({ lang: "en", locale: "en-US", messages: en }));

/** Resolve a language preference ("auto" or a locale code), load its dictionary,
 * and publish it. Missing/failed locales fall back to English. */
export async function applyLanguage(pref: string | undefined): Promise<void> {
  const target: Locale = !pref || pref === "auto" ? detectLocale() : (pref as Locale);
  const loader = target === "en" ? undefined : LOADERS[target];
  if (!loader) {
    active = en;
    useI18n.setState({ lang: "en", locale: "en-US", messages: en });
    return;
  }
  try {
    const mod = await loader();
    const messages = { ...en, ...mod.default };
    active = messages;
    useI18n.setState({ lang: target, locale: bcp47(target), messages });
  } catch {
    active = en;
    useI18n.setState({ lang: "en", locale: "en-US", messages: en });
  }
}

function format(s: string, vars?: Record<string, string | number>): string {
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function translate(key: MessageKey, vars?: Record<string, string | number>): string {
  return format(active[key] ?? en[key] ?? key, vars);
}

export function useT() {
  const messages = useI18n((s) => s.messages);
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => format(messages[key] ?? en[key] ?? key, vars),
    [messages],
  );
}

export function useLocale(): string {
  return useI18n((s) => s.locale);
}

/** Mount once near the app root: keeps the active dictionary in sync with the
 * user's language setting (and the browser default when it is "auto"). */
export function useSyncLanguage(): void {
  const language = useSettings((s) => s.language);
  useEffect(() => {
    void applyLanguage(language);
  }, [language]);
}
