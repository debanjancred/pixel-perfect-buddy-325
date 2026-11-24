// M14 admin approval (ADR 0003): a collector's chanda and a treasurer's void request wait for
// the admin, who approves in bulk from Home → Approvals.
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
await ctx.addInitScript(() => {
  navigator.share = async () => {};
  navigator.canShare = () => true;
});
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
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("pk_db_v2")));
const smallTargets = () =>
  page.locator("main button, main a, main label:has(input[type=checkbox])").evaluateAll((els) =>
    els
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.height < 48;
      })
      .map((e) => e.textContent.trim().slice(0, 30)),
  );

await go("/");
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await page.waitForLoadState("networkidle");

// --- Collector: the receipt is given at once, but waits for the admin ---
const before = (await db()).chanda.length;
const hh = (await db()).households.find((h) => h.phone_number);
await go(`/collect?household=${hh.id}`);
await page.getByRole("button", { name: "অন্য" }).click();
await page.locator("input[inputmode=numeric]").last().fill("777");
await page.getByRole("button", { name: /জমা ও রসিদ তৈরি/ }).click();
const dialog = page.getByRole("dialog");
await dialog.waitFor();
ok(
  await seen(dialog.getByText("অ্যাডমিনের অনুমোদনের অপেক্ষায় — অনুমোদনের পর হিসাবে যোগ হবে")),
  "collector: receipt says it waits for the admin",
);
const mine = (await db()).chanda.at(-1);
ok(
  (await db()).chanda.length === before + 1 && mine.approval_status === "pending",
  "collector: chanda saved as pending",
);
await dialog.getByRole("button", { name: "ঠিক আছে" }).click();
await go("/home");
ok(await seen(page.getByText(/আরও ৳?₹?৭৭৭ অনুমোদনের অপেক্ষায়/)), "home: waiting amount shown");
ok(await seen(page.getByText("অনুমোদনের অপেক্ষায়").first()), "home: waiting badge on the entry");
ok(!(await page.locator('a[href="/approvals"]').count()), "collector: no approvals link");
await go("/approvals");
ok(await seen(page.getByText("অনুমতি নেই")), "collector: approvals screen says no access");

// --- Treasurer: a void is a request ---
await actAs("কোষাধ্যক্ষ ০১ — কোষাধ্যক্ষ");
const exp = (await db()).expenses.find((e) => !e.voided_at);
await go(`/expenses?expense=${exp.id}`);
await page.getByRole("button", { name: "বাতিলের অনুরোধ" }).click();
const vd = page.getByRole("dialog", { name: "বাতিলের অনুরোধ" });
await vd.locator("textarea").fill("দুবার লেখা");
await vd.getByRole("button", { name: "অনুরোধ পাঠান" }).click();
ok(
  await seen(page.getByText("বাতিলের অনুরোধ অ্যাডমিনকে পাঠানো হয়েছে")),
  "treasurer: request sent toast",
);
const requested = (await db()).expenses.find((e) => e.id === exp.id);
ok(!!requested.void_requested_at && !requested.voided_at, "treasurer: expense not voided yet");

// --- Admin: Home link → Approvals, bulk approve, grant the void ---
await actAs("অ্যাডমিন ০১ — অ্যাডমিন");
await go("/home");
const link = page.getByRole("link", { name: /২টি অনুমোদনের অপেক্ষায়/ });
ok(await seen(link), "admin: home shows 2 waiting");
const collectedBefore = await page.locator("section.bg-hero .num").nth(1).innerText();
await link.click();
await page.waitForURL(/approvals/);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/approvals-bn.png`, fullPage: true });
const small = await smallTargets();
ok(small.length === 0, `approvals: all targets ≥48px ${small.join("|")}`);
ok(await seen(page.getByText("দুবার লেখা")), "admin: void request shows its reason");

await page.getByRole("checkbox").first().check();
await page.getByRole("button", { name: /বাছাই করা ১টি অনুমোদন করুন/ }).click();
ok(await seen(page.getByText("১টি অনুমোদিত হয়েছে")), "admin: bulk approve toast");
ok(
  (await db()).chanda.find((c) => c.id === mine.id).approval_status === "approved",
  "admin: chanda approved",
);
await page.getByRole("button", { name: "বাতিল করুন" }).click();
ok(await seen(page.getByText("অনুমোদনের অপেক্ষায় কিছু নেই")), "admin: queue empty afterwards");
ok(!!(await db()).expenses.find((e) => e.id === exp.id).voided_at, "admin: void granted");

await go("/home");
const collectedAfter = await page.locator("section.bg-hero .num").nth(1).innerText();
ok(collectedAfter !== collectedBefore, "home: approved chanda now counts in the total");
ok(!(await page.getByText(/অনুমোদনের অপেক্ষায়/).count()), "home: nothing waiting any more");

// English and dark: same screen, no Bengali left over
await page.evaluate(() => localStorage.setItem("app_locale", "en"));
await go("/approvals?kind=expense");
ok(await seen(page.getByRole("heading", { name: "Approvals" })), "en: heading");
ok(
  (await page.getByRole("button", { name: /^Expense/ }).getAttribute("aria-pressed")) === "true",
  "kind filter read from the URL",
);

ok(errors.length === 0, `no console errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
