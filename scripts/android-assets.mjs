// Renders the Android launcher icons and splash screens from the Huallet
// logo (public/favicon.svg) with headless Chrome. Run after changing the logo:
//   node scripts/android-assets.mjs
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android/app/src/main/res");
const svg = readFileSync(join(root, "public/favicon.svg"), "utf8").replace(/^<\?xml[^>]*>/, "");
const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const BG = "#FED62E";
const SPLASH_BG = "#FFFBEA";

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH = {
  "drawable": [480, 320],
  "drawable-port-mdpi": [320, 480], "drawable-port-hdpi": [480, 800], "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600], "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320], "drawable-land-hdpi": [800, 480], "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960], "drawable-land-xxxhdpi": [1920, 1280],
};

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", headless: true });
const page = await browser.newPage();

async function render(path, w, h, { background = "transparent", logoFrac, radius = "0" }) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const size = Math.round(Math.min(w, h) * logoFrac);
  await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;background:transparent">
    <div style="width:${w}px;height:${h}px;background:${background};border-radius:${radius};display:flex;align-items:center;justify-content:center">
      <img src="${logo}" style="width:${size}px;height:${size}px"></div></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path, omitBackground: true });
}

for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = join(res, `mipmap-${d}`);
  // Adaptive icon: 108dp canvas, the logo's circle fills the 72dp visible area.
  await render(join(dir, "ic_launcher_foreground.png"), Math.round(108 * k), Math.round(108 * k), { logoFrac: 0.7 });
  await render(join(dir, "ic_launcher.png"), Math.round(48 * k), Math.round(48 * k), { logoFrac: 0.96 });
  await render(join(dir, "ic_launcher_round.png"), Math.round(48 * k), Math.round(48 * k), { logoFrac: 0.96 });
}
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  await render(join(res, dir, "splash.png"), w, h, { background: SPLASH_BG, logoFrac: 0.32 });
}
// Play/F-Droid listing icon.
await render(join(root, "fastlane/metadata/android/en-US/images/icon.png"), 512, 512, { logoFrac: 1 });
await browser.close();
console.log(`✓ icons and splash screens (background ${BG})`);
