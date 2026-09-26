import { WrongPasswordError } from "@/lib/crypto/vault";
import { KeyringLockedError, UnlockThrottledError } from "@/lib/keyring/keyring";
import { extApi } from "@/lib/kv";
import type { Envelope, UiRequest } from "../shared/protocol";

export async function bg<T = unknown>(req: UiRequest): Promise<T> {
  const api = extApi();
  if (!api) throw new Error("Not running inside the Huallet extension");
  const res = (await api.runtime.sendMessage(req)) as Envelope<T> | undefined;
  if (!res) throw new Error("No response from the Huallet background");
  if (res.ok) return res.result;
  if (res.code === "wrong-password") throw new WrongPasswordError();
  if (res.code === "locked") throw new KeyringLockedError();
  if (res.code?.startsWith("throttled:")) throw new UnlockThrottledError(Number(res.code.split(":")[1]));
  throw new Error(res.error);
}
