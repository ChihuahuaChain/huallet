import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const include = [
  "src", "public", "scripts", "e2e/extension.e2e.mjs", "e2e/ledger.e2e.mjs", "extension-assets",
  "index.html", "popup.html", "package.json", "package-lock.json",
  "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "vite.config.ts",
  "README.md", "LICENSE", "NOTICE", "TRADEMARKS.md", "PRIVACY.md", ".gitignore", "docs",
];

const stage = mkdtempSync(join(tmpdir(), "huallet-src-"));
const dir = join(stage, `huallet-${pkg.version}`);
mkdirSync(dir);
for (const p of include) {
  if (!existsSync(join(root, p))) throw new Error(`Missing ${p}`);
  cpSync(join(root, p), join(dir, p), { recursive: true });
}
cpSync(join(root, "store", "firefox", "BUILD.md"), join(dir, "BUILD.md"));

mkdirSync(join(root, "release"), { recursive: true });
const out = join(root, "release", `huallet-source-${pkg.version}.zip`);
rmSync(out, { force: true });
execFileSync("zip", ["-qr", "-X", out, `huallet-${pkg.version}`], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(`✓ release/huallet-source-${pkg.version}.zip`);
