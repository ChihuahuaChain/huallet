import type { KeyMeta, NewKey } from "@/lib/keyring/keyring";
import { extApi } from "@/lib/kv";
import { useKeyring } from "../state/keyringStore";
import { bg } from "./background";

const refresh = () => useKeyring.getState().refresh();

async function after<T>(p: Promise<T>): Promise<T> {
  const r = await p;
  await refresh();
  return r;
}

export const keyring = {
  create: (password: string, key: NewKey) => after(bg<KeyMeta>({ type: "create", password, key })),
  unlock: (password: string) => after(bg({ type: "unlock", password })),
  lock: () => after(bg({ type: "lock" })),
  addKey: (key: NewKey) => after(bg<KeyMeta>({ type: "addKey", key })),
  renameKey: (id: string, name: string) => after(bg({ type: "renameKey", id, name })),
  markBackedUp: (id: string) => after(bg({ type: "markBackedUp", id })),
  removeKey: (id: string, password: string) => after(bg({ type: "removeKey", id, password })),
  revealSecret: (id: string, password: string) => bg<string>({ type: "revealSecret", id, password }),
  pendingBackupSecret: (id: string) => bg<string>({ type: "pendingBackupSecret", id }),
  changePassword: (oldPassword: string, newPassword: string) => bg({ type: "changePassword", oldPassword, newPassword }),
  verifyPassword: (password: string) => bg<boolean>({ type: "verifyPassword", password }),
  reset: async (password = "") => {
    await bg({ type: "reset", password });
    await extApi()?.storage.local.clear();
    window.location.reload();
  },
};
