import { demoAsAdmin } from "./helpers.mjs";
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:5300",
  OUT = process.argv[2] ?? process.env.QA_OUT ?? ".qa-out";
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log(`${c ? "✔" : "✘"} ${m}`);
};
const seen = (loc, timeout = 8000) =>
  loc.waitFor({ timeout }).then(
    () => true,
    () => false,
  );
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// First (online) visit: register the worker and warm its cache.
await page.goto(BASE + "/");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await page.waitForLoadState("networkidle");
await demoAsAdmin(page);
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.active?.scriptURL ?? "";
});
ok(/\/sw\.js\?v=\d+\.\d+\.\d+/.test(sw), `worker registered with a versioned URL (${sw})`);
await page.waitForFunction(
  async () => (await caches.keys()).some((k) => k.startsWith("pk-pages-")),
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(1500); // let the warm-up finish
const cached = await page.evaluate(async () => {
  const out = {};
  for (const k of await caches.keys())
    out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
  return out;
});
const all = Object.values(cached).flat();
ok(
  all.includes("/home") && all.some((p) => p.startsWith("/assets/")),
  `shell + assets cached (${Object.entries(cached)
    .map(([k, v]) => `${k}:${v.length}`)
    .join(", ")})`,
);
ok(
  all.some((p) => p.endsWith(".woff2")) || Object.keys(cached).includes("pk-fonts-v1"),
  "fonts cached",
);
const manifest = await page.evaluate(() => fetch("/manifest.webmanifest").then((r) => r.json()));
ok(
  manifest.icons.some((i) => i.purpose === "maskable"),
  "manifest served with a maskable icon",
);

// Offline: reopen the app from scratch.
await ctx.setOffline(true);
await page.goto(BASE + "/home");
await page.waitForLoadState("domcontentloaded");
ok(
  await seen(page.getByText("অফলাইন মোড — ডেটা আপনার ফোনে সংরক্ষিত হচ্ছে")),
  "app opens offline with the SPEC banner",
);
ok(
  await seen(
    page
      .locator("section.bg-hero .num")
      .first()
      .filter({ hasText: /₹[০-৯]/ }),
  ),
  "dashboard amounts render offline",
);
ok(
  (await seen(page.getByText("নমুনা পূজা কমিটি ২০২৬").first())) &&
    (await seen(page.getByRole("link", { name: /খরচ লিখুন/ }))),
  "club and role-based actions load offline",
);
await page.screenshot({ path: `${OUT}/m9-offline.png` });

// Collect offline (client-side navigation) — saving never waits for the network.
await page
  .getByRole("link", { name: /চাঁদা জমা/ })
  .first()
  .click();
await page.waitForURL(/collect/);
await page.getByRole("button", { name: /নতুন বাড়ি যোগ করুন/ }).click();
await page.fill("#collect-resident_name", "অফলাইন দাতা");
await page.fill("#collect-house_no", "9");
await page.getByRole("button", { name: /৫০১/ }).first().click();
const banner = await page.getByText("অফলাইন মোড").boundingBox();
const saveBtn = await page.getByRole("button", { name: /জমা ও রসিদ তৈরি/ }).boundingBox();
ok(
  banner && saveBtn && banner.y + banner.height <= saveBtn.y,
  "banner doesn't cover the save button",
);
await page.getByRole("button", { name: /জমা ও রসিদ তৈরি/ }).click();
ok(await seen(page.getByRole("dialog")), "chanda saved offline, receipt shown");
await page.getByRole("dialog").getByRole("button", { name: "ঠিক আছে" }).click();
ok(await seen(page.getByText(/টি সিঙ্কের অপেক্ষায়/)), "header shows records waiting to sync");

// Back online: syncs automatically.
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
ok(await seen(page.getByText(/সব সিঙ্ক হয়েছে/)), "reconnecting syncs and confirms");
ok(!(await page.getByText(/টি সিঙ্কের অপেক্ষায়/).count()), "nothing left pending");

// Failed records are retried automatically on load (the retry bar itself is unit-tested).
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem("pk_db_v2"));
  db.chanda[0].sync_status = "failed";
  localStorage.setItem("pk_db_v2", JSON.stringify(db));
});
await page.goto(BASE + "/home");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1000);
const status = await page.evaluate(
  () => JSON.parse(localStorage.getItem("pk_db_v2")).chanda[0].sync_status,
);
ok(status === "synced", `a failed record is retried when the app loads online (${status})`);

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
