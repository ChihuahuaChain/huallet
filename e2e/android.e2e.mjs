// End-to-end check of the Android app on a running emulator or device:
//   npm run build:mobile && (cd android && ./gradlew assembleDebug)
//   node e2e/android.e2e.mjs
// Drives the app's WebView over the DevTools protocol (debug builds only).
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APK = join(ROOT, "android/app/build/outputs/apk/debug/app-debug.apk");
const PKG = "wtf.chihuahua.huallet";
const PORT = 9333;
const PASSWORD = "Test-Huahua-2026!";
const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ADB = process.env.ADB ?? join(process.env.ANDROID_HOME ?? join(process.env.HOME, "Android/Sdk"), "platform-tools/adb");

const adb = (...a) => execFileSync(ADB, a, { encoding: "utf8" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);

async function launch() {
  adb("shell", "am", "force-stop", PKG);
  adb("shell", "am", "start", "-n", `${PKG}/.MainActivity`);
  let sock;
  for (let i = 0; i < 40 && !sock; i++) {
    await sleep(500);
    const pid = adb("shell", "pidof", PKG).trim();
    if (pid && adb("shell", "cat", "/proc/net/unix").includes(`webview_devtools_remote_${pid}`)) sock = `webview_devtools_remote_${pid}`;
  }
  if (!sock) throw new Error("WebView devtools socket not found (is this a debug build?)");
  adb("forward", `tcp:${PORT}`, `localabstract:${sock}`);
  let browser;
  for (let i = 0; i < 20 && !browser; i++) {
    try {
      browser = await puppeteer.connect({ browserURL: `http://localhost:${PORT}`, defaultViewport: null });
    } catch {
      await sleep(500);
    }
  }
  const page = (await browser.pages()).find((p) => p.url().startsWith("https://localhost"));
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, page };
}

const errors = [];
const text = (p) => p.evaluate(() => document.body.innerText);
async function waitText(p, s, ms = 20000) {
  for (let t = 0; t < ms; t += 500) {
    if ((await text(p)).includes(s)) return;
    await sleep(500);
  }
  throw new Error(`"${s}" not shown. Page: ${(await text(p)).slice(0, 300)}`);
}
async function click(p, label) {
  const ok = await p.evaluate((l) => {
    const el = [...document.querySelectorAll("button,a,[role=button]")].find((e) => e.innerText.trim().startsWith(l));
    el?.click();
    return !!el;
  }, label);
  if (!ok) throw new Error(`No button "${label}"`);
  await sleep(600);
}
async function type(p, selector, value) {
  for (const h of await p.$$(selector)) {
    await h.click({ clickCount: 3 });
    await h.type(value);
  }
}

log("install", APK);
adb("install", "-r", APK);
adb("shell", "pm", "clear", PKG);
adb("shell", "cmd", "uimode", "night", "no");

let { browser, page } = await launch();
try {
  await waitText(page, "Create a new wallet");
  log("onboarding rendered");

  await click(page, "Import a wallet");
  await type(page, "textarea", ABANDON);
  await click(page, "Continue");
  await waitText(page, "Protect your wallet");
  await type(page, "input[type=text]", "Android E2E");
  await type(page, "input[type=password]", PASSWORD);
  await page.click("input[type=checkbox]");
  await click(page, "Create wallet");
  await waitText(page, "Total balance", 30000);
  log("wallet imported, dashboard rendered");

  const routes = ["/stake", "/stake/chihuahua-1", "/swap", "/send", "/receive", "/ibc", "/governance", "/chains", "/history",
    "/settings", "/settings/security", "/settings/accounts", "/settings/sites", "/settings/address-book", "/settings/tokens", "/"];
  for (const r of routes) {
    await page.evaluate((h) => (window.location.hash = h), r);
    await sleep(1200);
    const t = await text(page);
    if (/Something went wrong|Unexpected Application Error/.test(t)) throw new Error(`Route ${r} crashed: ${t.slice(0, 300)}`);
  }
  log(`all ${routes.length} routes render`);

  await page.evaluate((h) => (window.location.hash = h), "/receive");
  await sleep(1500);
  const address = (await text(page)).match(/chihuahua1[0-9a-z]{38}/)?.[0];
  if (address !== "chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h") throw new Error(`Unexpected address ${address}`);
  log("receive address matches the extension:", address);

  adb("shell", "cmd", "uimode", "night", "yes");
  await sleep(1500);
  const dark = await page.evaluate(() => document.documentElement.dataset.theme);
  adb("shell", "cmd", "uimode", "night", "no");
  await sleep(1500);
  const light = await page.evaluate(() => document.documentElement.dataset.theme);
  if (dark !== "dark" || light !== "light") throw new Error(`Theme did not follow the device: ${dark}/${light}`);
  log("theme follows the device night mode: dark → light");

  await page.click(`button[aria-label="Lock wallet"]`);
  await waitText(page, "Unlock");
  log("locked from the header");
  await type(page, "input[type=password]", PASSWORD);
  await click(page, "Unlock");
  await page.waitForSelector(`button[aria-label="Lock wallet"]`, { timeout: 20000 });
  log("unlocked with the password");

  browser.disconnect();
  ({ browser, page } = await launch());
  await waitText(page, "Unlock");
  log("after an app restart: vault kept, session locked");
  await type(page, "input[type=password]", "wrong-password");
  await click(page, "Unlock");
  await sleep(1500);
  if (await page.$(`button[aria-label="Lock wallet"]`)) throw new Error("Unlocked with a wrong password");
  await type(page, "input[type=password]", PASSWORD);
  await click(page, "Unlock");
  await page.waitForSelector(`button[aria-label="Lock wallet"]`, { timeout: 20000 });
  log("wrong password refused, right one accepted");

  if (errors.length) throw new Error("Page errors: " + errors.join(" | "));
  console.log("ANDROID E2E OK");
} finally {
  browser?.disconnect();
  adb("forward", "--remove", `tcp:${PORT}`);
}
