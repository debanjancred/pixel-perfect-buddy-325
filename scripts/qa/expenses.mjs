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
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const go = async (p) => {
  await page.goto(BASE + p);
  await page.waitForLoadState("networkidle");
};
const url = () => new URL(page.url());

await go("/");
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await page.waitForLoadState("networkidle");
await demoAsAdmin(page);

await go("/expenses");
await page.getByRole("button", { name: /খরচ লিখুন/ }).waitFor();
const chips = page.getByRole("group", { name: "বিভাগ" }).getByRole("button");
const chipH = await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
ok(chipH.length === 7 && chipH.every((h) => h >= 48), `7 filter chips, all ≥48px (${chipH})`);
const summary = page.locator("section").filter({ hasText: "এন্ট্রি" }).first();
ok((await summary.getByRole("button").count()) >= 2, "summary lists per-category subtotals");
ok(
  !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)),
  "no horizontal overflow",
);
await page.screenshot({ path: `${OUT}/m4-ledger.png` });

// Subtotal row filters the list via the URL.
const firstCat = summary.getByRole("button").first();
const catText = (await firstCat.innerText()).split("\n")[0];
await firstCat.click();
await page.waitForURL(/category=/);
ok(
  (await chips.filter({ hasText: catText }).getAttribute("aria-pressed")) === "true",
  `subtotal row filters to ${catText}`,
);
await chips.first().click();
await page.waitForURL((u) => !u.searchParams.has("category"));
ok(true, "All chip clears the filter");

// Row → details sheet, back button closes it.
const rows = page.locator("ul.space-y-2 > li > button");
await rows.first().click();
await page.waitForURL(/expense=/);
const dlg = page.getByRole("dialog");
ok((await dlg.innerText()).includes("অনুমোদন"), "row opens details with approver");
await page.goBack();
await page.waitForURL((u) => !u.searchParams.has("expense"));
ok(!(await dlg.count()), "phone back closes the details sheet");

// Add expense: validation.
await page.getByRole("button", { name: /খরচ লিখুন/ }).click();
await page.waitForURL(/add=true/);
await dlg.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
ok(
  await page.evaluate(() => document.activeElement?.id === "expense-title"),
  "empty submit focuses the first invalid field",
);
ok((await dlg.getByRole("alert").count()) >= 3, "inline errors shown");
await page.fill("#expense-title", "পরীক্ষা খরচ");
await page.fill("#expense-amount", "1250");
await page.fill("#expense-paid_to", "বিক্রেতা ০১");
await page.fill("#expense-date", "2099-01-01");
await dlg.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
ok(await dlg.getByText("ভবিষ্যতের তারিখ দেওয়া যাবে না").isVisible(), "future date rejected");
const today = await page.evaluate(() => new Date().toLocaleDateString("en-CA"));
await page.fill("#expense-date", today);
ok((await page.inputValue("#expense-authorized_by_id")) !== "", "approver preselected");

// Photo: wrong type, then a real 4000×3000 photo.
const file = dlg.locator("input[type=file]");
await file.setInputFiles({
  name: "bill.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4"),
});
ok(
  await dlg
    .getByText("শুধু ছবি (JPG, PNG) দেওয়া যাবে")
    .waitFor()
    .then(
      () => true,
      () => false,
    ),
  "non-image rejected with message",
);
const b64 = await page.evaluate(async () => {
  const c = Object.assign(document.createElement("canvas"), { width: 4000, height: 3000 });
  const g = c.getContext("2d");
  for (let i = 0; i < 4000; i += 20) {
    g.fillStyle = `hsl(${i % 360},70%,${30 + (i % 50)}%)`;
    g.fillRect(i, 0, 20, 3000);
  }
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(${i % 255},${(i * 7) % 255},${(i * 13) % 255},.6)`;
    g.fillRect((i * 97) % 4000, (i * 61) % 3000, 30, 30);
  }
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95));
  const data = await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result.split(",")[1]);
    fr.readAsDataURL(blob);
  });
  return { size: blob.size, data };
});
await file.setInputFiles({
  name: "bill.jpg",
  mimeType: "image/jpeg",
  buffer: Buffer.from(b64.data, "base64"),
});
await dlg.getByRole("button", { name: "ছবি সরান" }).waitFor();
ok(!(await dlg.getByText("শুধু ছবি").count()), "valid photo clears the error and shows preview");
await page.screenshot({ path: `${OUT}/m4-form.png`, fullPage: true });
await dlg.getByRole("button", { name: "সংরক্ষণ করুন" }).click();
await page.waitForURL((u) => !u.searchParams.has("add"));
ok(!(await dlg.count()), "save closes the sheet");

const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("pk_db_v2")).expenses.find((e) => e.title === "পরীক্ষা খরচ"),
);
ok(saved && saved.amount === 1250 && saved.voucher_image_id, "expense saved with a voucher id");
const img = await page.evaluate(
  (id) =>
    new Promise((res) => {
      const r = indexedDB.open("pujo_khata", 1);
      r.onsuccess = () => {
        const q = r.result.transaction("vouchers").objectStore("vouchers").get(id);
        q.onsuccess = async () => {
          const b = q.result;
          const bm = await createImageBitmap(b);
          res({ size: b.size, type: b.type, w: bm.width, h: bm.height });
        };
      };
    }),
  saved.voucher_image_id,
);
ok(
  img.type === "image/jpeg" && img.size <= 400_000 && Math.max(img.w, img.h) <= 1600,
  `photo compressed ${Math.round(b64.size / 1024)}KB 4000×3000 → ${Math.round(img.size / 1024)}KB ${img.w}×${img.h}`,
);

// Open it, view the photo full screen, back out step by step.
await page.locator("li > button").filter({ hasText: "পরীক্ষা খরচ" }).click();
await page.waitForURL(/expense=/);
ok(
  (await dlg.innerText()).includes("এক হাজার দুই শত পঞ্চাশ টাকা মাত্র"),
  "details show amount in words",
);
await dlg.getByRole("button", { name: /ভাউচারের ছবি দেখুন/ }).click();
await page.waitForURL(/photo=true/);
const viewer = page.getByRole("dialog", { name: "রসিদ / ভাউচারের ছবি" });
const box = await viewer.locator("img").boundingBox();
ok(box && box.width >= 359, `full-screen photo (${box && Math.round(box.width)}px wide)`);
await page.waitForTimeout(500);
ok(
  await viewer.evaluate(
    (el) =>
      getComputedStyle(el).opacity === "1" &&
      getComputedStyle(el).backgroundColor === "rgb(0, 0, 0)",
  ),
  "viewer is opaque black once open",
);
await page.screenshot({ path: `${OUT}/m4-viewer.png` });
const closeBtn = viewer.getByRole("button", { name: "বন্ধ করুন" });
ok(
  await closeBtn.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return b.contains(top);
  }),
  "viewer close button is not covered",
);
await page.keyboard.press("Escape");
await page.waitForURL((u) => !u.searchParams.has("photo"));
ok(
  (await page.getByRole("dialog").innerText()).includes("পরীক্ষা খরচ"),
  "closing the photo returns to details",
);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/m4-detail.png` });

// Deep link: refresh keeps the sheet; closing strips the param in place.
const deep = page.url();
await go(deep.replace(BASE, ""));
await page.getByRole("dialog").waitFor();
ok(true, "deep link reopens the details after refresh");
await page.getByRole("button", { name: "ঠিক আছে" }).click();
await page.waitForURL((u) => !u.searchParams.has("expense"));
ok(url().pathname === "/expenses", "closing a deep-linked sheet stays on the ledger");

// Bad params don't crash.
await go("/expenses?category=nope&expense=not-a-uuid");
ok(
  await page.getByRole("heading", { name: "খরচের খাতা" }).isVisible(),
  "malformed search params are ignored",
);

await page.getByRole("button", { name: "EN" }).click();
ok(
  (await page.getByRole("heading", { name: "Expense Ledger" }).isVisible()) &&
    (await page
      .getByText(/entries/)
      .first()
      .isVisible()),
  "English labels",
);
ok(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
