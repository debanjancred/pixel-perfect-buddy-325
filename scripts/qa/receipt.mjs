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
// Headless Chrome reports Web Share support but never settles the sheet. Stub it: record
// what would be shared, and let tests switch it off to exercise the download fallback.
await ctx.addInitScript(() => {
  window.__shared = [];
  const real = { share: navigator.share, canShare: navigator.canShare };
  Object.defineProperty(navigator, "share", {
    configurable: true,
    get: () =>
      window.__noShare
        ? undefined
        : async (d) => {
            window.__shared.push({
              text: d.text,
              files: (d.files || []).map((f) => [f.name, f.type, f.size]),
            });
          },
  });
  Object.defineProperty(navigator, "canShare", {
    configurable: true,
    get: () => (window.__noShare ? undefined : () => true),
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
const db = await page.evaluate(() => JSON.parse(localStorage.getItem("pk_db_v2")));
const hh = db.households.find((h) => h.phone_number);

await go(`/collect?household=${hh.id}`);
await page
  .getByRole("button", { name: "১,০০১", exact: false })
  .first()
  .click()
  .catch(() => {});
// type an exact amount via "other" if 1001 preset is missing
const amounts = await page.locator("button").allInnerTexts();
if (!amounts.some((t) => t.includes("১,০০১"))) {
  await page.getByRole("button", { name: "অন্য" }).click();
  await page.locator("input[inputmode=numeric]").last().fill("1001");
}
await page.getByRole("button", { name: /জমা ও রসিদ তৈরি/ }).click();
const dialog = page.getByRole("dialog");
await dialog.waitFor();
const dtext = await dialog.innerText();
ok(dtext.includes("এক হাজার এক টাকা মাত্র"), "modal shows amount in Bengali words");
ok(dtext.includes(hh.resident_name), "modal shows donor");
const wa = await dialog.getByRole("link", { name: /হোয়াটসঅ্যাপ/ }).getAttribute("href");
const waText = decodeURIComponent(wa.split("text=")[1]);
ok(wa.startsWith(`https://wa.me/91${hh.phone_number}?text=`), "WhatsApp link targets donor phone");
ok(
  !/https?:\/\//.test(waText) && waText.includes("এক হাজার এক টাকা মাত্র"),
  "share text is self-contained with words",
);
const small = await dialog
  .locator("button, a")
  .evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height < 48).map((e) => e.textContent),
  );
ok(small.length === 0, `all modal targets ≥48px ${small.join("|")}`);
await page.screenshot({ path: `${OUT}/modal-bn.png`, fullPage: true });

await dialog.getByRole("button", { name: /ছবি/ }).click();
await page.waitForFunction(() => window.__shared.length > 0);
const shared = await page.evaluate(() => window.__shared[0]);
ok(
  shared.files.length === 1 && shared.files[0][1] === "image/png" && shared.files[0][2] > 20000,
  `image shared as PNG file ${JSON.stringify(shared.files)}`,
);
ok(
  await dialog.getByRole("button", { name: /শেয়ার করুন/ }).isVisible(),
  "native share button shown where supported",
);
await page.evaluate(() => {
  window.__noShare = true;
});
const dl = page.waitForEvent("download");
await dialog.getByRole("button", { name: /ছবি/ }).click();
const d = await dl;
ok(
  /^PK-\d{4}-[A-Z0-9]+-\d{4}\.png$/.test(d.suggestedFilename()),
  `image download ${d.suggestedFilename()}`,
);
await d.saveAs(`${OUT}/receipt-bn.png`);

await page.emulateMedia({ media: "print" });
const printVis = await page.evaluate(() => ({
  portal: getComputedStyle(document.querySelector(".print-portal")).display,
  app: [...document.body.children]
    .filter((e) => !e.classList.contains("print-portal") && e.tagName !== "SCRIPT")
    .every((e) => getComputedStyle(e).display === "none"),
  text: document.querySelector(".print-portal").innerText,
}));
ok(
  printVis.portal === "block" && printVis.app && printVis.text.includes("এক হাজার এক"),
  "print shows only the receipt",
);
await page.pdf?.({ path: `${OUT}/print.pdf` }).catch(() => {});
await page.emulateMedia({ media: "screen" });
const txId = db.chanda ? null : null;
await dialog.getByRole("button", { name: "ঠিক আছে" }).click();
ok(!(await page.getByRole("dialog").count()), "done closes the modal");

await go("/home");
await page.locator('a[href^="/receipt/"]').first().click();
await page.waitForURL(/\/receipt\//);
await page.waitForLoadState("networkidle");
ok(
  (await page.getByRole("article").innerText()).includes("এক হাজার এক টাকা মাত্র"),
  "home activity opens the saved receipt",
);
await page.getByRole("button", { name: "ফিরে যান" }).click();
await page.waitForURL(/home/);
ok(true, "back returns to home");

await go("/chanda");
const rLinks = page.getByRole("link", { name: "রসিদ" });
ok((await rLinks.count()) > 0, "register shows receipt buttons");
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
ok(!overflow, "register has no horizontal overflow at 360px");
await page.screenshot({ path: `${OUT}/register.png` });
await rLinks.first().click();
await page.waitForURL(/\/receipt\//);
await page.waitForLoadState("networkidle");
ok(
  await page
    .getByRole("article")
    .waitFor()
    .then(
      () => true,
      () => false,
    ),
  "register receipt opens",
);

// English
await page.getByRole("button", { name: "EN" }).click();
const en = await page.getByRole("article").innerText();
ok(/Rupees .* Only/.test(en) && en.includes("Paid via"), "receipt switches to English");
await page.screenshot({ path: `${OUT}/receipt-page-en.png`, fullPage: true });
await page.evaluate(() => {
  window.__noShare = true;
});
const dl2 = page.waitForEvent("download");
await page.getByRole("button", { name: /Image/ }).click();
await (await dl2).saveAs(`${OUT}/receipt-en.png`);
ok(true, "English image downloaded");

await go("/receipt/00000000-0000-4000-8000-000000000000");
ok(
  await page.getByText(/Receipt not found|রসিদটি পাওয়া যায়নি/).isVisible(),
  "unknown id shows not-found state",
);

ok(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
