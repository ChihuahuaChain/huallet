// The Android app runs the wallet core in the page itself. Persistent data
// goes to Capacitor Preferences (app-private storage); the unlocked session
// stays in memory, so it is gone whenever Android ends the process.

import { Preferences } from "@capacitor/preferences";
import { memoryKV, type KV } from "@/lib/kv";
import type { Platform } from "@/extension/background/core";

const PREFIX = "huallet:";

export const prefsAppStorage = {
  async getItem(name: string): Promise<string | null> {
    return (await Preferences.get({ key: name })).value;
  },
  async setItem(name: string, value: string): Promise<void> {
    await Preferences.set({ key: name, value });
  },
  async removeItem(name: string): Promise<void> {
    await Preferences.remove({ key: name });
  },
  async clear(): Promise<void> {
    await Preferences.clear();
  },
};

function prefsKV(): KV {
  return {
    async get<T>(k: string) {
      const v = await prefsAppStorage.getItem(PREFIX + k);
      return v === null ? undefined : (JSON.parse(v) as T);
    },
    async set(k, v) {
      await prefsAppStorage.setItem(PREFIX + k, JSON.stringify(v));
    },
    async remove(k) {
      await prefsAppStorage.removeItem(PREFIX + k);
    },
  };
}

export function mobilePlatform(onKeystoreChange: () => void): Platform {
  return {
    local: prefsKV(),
    session: memoryKV(),
    async readAppState(name) {
      return (await prefsAppStorage.getItem(name)) ?? undefined;
    },
    async writeAppState(name, value) {
      await prefsAppStorage.setItem(name, value);
    },
    async openApproval(id) {
      const back = location.hash || "#/";
      location.hash = `#/approve/${id}`;
      return back;
    },
    closeApproval(back) {
      location.hash = back as string;
    },
    broadcastKeystoreChange() {
      onKeystoreChange();
    },
  };
}
