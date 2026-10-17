import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:5199";
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log(`${c ? "✔" : "✘"} ${m}`);
};
const b = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const page = await (await b.newContext({ viewport: { width: 360, height: 780 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE + "/");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await page.goto(BASE + "/chanda");
await page.waitForLoadState("networkidle");
const sel = page.getByRole("combobox", { name: "লেন / ব্লক" });
const opts = await sel.locator("option").allInnerTexts();
ok(opts.length === 5 && opts[0].startsWith("সব লেন"), `lane options: ${opts.join(" | ")}`);
await sel.selectOption({ index: 2 });
await page.waitForURL(/lane=/);
const groups = await page.locator("section h2").allInnerTexts();
ok(
  groups.length === 1 && groups[0].includes(opts[2].split(" (")[0]),
  `only the chosen lane is listed (${groups})`,
);
await page.getByRole("button", { name: /^বাকি/ }).click();
await page.waitForURL(/status=pending/);
await page.reload();
await page.waitForLoadState("networkidle");
ok(
  (await sel.inputValue()) !== "" &&
    (await page.getByRole("button", { name: /^বাকি/ }).getAttribute("aria-pressed")) === "true",
  "lane + status survive a refresh",
);
const h = await sel.evaluate((e) => e.getBoundingClientRect().height);
ok(h >= 48, `select is ${h}px tall`);
await page.goto(BASE + "/chanda?lane=nonexistent");
await page.waitForLoadState("networkidle");
ok((await page.locator("section h2").count()) === 4, "unknown lane falls back to all lanes");
ok(errors.length === 0, `no page errors ${errors}`);
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);
