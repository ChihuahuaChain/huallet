export interface KV {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    async get<T>(k: string) {
      const v = m.get(k);
      return v === undefined ? undefined : (JSON.parse(v) as T);
    },
    async set(k, v) {
      m.set(k, JSON.stringify(v));
    },
    async remove(k) {
      m.delete(k);
    },
  };
}

export function localStorageKV(prefix = "huallet:"): KV {
  return {
    async get<T>(k: string) {
      const raw = localStorage.getItem(prefix + k);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    },
    async set(k, v) {
      localStorage.setItem(prefix + k, JSON.stringify(v));
    },
    async remove(k) {
      localStorage.removeItem(prefix + k);
    },
  };
}

type StorageArea = {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

export function extApi(): typeof chrome | undefined {
  const g = globalThis as unknown as { browser?: typeof chrome; chrome?: typeof chrome };
  const api = g.browser ?? g.chrome;
  return api?.runtime?.id ? api : undefined;
}

export function extensionKV(area: "local" | "session", prefix = "huallet:"): KV {
  const store = () => {
    const api = extApi();
    if (!api) throw new Error("Extension storage unavailable");
    return api.storage[area] as unknown as StorageArea;
  };
  return {
    async get<T>(k: string) {
      const r = await store().get(prefix + k);
      return r[prefix + k] as T | undefined;
    },
    async set(k, v) {
      await store().set({ [prefix + k]: v });
    },
    async remove(k) {
      await store().remove(prefix + k);
    },
  };
}

export const appStateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const api = extApi();
    if (!api) return localStorage.getItem(name);
    const r = await (api.storage.local as unknown as StorageArea).get(name);
    return (r[name] as string | undefined) ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const api = extApi();
    if (!api) return localStorage.setItem(name, value);
    await (api.storage.local as unknown as StorageArea).set({ [name]: value });
  },
  removeItem: async (name: string): Promise<void> => {
    const api = extApi();
    if (!api) return localStorage.removeItem(name);
    await (api.storage.local as unknown as StorageArea).remove(name);
  },
};
