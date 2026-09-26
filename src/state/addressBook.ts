import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { appStateStorage } from "@/lib/kv";

export interface AddressBookEntry {
  id: string;
  name: string;
  address: string;
  memo?: string;
}

interface AddressBookState {
  entries: AddressBookEntry[];
  add: (e: Omit<AddressBookEntry, "id">) => void;
  update: (id: string, patch: Partial<Omit<AddressBookEntry, "id">>) => void;
  remove: (id: string) => void;
}

export const useAddressBook = create<AddressBookState>()(
  persist(
    (set) => ({
      entries: [],
      add: (e) => set((s) => ({ entries: [...s.entries, { ...e, id: crypto.randomUUID() }] })),
      update: (id, patch) => set((s) => ({ entries: s.entries.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      remove: (id) => set((s) => ({ entries: s.entries.filter((x) => x.id !== id) })),
    }),
    { name: "huallet:address-book", version: 1, storage: createJSONStorage(() => appStateStorage) },
  ),
);
