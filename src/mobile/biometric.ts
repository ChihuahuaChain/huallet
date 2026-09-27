import { registerPlugin } from "@capacitor/core";
import { BiometricCancelledError, type Biometric, type BiometricStatus } from "@/lib/biometric";

interface NativeBiometric {
  status(): Promise<BiometricStatus>;
  enable(o: { secret: string; title: string; cancel: string }): Promise<void>;
  unlock(o: { title: string; cancel: string }): Promise<{ secret: string }>;
  disable(): Promise<void>;
}

const native = registerPlugin<NativeBiometric>("HualletBiometric");

function mapError(e: unknown): never {
  if ((e as { code?: string })?.code === "cancelled") throw new BiometricCancelledError();
  throw e;
}

export const androidBiometric: Biometric = {
  status: () => native.status(),
  enable: (password, title) => native.enable({ secret: password, title, cancel: "Cancel" }).catch(mapError),
  unlock: (title) =>
    native
      .unlock({ title, cancel: "Use password" })
      .then((r) => r.secret)
      .catch(mapError),
  disable: () => native.disable(),
};
