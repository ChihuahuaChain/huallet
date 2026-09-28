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
try {
  adb("install", "-r", APK);
} catch {
  adb("uninstall", PKG); // a release build (other signature) was installed
  adb("install", APK);
}
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
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    if (sw > cw) throw new Error(`Route ${r} scrolls sideways: ${sw}px content in ${cw}px`);
  }
  log(`all ${routes.length} routes render, none scrolls sideways`);

  await page.evaluate((h) => (window.location.hash = h), "/receive");
  await sleep(1500);
  const address = (await text(page)).match(/chihuahua1[0-9a-z]{38}/)?.[0];
  if (address !== "chihuahua19rl4cm2hmr8afy4kldpxz3fka4jguq0al4qn7h") throw new Error(`Unexpected address ${address}`);
  log("receive address matches the extension:", address);

  await page.click(`button[aria-label^="Show QR code full screen"]`);
  await sleep(1000);
  const fullQr = await page.evaluate(() => !!document.querySelector('[role=dialog][aria-label="Show QR code full screen"]'));
  const bright = /sbrt=1\.0|screenBrightness=1\.0/.test(adb("shell", "dumpsys", "window", "windows"));
  await page.click('[role=dialog][aria-label="Show QR code full screen"]');
  await sleep(800);
  const restored = !/sbrt=1\.0|screenBrightness=1\.0/.test(adb("shell", "dumpsys", "window", "windows"));
  if (!fullQr || !bright || !restored) throw new Error(`QR full screen: shown=${fullQr} bright=${bright} restored=${restored}`);
  log("tapping the QR shows it full screen at full brightness, closing restores it");

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

  // Swipe between the bottom-bar tabs with a real finger gesture.
  await page.evaluate((h) => (window.location.hash = h), "/");
  await sleep(1500);
  const [w, h] = adb("shell", "wm", "size").match(/(\d+)x(\d+)/).slice(1).map(Number);
  adb("shell", "input", "swipe", String(Math.round(w * 0.85)), String(Math.round(h * 0.55)), String(Math.round(w * 0.15)), String(Math.round(h * 0.55)), "150");
  await sleep(1500);
  const afterLeft = await page.evaluate(() => location.hash);
  adb("shell", "input", "swipe", String(Math.round(w * 0.15)), String(Math.round(h * 0.55)), String(Math.round(w * 0.85)), String(Math.round(h * 0.55)), "150");
  await sleep(1500);
  const afterRight = await page.evaluate(() => location.hash);
  if (afterLeft !== "#/stake" || !["#/", "#"].includes(afterRight)) throw new Error(`Swipe went to ${afterLeft} then ${afterRight}`);
  log("swipe left → Stake, swipe right → Dashboard");

  await page.evaluate((h) => (window.location.hash = h), "/send");
  await waitText(page, "Scan QR");
  log("Send offers Scan QR" + ((await text(page)).includes("Tap NFC") ? " and Tap NFC" : " (no NFC on this device)"));
  adb("shell", "pm", "grant", PKG, "android.permission.CAMERA");
  await click(page, "Scan QR");
  await page.waitForFunction(() => { const v = document.querySelector("[role=dialog] video"); return v && v.readyState >= 2 && v.videoWidth > 0; }, { timeout: 20000 });
  const cam = await page.evaluate(() => { const v = document.querySelector("[role=dialog] video"); return `${v.videoWidth}x${v.videoHeight}`; });
  await click(page, "Cancel");
  await sleep(800);
  const stopped = await page.evaluate(() => !document.querySelector("video"));
  if (!stopped) throw new Error("Camera view still open after Cancel");
  log(`in-app QR scanner streams the camera (${cam}) and closes cleanly`);

  // Biometrics: needs a fingerprint enrolled on the emulator (adb emu finger).
  await page.evaluate((h) => (window.location.hash = h), "/settings/security");
  await waitText(page, "Biometric unlock");
  if ((await text(page)).includes("Add a fingerprint or face")) {
    log("biometrics skipped: no fingerprint enrolled on this device");
  } else {
    const finger = async () => {
      await sleep(1500);
      adb("emu", "finger", "touch", "1");
      await sleep(500);
      adb("emu", "finger", "remove", "1");
    };
    await click(page, "Turn on");
    await type(page, "[role=dialog] input[type=password]", PASSWORD);
    await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => b.innerText.trim() === "Turn on").click());
    await finger();
    await waitText(page, "On for this device");
    log("biometric unlock turned on (password checked, fingerprint confirmed)");

    await page.click(`button[aria-label="Lock wallet"]`);
    await waitText(page, "Unlock with biometrics");
    await finger();
    await page.waitForSelector(`button[aria-label="Lock wallet"]`, { timeout: 20000 });
    log("locked, then unlocked with the fingerprint (prompt shown automatically)");

    browser.disconnect();
    ({ browser, page } = await launch());
    await waitText(page, "Unlock with biometrics");
    await finger();
    await page.waitForSelector(`button[aria-label="Lock wallet"]`, { timeout: 20000 });
    log("after an app restart: unlocked with the fingerprint");

    await page.evaluate((h) => (window.location.hash = h), "/settings/accounts");
    await sleep(1500);
    await page.click(`button[aria-label="Reveal secret"]`);
    await waitText(page, "Use fingerprint or face");
    await click(page, "Use fingerprint or face");
    await finger();
    await waitText(page, "abandon", 15000);
    log("recovery phrase shown only after the fingerprint");
    await page.keyboard.press("Escape");
    await sleep(800);
  }

  if (errors.length) throw new Error("Page errors: " + errors.join(" | "));
  console.log("ANDROID E2E OK");
} finally {
  browser?.disconnect();
  adb("forward", "--remove", `tcp:${PORT}`);
}
