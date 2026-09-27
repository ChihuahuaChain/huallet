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
