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
const errors = [];
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return page;
}
const settle = (p) => p.waitForLoadState("networkidle");

// ---- A: OTP signup → create club → collect → expense ----
let page = await fresh();
await page.goto(BASE + "/");
await settle(page);
await page.fill("#phone", "9000000201");
await page.getByRole("button", { name: "OTP পাঠান" }).click();
await page.getByRole("button", { name: /ডেমো OTP 1234 বসান/ }).click();
await page.getByRole("button", { name: "যাচাই করে ঢুকুন" }).click();
await page.getByRole("button", { name: /নতুন ক্লাব তৈরি/ }).click();
ok(
  (await page.inputValue("#club-creator_phone")) === "9000000201" &&
    (await page.locator("#club-creator_phone").getAttribute("readonly")) !== null,
  "signed-in phone is prefilled and locked",
);
await page.fill("#club-name", "পরীক্ষা ক্লাব");
await page.fill("#club-para", "ব্লক এ");
await page.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
ok(
  await page.evaluate(() => document.activeElement?.id === "club-creator_name"),
  "missing name blocks save and focuses the field",
);
ok(await page.getByText("এই ঘরটি পূরণ করুন").isVisible(), "required error shown");
await page.screenshot({ path: `${OUT}/club-form.png`, fullPage: true });
await page.fill("#club-creator_name", "সম্পাদক ০১");
await page.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
await page.waitForURL(/home/);
await settle(page);
ok(true, "club created, landed on home");

await page.goto(BASE + "/collect");
await settle(page);
await page.getByRole("button", { name: /নতুন বাড়ি যোগ করুন/ }).click();
await page.fill("#collect-resident_name", "আবাসিক ০১");
await page.fill("#collect-house_no", "1");
await page.getByRole("button", { name: /৫০১/ }).first().click();
const collectorOpt = await page
  .locator("#collect-collector option:checked")
  .innerText()
  .catch(() => "");
ok(collectorOpt.includes("সম্পাদক ০১"), `collector defaults to the creator (${collectorOpt})`);
await page.getByRole("button", { name: /জমা ও রসিদ তৈরি/ }).click();
const dlg = page.getByRole("dialog");
await dlg.waitFor();
ok(
  (await dlg.innerText()).includes("PK-2026-A01-0001"),
  "chanda saved in the new club with a receipt",
);
await dlg.getByRole("button", { name: "ঠিক আছে" }).click();

await page.goto(BASE + "/expenses?add=true");
await settle(page);
const approver = await page.locator("#expense-authorized_by_id option:checked").innerText();
ok(approver.includes("সম্পাদক ০১"), `approver defaults to the creator (${approver})`);
await page.fill("#expense-title", "প্রথম খরচ");
await page.fill("#expense-amount", "300");
await page.fill("#expense-paid_to", "বিক্রেতা ০১");
await page.getByRole("dialog").getByRole("button", { name: "সংরক্ষণ করুন" }).click();
await page.waitForURL((u) => !u.searchParams.has("add"));
ok(await page.getByText("প্রথম খরচ").isVisible(), "expense saved in the new club");
await page.context().close();

// ---- B: demo → create club from the header switcher ----
page = await fresh();
await page.goto(BASE + "/");
await settle(page);
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await settle(page);
await page
  .getByRole("button", { name: /নমুনা পূজা কমিটি/ })
  .first()
  .click();
await page.getByRole("button", { name: /নতুন ক্লাব তৈরি/ }).click();
ok(
  (await page.locator("#club-creator_phone").getAttribute("readonly")) === null,
  "demo user can type a phone",
);
await page.fill("#club-name", "দ্বিতীয় ক্লাব");
await page.fill("#club-creator_name", "অ্যাডমিন ০২");
await page.fill("#club-creator_phone", "12345");
await page.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
ok(await page.getByText(/সঠিক ১০ সংখ্যার মোবাইল নম্বর দিন/).isVisible(), "invalid phone rejected");
await page.fill("#club-creator_phone", "+91 90000 00301");
ok((await page.inputValue("#club-creator_phone")) === "9000000301", "pasted +91 number normalised");
await page.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
await page.getByRole("dialog").waitFor({ state: "detached" });
const sess = await page.evaluate(() => JSON.parse(localStorage.getItem("pk_session_v1")));
ok(sess.mode === "user" && sess.phone === "9000000301", "session switches to the creator");
await page.goto(BASE + "/admin");
await settle(page);
ok(
  await page.getByText("অ্যাডমিন ০২").first().isVisible(),
  "creator listed as a member in Club & Roles",
);
await page.screenshot({ path: `${OUT}/club-admin.png`, fullPage: true });

ok(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
