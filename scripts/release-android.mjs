// Builds the signed release APK into release/:
//   npm run release:android
// Needs JAVA_HOME / ANDROID_HOME, and the keystore described in android/app/build.gradle.
import { execFileSync } from "node:child_process";
import { copyFileSync, createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
const [maj, min, pat] = version.split(".").map(Number);
const code = maj * 10000 + min * 100 + pat;
if (!gradle.includes(`versionName "${version}"`) || !gradle.includes(`versionCode ${code}`)) {
  throw new Error(`android/app/build.gradle must have versionName "${version}" and versionCode ${code}`);
}

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
run("node", ["scripts/build-mobile.mjs"]);
run("npx", ["cap", "sync", "android"]);
run("./gradlew", ["clean", "testReleaseUnitTest", "assembleRelease"], join(root, "android"));

const built = join(root, "android/app/build/outputs/apk/release/app-release.apk");
const out = join(root, "release", `huallet-android-${version}.apk`);
mkdirSync(dirname(out), { recursive: true });
copyFileSync(built, out);
const hash = createHash("sha256");
for await (const chunk of createReadStream(out)) hash.update(chunk);
const line = `${hash.digest("hex")}  huallet-android-${version}.apk\n`;
writeFileSync(`${out}.sha256`, line);
console.log(`✓ ${out}\n  sha256 ${line}`);
