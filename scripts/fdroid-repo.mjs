// Updates the Huallet F-Droid repository (https://chihuahua.wtf/fdroid/repo) with the APK in release/:
//   npm run fdroid:repo -- /path/to/website_v3
// The repository keystore and config.yml live in ~/.huallet-fdroid (or HUALLET_FDROID_DIR), outside the repo.
// Needs fdroidserver on PATH (or FDROID), JAVA_HOME and ANDROID_HOME. Commit and push website_v3 afterwards.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const website = process.argv[2] && resolve(process.argv[2]);
if (!website || !existsSync(join(website, "index.html"))) throw new Error("usage: npm run fdroid:repo -- /path/to/website_v3");

const dir = process.env.HUALLET_FDROID_DIR || join(homedir(), ".huallet-fdroid");
if (!existsSync(join(dir, "config.yml"))) throw new Error(`${dir}/config.yml not found`);
const apk = join(root, "release", `huallet-android-${version}.apk`);
if (!existsSync(apk)) throw new Error(`${apk} not found: run npm run release:android first`);

const app = "wtf.chihuahua.huallet";
cpSync(join(root, "store/fdroid/repo-metadata.yml"), join(dir, "metadata", `${app}.yml`));
rmSync(join(dir, "metadata", app), { recursive: true, force: true });
cpSync(join(root, "fastlane/metadata/android"), join(dir, "metadata", app), { recursive: true });
cpSync(join(root, "extension-assets/icons/icon-128.png"), join(dir, "huallet.png"));
cpSync(apk, join(dir, "repo", `huallet-android-${version}.apk`));

const env = { ...process.env };
if (env.JAVA_HOME) env.PATH = `${join(env.JAVA_HOME, "bin")}:${env.PATH}`;
execFileSync(env.FDROID || "fdroid", ["update", "--pretty"], { cwd: dir, stdio: "inherit", env });

const out = join(website, "fdroid", "repo");
rmSync(out, { recursive: true, force: true });
cpSync(join(dir, "repo"), out, { recursive: true, filter: (src) => !src.startsWith(join(dir, "repo", "status")) });
console.log(`✓ ${out}`);
