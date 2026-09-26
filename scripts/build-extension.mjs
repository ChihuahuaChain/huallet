import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";
import { thirdPartyNotices } from "./third-party-notices.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const staging = join(root, "dist-extension", "build");
const alias = { "@": join(root, "src"), globalthis: join(root, "src/lib/shims/globalthis.cjs") };

const GECKO_ID = "{5f0b3c2e-7a4d-4e8b-9c61-2b8f3d1a9e47}";

const common = {
  configFile: false,
  root,
  logLevel: "warn",
  publicDir: false,
  resolve: { alias },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
};

console.log(`Building Huallet extension v${pkg.version}…`);
rmSync(join(root, "dist-extension"), { recursive: true, force: true });

await build({
  ...common,
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: staging,
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { popup: join(root, "popup.html") } },
  },
});

for (const [name, entry] of [
  ["background", "src/extension/background/index.ts"],
  ["content", "src/extension/content/content.ts"],
  ["inpage", "src/extension/content/inpage.ts"],
]) {
  await build({
    ...common,
    build: {
      outDir: staging,
      emptyOutDir: false,
      target: "es2022",
      sourcemap: false,
      minify: true,
      lib: { entry: join(root, entry), formats: ["iife"], name: `huallet_${name}`, fileName: () => `${name}.js` },
    },
  });
}

cpSync(join(root, "extension-assets", "icons"), join(staging, "icons"), { recursive: true });
cpSync(join(root, "LICENSE"), join(staging, "LICENSE"));
cpSync(join(root, "NOTICE"), join(staging, "NOTICE"));
writeFileSync(join(staging, "THIRD_PARTY_NOTICES.txt"), thirdPartyNotices().text);

const icons = { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" };
const matches = ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"];

const base = {
  manifest_version: 3,
  name: "Huallet",
  short_name: "Huallet",
  version: pkg.version,
  description: "Self-custodial wallet for Chihuahua Chain and the Cosmos ecosystem. Stake, vote, send, bridge — and connect to dApps.",
  icons,
  action: { default_popup: "popup.html?view=popup", default_title: "Huallet", default_icon: icons },
  permissions: ["storage", "alarms"],
  content_scripts: [
    { matches, js: ["content.js"], run_at: "document_start", all_frames: false },
    { matches, js: ["inpage.js"], run_at: "document_start", all_frames: false, world: "MAIN" },
  ],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};

const manifests = {
  chrome: { ...base, background: { service_worker: "background.js" }, minimum_chrome_version: "111" },
  firefox: {
    ...base,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: { id: GECKO_ID, strict_min_version: "140.0", data_collection_permissions: { required: ["none"] } },
      gecko_android: { strict_min_version: "142.0" },
    },
  },
};

mkdirSync(join(root, "release"), { recursive: true });
for (const [browser, manifest] of Object.entries(manifests)) {
  const dir = join(root, "dist-extension", browser);
  cpSync(staging, dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const zip = join(root, "release", `huallet-${browser}-${pkg.version}.zip`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-qr", "-X", zip, "."], { cwd: dir });
  console.log(`  ✓ ${browser}: dist-extension/${browser}/  →  release/huallet-${browser}-${pkg.version}.zip`);
}
rmSync(staging, { recursive: true, force: true });
