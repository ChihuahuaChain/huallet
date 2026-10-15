// Builds the Android app's web bundle into dist-mobile/ (Capacitor's webDir).
import { renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist-mobile");
rmSync(out, { recursive: true, force: true });

await build({
  root,
  logLevel: "warn",
  build: { outDir: out, emptyOutDir: true, rollupOptions: { input: { mobile: join(root, "mobile.html") } } },
});
renameSync(join(out, "mobile.html"), join(out, "index.html"));
console.log("✓ dist-mobile/");

// The provider script injected into the in-app dApp browser's WebView. Built as
// a self-contained IIFE straight into the Android assets, where DappPlugin reads
// it at runtime and evaluates it in each browsed page.
const assets = join(root, "android/app/src/main/assets");
await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  resolve: { alias: { "@": join(root, "src") } },
  build: {
    outDir: assets,
    emptyOutDir: false,
    target: "es2020",
    lib: { entry: join(root, "src/mobile/dappInject.ts"), formats: ["iife"], name: "HualletDappInject", fileName: () => "dappInject.js" },
  },
});
console.log("✓ android assets/dappInject.js");
