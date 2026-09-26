const NS = "huallet:";

export const storage = {
  get<T = unknown>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  },
  set(key: string, value: unknown): void {
    localStorage.setItem(NS + key, JSON.stringify(value));
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(NS + key);
    } catch {
    }
  },
  clearAll(): void {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(NS)) localStorage.removeItem(k);
    } catch {
    }
  },
};
