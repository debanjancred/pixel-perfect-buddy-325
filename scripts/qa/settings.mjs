import { demoAsAdmin } from "./helpers.mjs";
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
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

await go("/admin");
await page.waitForURL(/\/settings$/);
ok(true, "/admin forwards to /settings");
await page.getByRole("heading", { name: "সেটিংস" }).waitFor();
ok(
  (await page.getByRole("link", { name: "ক্লাব" }).getAttribute("href")) === "/settings",
  "bottom nav points to /settings",
);
const groups = await page.locator("#set-members ~ div h3").allInnerTexts();
ok(
  JSON.stringify(groups) === JSON.stringify(["অ্যাডমিন", "কোষাধ্যক্ষ", "সংগ্রাহক"]),
  `grouped by role ${groups}`,
);

// Last admin can't be demoted.
const adminSel = page.getByRole("combobox", { name: /দায়িত্ব: অ্যাডমিন ০১/ });
await adminSel.selectOption("collector");
ok(
  await page
    .getByText("ক্লাবে অন্তত একজন অ্যাডমিন থাকতে হবে")
    .waitFor()
    .then(
      () => true,
      () => false,
    ),
  "last admin protected (toast)",
);
await page.waitForTimeout(400);
ok((await adminSel.inputValue()) === "admin", "select snaps back to admin");

// Add member: validation, duplicate phone, success.
await page.getByRole("button", { name: /সদস্য যোগ করুন/ }).click();
ok(
  await page.evaluate(() => document.activeElement?.id === "member-name"),
  "empty form focuses name",
);
await page.fill("#member-name", "কর্মী ০২");
await page.fill("#member-phone", "9000000003");
await page.getByRole("button", { name: /সদস্য যোগ করুন/ }).click();
ok(
  await page
    .getByText("এই নম্বরে আগে থেকেই একজন সদস্য আছেন")
    .waitFor()
    .then(
      () => true,
      () => false,
    ),
  "duplicate phone rejected inline",
);
await page.fill("#member-phone", "9000000004");
await page.getByRole("button", { name: "কোষাধ্যক্ষ" }).click();
await page.getByRole("button", { name: /সদস্য যোগ করুন/ }).click();
await page.getByText("সদস্য যোগ হয়েছে").waitFor();
const treasurers = await page.locator("#set-members ~ div").nth(1).innerText();
ok(treasurers.includes("কর্মী ০২"), "new member listed under কোষাধ্যক্ষ");

// CSV exports.
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "চাঁদা CSV" }).click();
const d = await dl;
const p1 = `${OUT}/chanda.csv`;
await d.saveAs(p1);
const csv = readFileSync(p1, "utf8");
ok(
  d.suggestedFilename().startsWith("pujo-khata-chanda-sample-puja-committee-2026-"),
  `file name ${d.suggestedFilename()}`,
);
ok(
  csv.charCodeAt(0) === 0xfeff && csv.includes('"রসিদ নং"') && /,1001,|,\d+,"নগদ"/.test(csv),
  "BOM, Bengali headers, ASCII amounts",
);
const dl2 = page.waitForEvent("download");
await page.getByRole("button", { name: "খরচ CSV" }).click();
await (await dl2).saveAs(`${OUT}/expenses.csv`);
ok(
  readFileSync(`${OUT}/expenses.csv`, "utf8").includes('"প্যান্ডেল"'),
  "expense CSV has localised categories",
);

// Preferences: labelled switches.
const sw = page.getByRole("switch", { name: "ডার্ক মোড" });
await sw.click();
ok(
  (await page.evaluate(() => document.documentElement.classList.contains("dark"))) &&
    (await sw.getAttribute("aria-checked")) === "true",
  "dark mode switch works and is labelled",
);
await sw.click();

// Version + reset/logout confirmations.
ok(await page.getByText(/সংস্করণ/).isVisible(), "app version shown");
await page.getByRole("button", { name: /ডেমো রিসেট/ }).click();
const dlg = page.getByRole("dialog");
ok((await dlg.innerText()).includes("চালিয়ে যাবেন"), "reset asks first");
await dlg.getByRole("button", { name: "না, থাক" }).click();
ok(
  (await page.locator("#set-members ~ div").nth(1).innerText()).includes("কর্মী ০২"),
  "cancel keeps data",
);
await page.getByRole("button", { name: /ডেমো রিসেট/ }).click();
await dlg.getByRole("button", { name: "হ্যাঁ, চালিয়ে যান" }).click();
await page.getByText("হালনাগাদ হয়েছে").waitFor();
await page.waitForTimeout(400);
ok(!(await page.getByText("কর্মী ০২").count()), "confirmed reset restores the sample data");
const small = await page
  .locator("main button, main a, main select")
  .evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height < 48).map((e) => e.textContent),
  );
ok(small.length === 0, `targets ≥48px ${small}`);
ok(
  !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
  "no horizontal overflow",
);
await page.screenshot({ path: `${OUT}/m7-settings.png`, fullPage: true });

await page.getByRole("button", { name: /লগ আউট/ }).click();
await dlg.getByRole("button", { name: "লগ আউট" }).click();
await page.waitForURL(BASE + "/");
ok(true, "confirmed logout returns to login");

ok(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
