import huahua from "@/assets/tokens/huahua.png";
import atom from "@/assets/tokens/atom.png";
import osmo from "@/assets/tokens/osmo.png";
import { REGISTRY_IMG } from "./builtin";

const BUNDLED: Record<string, string> = {
  [`${REGISTRY_IMG}/chihuahua/images/huahua.png`]: huahua,
  [`${REGISTRY_IMG}/cosmoshub/images/atom.png`]: atom,
  [`${REGISTRY_IMG}/osmosis/images/osmo.png`]: osmo,
};

/** Built-in token icons ship with the app, so showing them makes no network request. */
export function localIconUrl(src: string | undefined): string | undefined {
  return (src && BUNDLED[src]) || src;
}
