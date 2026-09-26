import puppeteer from "puppeteer-core";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = join(ROOT, "dist-extension", "chrome");
const OUT = join(ROOT, "e2e", "screenshots");
mkdirSync(OUT, { recursive: true });

const server = await preview({ root: ROOT, configFile: false, preview: { port: 4173, strictPort: true }, logLevel: "warn" });
const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("•", ...a);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  pipe: true,
  enableExtensions: [EXT],
  userDataDir: mkdtempSync(join(tmpdir(), "huallet-e2e-")),
  args: ["--no-first-run", "--no-default-browser-check"],
});

try {
  const swTarget = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/background.js"), { timeout: 15000, polling: 500 });
  const extId = new URL(swTarget.url()).host;
  log("extension id", extId);
  const sw = await swTarget.worker();
  sw.on("console", (m) => console.log("  [bg]", m.text()));

  const tab = await browser.newPage();
  tab.on("pageerror", (e) => console.log("  [popup error]", e.message));
  await tab.setViewport({ width: 1280, height: 860 });
  await tab.goto(`chrome-extension://${extId}/popup.html`);
  await tab.waitForFunction(() => document.body.innerText.includes("Create a new wallet"), { timeout: 10000, polling: 500 });
  await tab.screenshot({ path: join(OUT, "01-onboarding.png") });
  log("onboarding rendered");

  const created = await tab.evaluate(
    (m) => chrome.runtime.sendMessage({ type: "create", password: "Test-Huahua-2026!", key: { name: "E2E", type: "mnemonic", secret: m, backedUp: true } }),
    ABANDON,
  );
  if (!created.ok) throw new Error("create failed: " + created.error);
  await tab.reload();
  await tab.waitForFunction(() => document.body.innerText.includes("Total balance"), { timeout: 15000, polling: 500 });
  await sleep(4000);
  await tab.screenshot({ path: join(OUT, "02-dashboard-tab.png") });
  log("dashboard (tab) rendered");

  const popup = await browser.newPage();
  await popup.setViewport({ width: 380, height: 600 });
  await popup.goto(`chrome-extension://${extId}/popup.html?view=popup`);
  await popup.waitForFunction(() => document.body.innerText.includes("Total balance"), { timeout: 15000, polling: 500 });
  await sleep(3000);
  await popup.screenshot({ path: join(OUT, "03-popup.png") });
  log("popup view rendered");

  const pageErrors = [];
  popup.on("pageerror", (e) => pageErrors.push(`${popup.url()}: ${e.message}`));
  const routes = ["/", "/stake", "/stake/chihuahua-1", "/swap", "/send", "/receive", "/ibc", "/governance", "/chains", "/history",
    "/settings", "/settings/security", "/settings/accounts", "/settings/sites", "/settings/address-book", "/settings/tokens", "/accounts/add"];
  for (const r of routes) {
    await popup.evaluate((h) => { window.location.hash = h; }, r);
    await sleep(1200);
    const text = await popup.evaluate(() => document.body.innerText);
    if (/Something went wrong|Unexpected Application Error/.test(text)) throw new Error(`Route ${r} crashed: ${text.slice(0, 300)}`);
  }
  await popup.evaluate(() => { window.location.hash = "/ibc"; });
  await sleep(1000);
  await popup.select("select", "osmosis-1");
  await sleep(4000);
  const ibcText = await popup.evaluate(() => document.body.innerText);
  if (/Something went wrong|Unexpected Application Error/.test(ibcText)) throw new Error("IBC crashed after choosing a destination");
  if (pageErrors.length) throw new Error("Page errors: " + pageErrors.join(" | "));
  log(`all ${routes.length} routes render; IBC with destination → recipient prefilled:`, /osmo1[0-9a-z]{38}/.test(await popup.evaluate(() => [...document.querySelectorAll("input")].map((i) => i.value).join(" "))));
  await popup.close();

  const dapp = await browser.newPage();
  await dapp.goto("http://localhost:4173/");
  const hasProvider = await dapp.evaluate(() => ({ huallet: !!window.huallet?.isHuallet, otherGlobals: Object.keys(window).filter((k) => /keplr|getOfflineSigner/i.test(k)) }));
  log("provider injected", JSON.stringify(hasProvider));

  const approveNext = async (label) => {
    const t = await browser.waitForTarget((t) => t.url().includes("view=approval"), { timeout: 15000, polling: 500 });
    const p = await t.page();
    await p.setViewport({ width: 400, height: 660 });
    await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^(Approve|Sign)$/.test(b.innerText.trim())), { timeout: 15000, polling: 500 });
    await sleep(500);
    await p.screenshot({ path: join(OUT, `approval-${label}.png`) });
    const text = await p.evaluate(() => document.body.innerText);
    await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^(Approve|Sign)$/.test(b.innerText.trim())).click());
    return text;
  };

  const enableP = dapp.evaluate(() => window.huallet.enable("chihuahua-1").then(() => "enabled"));
  const connectText = await approveNext("connect");
  log("connect approval shows:", connectText.split("\n").filter(Boolean).slice(0, 6).join(" | "));
  log("enable →", await enableP);

  const key = await dapp.evaluate(async () => {
    const k = await window.huallet.getKey("chihuahua-1");
    return { name: k.name, bech32: k.bech32Address, pubKeyLen: k.pubKey.length, algo: k.algo };
  });
  log("getKey →", JSON.stringify(key));

  const arbP = dapp.evaluate((addr) => window.huallet.signArbitrary("chihuahua-1", addr, "Login to Huahua dApp"), key.bech32);
  await approveNext("arbitrary");
  const arb = await arbP;
  log("signArbitrary → signature length", arb.signature.length, "pubkey type", arb.pub_key.type);

  const aminoP = dapp.evaluate(
    (addr) =>
      window.huallet.signAmino("chihuahua-1", addr, {
        chain_id: "chihuahua-1",
        account_number: "1",
        sequence: "0",
        fee: { amount: [{ denom: "uhuahua", amount: "250000000" }], gas: "200000" },
        msgs: [{ type: "cosmos-sdk/MsgSend", value: { from_address: addr, to_address: addr, amount: [{ denom: "uhuahua", amount: "1" }] } }],
        memo: "e2e",
      }),
    key.bech32,
  );
  await approveNext("amino");
  const amino = await aminoP;
  log("signAmino → signed memo", amino.signed.memo, "sig length", amino.signature.signature.length);

  const directP = dapp.evaluate(
    (addr) =>
      window.huallet
        .signDirect("chihuahua-1", addr, { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), chainId: "chihuahua-1", accountNumber: 7n })
        .then((r) => ({ acc: r.signed.accountNumber.toString(), sig: r.signature.signature.length })),
    key.bech32,
  );
  await approveNext("direct");
  log("signDirect →", JSON.stringify(await directP));

  const mismatch = await dapp.evaluate((addr) =>
    window.huallet.signDirect("chihuahua-1", addr, { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), chainId: "osmosis-1", accountNumber: 1n }).then(() => "signed", (e) => e.message),
  key.bech32);
  log("chain-id mismatch →", mismatch);

  const rejP = dapp.evaluate((addr) => window.huallet.signArbitrary("chihuahua-1", addr, "reject me").then(() => "signed", (e) => "rejected: " + e.message), key.bech32);
  const rt = await browser.waitForTarget((t) => t.url().includes("view=approval"), { timeout: 15000, polling: 500 });
  const rp = await rt.page();
  await rp.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "Reject"), { timeout: 15000, polling: 500 });
  await rp.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Reject").click());
  log("reject path →", await rejP);

  const unknown = await dapp.evaluate(() => window.huallet.getKey("nope-1").then(() => "ok", (e) => e.message));
  log("unknown chain →", unknown);

  await tab.evaluate(async () => {
    const raw = (await chrome.storage.local.get("huallet:chains"))["huallet:chains"];
    const st = raw ? JSON.parse(raw) : { state: {}, version: 1 };
    st.state.selectedChainId = "cosmoshub-4";
    await chrome.storage.local.set({ "huallet:chains": JSON.stringify(st) });
  });
  await tab.bringToFront();
  await tab.goto(`chrome-extension://${extId}/popup.html#/send`);
  await tab.reload();
  await tab.waitForSelector('input[placeholder="cosmos1…"]', { timeout: 15000, polling: 500 });
  await sleep(3000);
  await tab.type('input[placeholder="cosmos1…"]', "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4");
  await tab.type('input[placeholder="0.00"]', "0.000001");
  await tab.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Continue").click());
  await tab.waitForFunction(() => /Insufficient funds|would fail|Gas limit/.test(document.querySelector("[role=dialog]")?.innerText ?? ""), { timeout: 90000, polling: 500 });
  await sleep(1500);
  const dlg = await tab.evaluate(() => document.querySelector("[role=dialog]").innerText);
  await tab.screenshot({ path: join(OUT, "06-popup-send-review.png") });
  log("popup send review:", dlg.split("\n").filter((l) => /Gas limit|Insufficient|would fail|Approve/.test(l)).join(" | "));

  await dapp.bringToFront();
  await dapp.reload();
  await dapp.setViewport({ width: 1280, height: 860 });
  await dapp.waitForFunction(() => document.body.innerText.includes("Huallet") && document.body.innerText.includes("Detected"), { timeout: 10000, polling: 500 });
  await dapp.screenshot({ path: join(OUT, "04-web-connect.png") });
  await dapp.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Huallet") && b.innerText.includes("Connect")).click());
  try {
    await approveNext("web-connect");
  } catch {
    log("(no extra approval needed)");
  }
  await dapp.waitForFunction(() => document.body.innerText.includes("Total balance"), { timeout: 20000, polling: 500 });
  await sleep(4000);
  await dapp.screenshot({ path: join(OUT, "05-web-dashboard-via-huallet.png") });
  const menu = await dapp.evaluate(() => document.querySelector("header")?.innerText);
  log("web app connected via Huallet; header:", menu?.replace(/\n/g, " | "));

  const locked = await tab.evaluate(() => chrome.runtime.sendMessage({ type: "lock" }));
  log("lock →", locked.ok);
  const status = await tab.evaluate(() => chrome.runtime.sendMessage({ type: "status" }));
  log("status after lock →", JSON.stringify({ unlocked: status.result.unlocked, keys: status.result.keys.length }));
  console.log("E2E OK");
} catch (e) {
  console.error("E2E FAILED:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
