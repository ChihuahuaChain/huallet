// Biometric unlock, where the platform has it (the Android app). The
// extension never sets an implementation, so every caller sees "unavailable".

export interface BiometricStatus {
  available: boolean;
  reason: "ok" | "none-enrolled" | "no-hardware" | "unavailable";
  enabled: boolean;
}

export interface Biometric {
  status(): Promise<BiometricStatus>;
  /** Stores the wallet password behind a biometric check (shows the prompt). */
  enable(password: string, title: string): Promise<void>;
  /** Shows the prompt and returns the stored password. */
  unlock(title: string): Promise<string>;
  disable(): Promise<void>;
}

export class BiometricCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "BiometricCancelledError";
  }
}

let impl: Biometric | null = null;

export function setBiometric(b: Biometric) {
  impl = b;
}

export function biometric(): Biometric | null {
  return impl;
}
