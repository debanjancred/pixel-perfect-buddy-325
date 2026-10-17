import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:5199",
  OUT = process.argv[2] ?? process.env.QA_OUT ?? ".qa-out";
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log(`${c ? "✔" : "✘"} ${m}`);
};
const seen = (loc) =>
  loc.waitFor({ timeout: 5000 }).then(
    () => true,
    () => false,
  );
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const go = async (p) => {
  await page.goto(BASE + p);
  await page.waitForLoadState("networkidle");
};
const actAs = async (label) => {
  await go("/settings");
  await page.locator("#demo-actor").selectOption({ label });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
};

await go("/");
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await page.waitForLoadState("networkidle");

ok(
  await seen(page.getByRole("link", { name: /ডেমো: কর্মী ০১ \(সংগ্রাহক\)/ })),
  "demo starts as কর্মী ০১, shown in the header (SPEC 2.1)",
);
await actAs("অ্যাডমিন ০১ — অ্যাডমিন");
await go("/home");
// --- Admin sees everything ---
ok(await seen(page.getByRole("link", { name: /খরচ লিখুন/ })), "admin: add-expense quick action");
ok(
  await seen(page.getByRole("link", { name: /সংগ্রাহকদের হাতে মোট/ })),
  "admin: outstanding-cash card on home",
);
await go("/settings");
ok(
  (await page.locator("#demo-actor option:checked").innerText()).includes("অ্যাডমিন"),
  "switch to admin took effect",
);

// --- Collector: only collecting ---
await actAs("কর্মী ০১ — সংগ্রাহক");
await go("/home");
ok(
  !(await page.getByRole("link", { name: /খরচ লিখুন/ }).count()) &&
    !(await page.getByRole("link", { name: /সংগ্রাহকদের হাতে মোট/ }).count()),
  "collector: no add-expense, no cash card",
);
await go("/expenses?add=true");
ok(
  !(await page.getByRole("button", { name: /খরচ লিখুন/ }).count()) &&
    !(await page.getByRole("dialog").count()),
  "collector: no expense FAB, deep link opens no form",
);
await go("/events");
ok(
  !(await page.getByRole("button", { name: /নতুন প্রতিযোগিতা/ }).count()),
  "collector: no add-event",
);
await go("/settings");
ok(
  !(await page.locator("#member-name").count()) &&
    !(await page.getByRole("combobox", { name: /দায়িত্ব:/ }).count()),
  "collector: members read-only",
);
await go("/home");
await page.locator('a[href^="/receipt/"]').first().click();
await page.waitForURL(/receipt/);
await page.getByRole("article").waitFor();
ok(
  !(await page.getByRole("button", { name: "বাতিল করুন" }).count()),
  "collector: no void button on receipt",
);
await go("/collect");
ok(
  await seen(page.getByRole("button", { name: /জমা ও রসিদ তৈরি/ })),
  "collector: can open Collect",
);

// --- Treasurer: void a chanda entry ---
await actAs("কোষাধ্যক্ষ ০১ — কোষাধ্যক্ষ");
await go("/home");
const firstRow = page.locator('a[href^="/receipt/"]').first();
const name = (await firstRow.locator(".truncate").first().innerText()).trim();
await firstRow.click();
await page.waitForURL(/receipt/);
await page.getByRole("article").waitFor();
await page.getByRole("button", { name: "বাতিল করুন" }).click();
const dlg = page.getByRole("dialog");
await dlg.getByRole("button", { name: "বাতিল করুন" }).click();
ok(await seen(dlg.getByText("বাতিলের কারণ লিখুন (অন্তত ৩ অক্ষর)")), "void needs a reason");
await page.fill("#void-reason", "ভুল টাকার পরিমাণ");
await dlg.getByRole("button", { name: "বাতিল করুন" }).click();
ok(
  await seen(page.getByRole("article").getByText("এই রসিদটি বাতিল করা হয়েছে").first()),
  "receipt shows voided",
);
ok(
  !(await page.getByRole("button", { name: "বাতিল করুন" }).count()),
  "void button gone once voided",
);
await go("/home");
const struck = page.locator("li").filter({ hasText: name }).filter({ hasText: "বাতিল" }).first();
ok(await seen(struck), `home shows the voided entry struck through (${name})`);

// --- Treasurer: void an expense ---
await go("/expenses");
await page.locator("ul.space-y-2 > li > button").first().click();
await page.getByRole("dialog").getByRole("button", { name: "বাতিল করুন" }).click();
await page.fill("#void-reason", "দুবার লেখা হয়েছে");
await page
  .getByRole("dialog")
  .filter({ hasText: "এন্ট্রি বাতিল" })
  .getByRole("button", { name: "বাতিল করুন" })
  .click();
ok(await seen(page.getByText("এই খরচটি বাতিল করা হয়েছে")), "expense voided with reason shown");

// Escape closes only the top layer: open void over details, Escape → details stay.
await page.goto(BASE + "/expenses");
await page.waitForLoadState("networkidle");
await page.locator("ul.space-y-2 > li > button").nth(1).click();
await page.getByRole("dialog").getByRole("button", { name: "বাতিল করুন" }).click();
await page.getByRole("dialog", { name: "এন্ট্রি বাতিল" }).waitFor();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
ok(
  !(await page.getByRole("dialog", { name: "এন্ট্রি বাতিল" }).count()) &&
    (await page.getByRole("dialog", { name: "খরচের তথ্য" }).count()) === 1,
  "Escape closes only the top dialog",
);
ok(
  await page.evaluate(() => document.body.style.overflow === "hidden"),
  "page stays scroll-locked under the remaining sheet",
);
await page.keyboard.press("Escape");

// --- Treasurer: receive cash ---
await go("/cash");
const card = page.locator("li").filter({ hasText: "কর্মী ০১" }).first();
await card.getByRole("button", { name: /নগদ জমা নিন/ }).click();
await page.waitForURL(/collector=/);
const max = await page.inputValue("#handover-amount");
await page.fill("#handover-amount", String(Number(max) + 1));
await page
  .getByRole("dialog")
  .getByRole("button", { name: /নগদ জমা নিন/ })
  .click();
ok(
  await seen(page.getByText("হাতে থাকা নগদের চেয়ে বেশি জমা নেওয়া যাবে না")),
  "can't receive more than outstanding",
);
await page.fill("#handover-amount", "1000");
await page
  .getByRole("dialog")
  .getByRole("button", { name: /নগদ জমা নিন/ })
  .click();
await page.waitForURL((u) => !u.searchParams.has("collector"));
ok(await seen(page.getByText(/জমা নেওয়া হয়েছে/)), "handover saved");
ok(
  await seen(page.locator("li").filter({ hasText: "কর্মী ০১ → কোষাধ্যক্ষ ০১" })),
  "history shows collector → treasurer",
);
ok(
  !(await page
    .locator("li")
    .filter({ hasText: "কোষাধ্যক্ষ ০১" })
    .filter({ has: page.getByRole("button", { name: /নগদ জমা নিন/ }) })
    .count()),
  "no self-handover button",
);
const small = await page
  .locator("main button, main a")
  .evaluateAll((els) =>
    els
      .filter((e) => e.getBoundingClientRect().height < 48)
      .map((e) => e.getAttribute("aria-label") || e.textContent),
  );
ok(small.length === 0, `targets ≥48px ${small}`);
ok(
  !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
  "no horizontal overflow",
);
await page.screenshot({ path: `${OUT}/m8-cash.png`, fullPage: true });

ok(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
