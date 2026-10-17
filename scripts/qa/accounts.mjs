import { demoAsAdmin } from "./helpers.mjs";
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:5199",
  OUT = process.argv[2] ?? process.env.QA_OUT ?? ".qa-out";
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log(`${c ? "✔" : "✘"} ${m}`);
};
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 360, height: 780 },
  acceptDownloads: true,
});
await ctx.addInitScript(() => {
  window.__shared = [];
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (d) => {
      window.__shared.push(d);
    },
  });
  Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const go = async (p) => {
  await page.goto(BASE + p);
  await page.waitForLoadState("networkidle");
};

await go("/");
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await page.waitForLoadState("networkidle");
await demoAsAdmin(page);

await page.getByRole("link", { name: /হিসাব শেয়ার/ }).click();
await page.waitForURL(/\/club\/sample-puja-committee-2026\/accounts$/);
await page.waitForLoadState("networkidle");
ok(true, "home → /audit forwards to /club/$slug/accounts");
await page.getByRole("heading", { name: "নমুনা পূজা কমিটি ২০২৬" }).waitFor();
ok(
  await page.getByRole("link", { name: "ফিরে যান" }).isVisible(),
  "signed-in user gets a back link",
);
const rows = await page.locator("table tbody tr").allInnerTexts();
ok(rows.length === 4, `category table lists 4 categories (${rows.length})`);
const pcts = rows
  .map((r) => r.match(/([০-৯]+)%/)?.[1])
  .map((d) => Number(d.replace(/[০-৯]/g, (x) => "০১২৩৪৫৬৭৮৯".indexOf(x))));
ok(pcts.reduce((a, b) => a + b, 0) === 100, `percentages add to 100 (${pcts})`);
const slices = page.locator('[aria-labelledby="acc-cat"] svg path');
ok((await slices.count()) === 4, "donut has 4 slices");
// Hover a slice → the centre shows that category and its amount.
await slices.first().scrollIntoViewIfNeeded();
const firstName = (await page.locator("table tbody tr th").first().innerText()).trim();
// A point on the ring just clockwise of 12 o'clock (the first slice starts there).
const svgBox = await page.locator('[aria-labelledby="acc-cat"] svg').boundingBox();
const k = svgBox.width / 224;
await page.mouse.move(
  svgBox.x + svgBox.width / 2 + 92 * k * Math.sin(0.3),
  svgBox.y + svgBox.height / 2 - 92 * k * Math.cos(0.3),
  { steps: 4 },
);
const centre = page.locator('[aria-labelledby="acc-cat"] .pointer-events-none');
ok(
  (await centre.innerText()).includes(firstName),
  `slice hover shows its name and amount in the centre (${firstName})`,
);
ok(await page.getByRole("progressbar", { name: "লক্ষ্য" }).isVisible(), "target progress bar");
ok(
  !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
  "no horizontal overflow",
);
const small = await page
  .locator("main button, main a, header button, header a")
  .evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height < 48).map((e) => e.textContent),
  );
ok(small.length === 0, `targets ≥48px ${small}`);
await page.mouse.move(5, 5);
await page.screenshot({ path: `${OUT}/m6-light.png`, fullPage: true });

await page.getByRole("button", { name: "শেয়ার করুন" }).click();
const text = await page.evaluate(() => window.__shared[0]?.text ?? "");
ok(
  text.includes("আদায়") && text.includes("নগদ") && !/https?:/.test(text),
  "share summary text, no link",
);
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "স্টোরি কার্ড" }).click();
const d = await dl;
await d.saveAs(`${OUT}/m6-story.png`);
ok(
  d.suggestedFilename() === "sample-puja-committee-2026-hisab.png",
  `story card ${d.suggestedFilename()}`,
);

// Negative balance renders in vermilion.
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem("pk_db_v2"));
  db.expenses[0].amount = 900000;
  localStorage.setItem("pk_db_v2", JSON.stringify(db));
});
await go("/club/sample-puja-committee-2026/accounts");
const bal = page.locator("#acc-balance + div");
ok(
  (await bal.innerText()).startsWith("−") &&
    (await bal.evaluate((e) => e.className)).includes("text-primary"),
  `negative balance in vermilion (${await bal.innerText()})`,
);

// Visitor without a session: still readable, no way into the app.
await page.evaluate(() => localStorage.removeItem("pk_session_v1"));
await go("/club/sample-puja-committee-2026/accounts");
await page.getByRole("heading", { name: "নমুনা পূজা কমিটি ২০২৬" }).waitFor();
ok(
  !(await page.getByRole("link", { name: "ফিরে যান" }).count()),
  "read-only without login, no back link",
);
await go("/club/unknown-club/accounts");
ok(
  await page.getByText("এই ক্লাবের হিসাব পাওয়া যায়নি").isVisible(),
  "unknown slug shows not-found",
);

// Dark mode.
await page.evaluate(() => {
  localStorage.setItem("app_locale", "en");
  localStorage.setItem("pk_prefs_v1", JSON.stringify({ bnDigits: false, dark: true }));
});
await go("/club/sample-puja-committee-2026/accounts");
await page.getByRole("heading", { name: "Sample Puja Committee 2026" }).waitFor();
const slice = await page
  .locator('[aria-labelledby="acc-cat"] svg path')
  .first()
  .getAttribute("fill");
const chart1 = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--chart-1").trim(),
);
ok(chart1 === "#3987e5", `dark mode uses its own chart steps (${chart1}, slice fill ${slice})`);
await page.screenshot({ path: `${OUT}/m6-dark.png`, fullPage: true });

ok(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
