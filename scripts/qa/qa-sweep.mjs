import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:5199",
  OUT = process.argv[2] ?? process.env.QA_OUT ?? ".qa-out";
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log(`${c ? "✔" : "✘"} ${m}`);
};
const seen = (loc, timeout = 6000) =>
  loc.waitFor({ timeout }).then(
    () => true,
    () => false,
  );
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const errors = [];
const fresh = async (init) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on(
    "pageerror",
    (e) =>
      !/Failed to fetch dynamically|Importing a module/.test(e.message) && errors.push(e.message),
  );
  page.on(
    "console",
    (m) => m.type() === "error" && !/404|ERR_FAILED|net::/.test(m.text()) && errors.push(m.text()),
  );
  return page;
};
const settle = (p) => p.waitForLoadState("networkidle");

// Dark mode before first paint: block all app JS so React never runs — only the inline
// head script can apply the class. (A DOMContentLoaded check is fooled: module scripts run
// before that event.)
{
  const page = await fresh(() =>
    localStorage.setItem("pk_prefs_v1", JSON.stringify({ bnDigits: true, dark: true })),
  );
  await page.route(/\.(m?js|tsx?)(\?|$)/, (r) => r.abort());
  await page.route(/\/@(vite|id|fs|react-refresh)/, (r) => r.abort());
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  ok(
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
    "dark mode applied by the head script alone, before any app JS",
  );
  await page.context().close();
}
{
  const page = await fresh(() =>
    localStorage.setItem("pk_prefs_v1", JSON.stringify({ bnDigits: true, dark: false })),
  );
  await page.route(/\.(m?js|tsx?)(\?|$)/, (r) => r.abort());
  await page.route(/\/@(vite|id|fs|react-refresh)/, (r) => r.abort());
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  ok(
    !(await page.evaluate(() => document.documentElement.classList.contains("dark"))),
    "light preference stays light",
  );
  await page.context().close();
}

// Demo identity, collect defaults, recent-first picker, focus management.
{
  const page = await fresh();
  await page.goto(BASE + "/");
  await settle(page);
  await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
  await page.waitForURL(/home/);
  await settle(page);
  const chip = page.getByRole("link", { name: /ডেমো: কর্মী ০১ \(সংগ্রাহক\)/ });
  ok(await seen(chip), "header shows the demo identity");
  await page.goto(BASE + "/collect");
  await settle(page);
  ok(
    (await page.locator("#collect-collector option:checked").innerText()).startsWith("কর্মী ০১"),
    "collector defaults to কর্মী ০১ (SPEC 2.1)",
  );
  // Recent first: add a household + collect, then it should lead the picker.
  await page.getByRole("button", { name: /নতুন বাড়ি যোগ করুন/ }).click();
  await page.fill("#collect-resident_name", "নতুন বাসিন্দা");
  await page.fill("#collect-house_no", "999");
  await page.getByRole("button", { name: /২৫১/ }).first().click();
  await page.getByRole("button", { name: /জমা ও রসিদ তৈরি/ }).click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  ok(
    await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement),
    ),
    "receipt modal takes keyboard focus",
  );
  for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
  ok(
    await page.evaluate(() =>
      document.querySelector('[role="dialog"]').contains(document.activeElement),
    ),
    "Tab stays inside the modal",
  );
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  const first = (await page.locator("ul li button").first().innerText()).replace(/\n/g, " ");
  ok(first.includes("নতুন বাসিন্দা"), `most recent household leads the picker (${first})`);
  await chip.click();
  await page.waitForURL(/\/settings#demo-actor/);
  ok(await seen(page.locator("#demo-actor")), "header chip opens the acting-as switch");
  await page.context().close();
}

// Outsider: view-only notice, no collect buttons.
{
  const page = await fresh();
  await page.goto(BASE + "/");
  await settle(page);
  await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
  await page.waitForURL(/home/);
  await settle(page);
  await page.evaluate(() =>
    localStorage.setItem("pk_session_v1", JSON.stringify({ mode: "user", phone: "9000000556" })),
  );
  await page.goto(BASE + "/home");
  await settle(page);
  ok(
    await seen(page.getByText("আপনি এই ক্লাবের সদস্য নন — শুধু দেখতে পারবেন")),
    "outsider sees the view-only notice",
  );
  ok(
    !(await page.getByRole("link", { name: /চাঁদা জমা|খরচ লিখুন/ }).count()),
    "outsider gets no collect/expense actions on home",
  );
  await page.goto(BASE + "/chanda");
  await settle(page);
  ok(
    !(await page.getByRole("link", { name: /চাঁদা জমা|^আদায়$/ }).count()),
    "outsider gets no collect buttons in the register",
  );
  ok(
    await seen(page.getByRole("link", { name: /রিমাইন্ডার/ }).first()),
    "reminders still available (read-only friendly)",
  );
  await page.screenshot({ path: `${OUT}/qa-outsider.png` });
  await page.context().close();
}

ok(errors.length === 0, `no page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
