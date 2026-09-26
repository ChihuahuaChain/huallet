import { Secp256k1HdWallet } from "@cosmjs/amino";
import { toHex } from "@cosmjs/encoding";
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
const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OTHER = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
const log = (...a) => console.log("•", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const device = await Secp256k1HdWallet.fromMnemonic(ABANDON, { prefix: "chihuahua" });
const [deviceAcc] = await device.getAccounts();
const impostor = await Secp256k1HdWallet.fromMnemonic(OTHER, { prefix: "chihuahua" });

const server = await preview({ root: ROOT, configFile: false, preview: { port: 4173, strictPort: true }, logLevel: "warn" });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  pipe: true,
  enableExtensions: [EXT],
  userDataDir: mkdtempSync(join(tmpdir(), "huallet-ledger-")),
  args: ["--no-first-run", "--no-default-browser-check"],
});

try {
  const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("/background.js"), { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  const tab = await browser.newPage();
  const errors = [];
  tab.on("pageerror", (e) => errors.push(e.message));
  await tab.setViewport({ width: 1280, height: 860 });
  await tab.goto(`chrome-extension://${extId}/popup.html`);
  await tab.waitForFunction(() => document.body.innerText.includes("Connect a Ledger"), { timeout: 10000, polling: 300 });
  await tab.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Connect a Ledger")).click());
  await tab.waitForFunction(() => document.body.innerText.includes("Open the Cosmos app"), { timeout: 10000, polling: 300 });
  await tab.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Connect Ledger").click());
  await tab.waitForFunction(() => /Talking to your Ledger|No Ledger selected|Ledger/.test(document.querySelector("[class*='rounded-xl'][class*='border']")?.innerText ?? document.body.innerText), { timeout: 10000, polling: 300 });
  await sleep(1500);
  await sleep(500);
  await tab.screenshot({ path: join(OUT, "ledger-01-pairing-no-device.png") });
  const pairing = await tab.evaluate(() => (document.body.innerText.match(/Talking to your Ledger[^\n]*|No Ledger selected[^\n]*/) ?? ["?"])[0]);
  log("pairing without device →", pairing, errors.length ? `(page errors: ${errors.join("; ")})` : "(no page errors: WebHID bundle + Buffer polyfill load)");

  const created = await tab.evaluate(
    (pub) => chrome.runtime.sendMessage({ type: "create", password: "Test-Huahua-2026!", key: { name: "Nano S", type: "ledger", secret: pub } }),
    toHex(deviceAcc.pubkey),
  );
  if (!created.ok) throw new Error(created.error);
  await tab.reload();
  await tab.waitForFunction(() => document.body.innerText.includes("Total balance"), { timeout: 15000, polling: 300 });
  log("ledger account dashboard ok");

  const dapp = await browser.newPage();
  await dapp.goto("http://localhost:4173/");
  const approvalPage = async (label) => {
    const t = await browser.waitForTarget((t) => t.url().includes("view=approval"), { timeout: 15000 });
    const p = await t.page();
    await p.setViewport({ width: 400, height: 660 });
    await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /Approve|Sign/.test(b.innerText)), { timeout: 15000, polling: 300 });
    await sleep(400);
    await p.screenshot({ path: join(OUT, `ledger-approval-${label}.png`) });
    return p;
  };
  const approvalId = (p) => new URL(p.url()).hash.split("/").pop();

  const enableP = dapp.evaluate(() => window.huallet.enable("chihuahua-1"));
  const c = await approvalPage("connect");
  await c.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Approve").click());
  await enableP;

  const key = await dapp.evaluate(async () => {
    const k = await window.huallet.getKey("chihuahua-1");
    const auto = await window.huallet.getOfflineSignerAuto("chihuahua-1");
    return { addr: k.bech32Address, ledger: k.isNanoLedger, autoHasDirect: typeof auto.signDirect === "function" };
  });
  log("getKey →", JSON.stringify(key), key.addr === deviceAcc.address ? "(address matches device)" : "(ADDRESS MISMATCH)");

  const direct = await dapp.evaluate((a) =>
    window.huallet.signDirect("chihuahua-1", a, { bodyBytes: new Uint8Array(), authInfoBytes: new Uint8Array(), chainId: "chihuahua-1", accountNumber: 1n }).then(() => "signed", (e) => e.message), key.addr);
  log("signDirect on Ledger →", direct);

  const doc = {
    chain_id: "chihuahua-1",
    account_number: "1",
    sequence: "0",
    fee: { amount: [{ denom: "uhuahua", amount: "250000000" }], gas: "200000" },
    msgs: [{ type: "cosmos-sdk/MsgSend", value: { from_address: key.addr, to_address: key.addr, amount: [{ denom: "uhuahua", amount: "1" }] } }],
    memo: "ledger e2e",
  };

  const forgedP = dapp.evaluate((d) => window.huallet.signAmino("chihuahua-1", d.msgs[0].value.from_address, d).then(() => "accepted!", (e) => e.message), doc);
  const f = await approvalPage("sign");
  const forgedText = await f.evaluate(() => document.body.innerText);
  log("approval shows:", /Sign with Ledger/.test(forgedText) ? "“Sign with Ledger” button" : "NO LEDGER BUTTON");
  const forged = await impostor.signAmino((await impostor.getAccounts())[0].address, doc);
  f.evaluate((id, result) => chrome.runtime.sendMessage({ type: "resolveApproval", id, approved: true, result }), approvalId(f), forged).catch(() => {});
  log("forged signature →", await forgedP);

  const goodP = dapp.evaluate((d) => window.huallet.signAmino("chihuahua-1", d.msgs[0].value.from_address, d).then((r) => `ok, sig ${r.signature.signature.length} chars, memo ${r.signed.memo}`, (e) => e.message), doc);
  const g = await approvalPage("sign2");
  const genuine = await device.signAmino(deviceAcc.address, doc);
  g.evaluate((id, result) => chrome.runtime.sendMessage({ type: "resolveApproval", id, approved: true, result }), approvalId(g), genuine).catch(() => {});
  log("genuine signature →", await goodP);

  const status = await tab.evaluate(() => chrome.runtime.sendMessage({ type: "status" }));
  const reveal = await tab.evaluate((id) => chrome.runtime.sendMessage({ type: "revealSecret", id, password: "Test-Huahua-2026!" }), status.result.keys[0].id);
  log("reveal secret →", reveal.ok ? "LEAKED" : reveal.error);
  console.log("LEDGER E2E OK");
} catch (e) {
  console.error("LEDGER E2E FAILED:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
