class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
}
const store = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: new Proxy(store, {
  ownKeys: (t) => Array.from({ length: t.length }, (_, i) => t.key(i)!),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
}), configurable: true });
