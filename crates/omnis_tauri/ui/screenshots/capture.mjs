import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = "http://localhost:5173/screenshots/index.html";
const OUT = process.argv[2];
const only = process.argv.slice(3);

const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });

async function waitImages(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    });
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForTimeout(900);
}

async function open(query = "") {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.goto(BASE + query);
  await page.waitForSelector("text=Baldur's Gate 3", { timeout: 15000 });
  await page.mouse.move(1439, 899);
  return page;
}

const shots = {
  async "library-grid"(page) {
    await waitImages(page);
  },
  async "game-details"(page) {
    await page.getByRole("button", { name: "Details", exact: true }).first().click();
    await waitImages(page);
  },
  async achievements(page) {
    await page.getByRole("button", { name: "Details", exact: true }).first().click();
    const h = page.locator("h3", { hasText: "Achievements" }).first();
    await h.waitFor();
    await h.evaluate((el) => el.closest("div.p-6.rounded-2xl").scrollIntoView({ block: "start" }));
    await page.evaluate(() => {
      // leave a little breathing room above the gallery card
      let el = document.querySelector("h3")?.closest("[class*='overflow-y']");
      for (const s of document.querySelectorAll("*")) {
        if (s.scrollTop > 0 && s.scrollHeight > s.clientHeight) { s.scrollTop -= 24; }
      }
    });
    await waitImages(page);
  },
  async "statistics-dashboard"(page) {
    await page.getByRole("button", { name: "Stats", exact: true }).first().click();
    await page.waitForTimeout(800);
    await waitImages(page);
  },
};

const queries = { "fullscreen-mode": "?fullscreen" };
shots["fullscreen-mode"] = async (page) => { await page.waitForTimeout(1200); await waitImages(page); };

// Encode with the browser's own WebP encoder so no image tooling is needed
async function toWebp(page, png, quality = 0.86) {
  const dataUrl = await page.evaluate(
    async ({ b64, quality }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      return c.toDataURL("image/webp", quality);
    },
    { b64: png.toString("base64"), quality }
  );
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

for (const [name, fn] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue;
  const page = await open(queries[name] ?? "");
  await fn(page);
  const png = await page.screenshot();
  writeFileSync(`${OUT}/${name}.webp`, await toWebp(page, png));
  console.log("saved", name);
  await page.close();
}
await browser.close();
