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
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
await ctx.addInitScript(() => {
  window.__shared = [];
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: async (d) => {
      window.__shared.push(d);
    },
  });
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

// A finished event, to check the closed state.
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem("pk_db_v2"));
  const e = db.events[0];
  db.events.push({
    ...e,
    id: crypto.randomUUID(),
    title_bn: "পুরনো প্রতিযোগিতা",
    title_en: "Old event",
    date: "2026-01-05",
    registrations_count: 9,
  });
  localStorage.setItem("pk_db_v2", JSON.stringify(db));
});
await go("/events");
const headings = await page.getByRole("heading", { level: 2 }).allInnerTexts();
ok(
  JSON.stringify(headings) === JSON.stringify(["আসছে", "শেষ হয়েছে"]),
  `sections in order ${headings}`,
);
const sitDraw = page.getByRole("article", { name: "বসে আঁকো" });
ok((await sitDraw.innerText()).includes("আগামীকাল"), "countdown shows আগামীকাল");
const old = page.getByRole("article", { name: "পুরনো প্রতিযোগিতা" });
ok(
  (await old.getByText("নাম লেখানো বন্ধ").isVisible()) &&
    !(await old.getByRole("button", { name: /নাম লেখান/ }).count()),
  "finished event closes registration",
);
const small = await page
  .locator("main button, main a, article button")
  .evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height < 48).map((e) => e.textContent),
  );
ok(small.length === 0, `all targets ≥48px ${small}`);
ok(
  !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
  "no horizontal overflow",
);
const tall = await page
  .locator("article button")
  .evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height > 56).map((e) => e.textContent),
  );
ok(tall.length === 0, `card buttons stay on one line ${tall}`);
await page.screenshot({ path: `${OUT}/m5-events.png`, fullPage: true });

// Register → instant +1 → undo.
const tally = () => sitDraw.locator(".num").first().innerText();
const before = await tally();
await sitDraw.getByRole("button", { name: /নাম লেখান/ }).click();
await page.waitForFunction(
  (b) => document.querySelector('[aria-label="বসে আঁকো"] .num').textContent !== b,
  before,
);
ok(before === "২৪" && (await tally()) === "২৫", `register adds one (${before} → ${await tally()})`);
await page.getByRole("button", { name: "ফিরিয়ে নিন" }).click();
await page.waitForFunction(
  () => document.querySelector('[aria-label="বসে আঁকো"] .num').textContent === "২৪",
);
ok(true, "undo restores the tally");
await page.waitForTimeout(1500);
ok((await tally()) === "২৪", `tally stays at 24 after saves settle (${await tally()})`);
const stored = await page.evaluate(
  () =>
    JSON.parse(localStorage.getItem("pk_db_v2")).events.find((e) => e.title_en === "Sit & Draw")
      .registrations_count,
);
ok(stored === 24, `stored tally back to 24 (${stored})`);

// Share.
await sitDraw.getByRole("button", { name: /শেয়ার করুন/ }).click();
const shared = await page.evaluate(() => window.__shared[0]?.text ?? "");
ok(
  shared.includes("নমুনা পূজা কমিটি ২০২৬") &&
    shared.includes("বসে আঁকো") &&
    shared.includes("২৪ জন") &&
    !/https?:/.test(shared),
  "share text is complete and link-free",
);

// Add event.
await page.getByRole("button", { name: /নতুন প্রতিযোগিতা/ }).click();
await page.waitForURL(/add=true/);
const dlg = page.getByRole("dialog");
await page.fill("#event-date", "2020-01-01");
await dlg.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
ok(
  await page.evaluate(() => document.activeElement?.id === "event-title"),
  "empty name focuses the field",
);
ok(await dlg.getByText("আজ বা পরের কোনো তারিখ দিন").isVisible(), "past date rejected");
await page.goBack();
await page.waitForURL((u) => !u.searchParams.has("add"));
ok(!(await dlg.count()), "back closes the form");
await page.getByRole("button", { name: /নতুন প্রতিযোগিতা/ }).click();
await page.fill("#event-title", "শঙ্খ বাজানো");
await dlg.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
await page.waitForURL((u) => !u.searchParams.has("add"));
const todayCard = page.getByRole("article", { name: "শঙ্খ বাজানো" });
await todayCard.waitFor();
ok(
  (await page.getByRole("heading", { level: 2 }).first().innerText()) === "আজ" &&
    (await todayCard.innerText()).includes("০"),
  "new event appears under আজ with 0 registered",
);

await page.getByRole("button", { name: "EN" }).click();
ok(
  (await page.getByRole("heading", { name: "Upcoming" }).isVisible()) &&
    (await page.getByRole("article", { name: "Sit & Draw" }).innerText()).includes("Tomorrow"),
  "English labels",
);

// Fresh club: empty state.
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem("pk_db_v2"));
  db.events = db.events.filter((e) => e.club_id !== db.active_club_id);
  localStorage.setItem("pk_db_v2", JSON.stringify(db));
});
await go("/events");
ok(await page.getByText("No events yet").isVisible(), "empty state when the club has no events");

ok(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
