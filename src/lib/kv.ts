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

/** Where zustand-persisted app state lives when not in the extension: the
 * Android app sets its own store here before any state is loaded. */
let appStorageOverride: { getItem(name: string): Promise<string | null>; setItem(name: string, value: string): Promise<void>; removeItem(name: string): Promise<void>; clear(): Promise<void> } | null = null;

export function setAppStorage(storage: NonNullable<typeof appStorageOverride>) {
  appStorageOverride = storage;
}

/** Wipes everything the wallet stored (used by "reset wallet"). */
export async function clearAllStorage(): Promise<void> {
  if (appStorageOverride) return appStorageOverride.clear();
  await extApi()?.storage.local.clear();
}

export const appStateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (appStorageOverride) return appStorageOverride.getItem(name);
    const api = extApi();
    if (!api) return localStorage.getItem(name);
    const r = await (api.storage.local as unknown as StorageArea).get(name);
    return (r[name] as string | undefined) ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (appStorageOverride) return appStorageOverride.setItem(name, value);
    const api = extApi();
    if (!api) return localStorage.setItem(name, value);
    await (api.storage.local as unknown as StorageArea).set({ [name]: value });
  },
  removeItem: async (name: string): Promise<void> => {
    if (appStorageOverride) return appStorageOverride.removeItem(name);
    const api = extApi();
    if (!api) return localStorage.removeItem(name);
    await (api.storage.local as unknown as StorageArea).remove(name);
  },
};
