import { useEffect, useState } from "react";
import { useAddressBook } from "@/state/addressBook";
import { useChainsStore } from "@/state/chains";
import { useSettings } from "@/state/settings";

const stores = [useSettings, useChainsStore, useAddressBook];

export function useHydrated(): boolean {
  const [done, setDone] = useState(() => stores.every((s) => s.persist.hasHydrated()));
  useEffect(() => {
    if (done) return;
    const check = () => setDone(stores.every((s) => s.persist.hasHydrated()));
    const unsubs = stores.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => unsubs.forEach((u) => u());
  }, [done]);
  return done;
}
