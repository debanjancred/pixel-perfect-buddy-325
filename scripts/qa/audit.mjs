import { createRequire } from "node:module";
import { demoAsAdmin } from "./helpers.mjs";
// QA audit: every screen × {bn,en} × {light,dark} at 360px — axe (WCAG 2.1 AA),
// touch targets < 48px, horizontal overflow, and untranslated English in Bengali mode.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:5199";
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
const page = await ctx.newPage();
const go = async (p) => {
  await page.goto(BASE + p);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
};

await go("/");
await page.getByRole("button", { name: "নমুনা ক্লাব দেখুন" }).click();
await page.waitForURL(/home/);
await page.waitForLoadState("networkidle");
await demoAsAdmin(page);
const db = await page.evaluate(() => JSON.parse(localStorage.getItem("pk_db_v2")));
const tx = db.chanda.find((c) => c.status === "collected" && !c.voided_at);
const exp = db.expenses.find((e) => !e.voided_at);
const slug = db.clubs[0].slug;

const SCREENS = [
  ["home", "/home"],
  ["chanda", "/chanda"],
  ["collect", "/collect"],
  ["receipt", `/receipt/${tx.id}`],
  ["expenses", "/expenses"],
  ["expense-detail", `/expenses?expense=${exp.id}`],
  ["expense-add", "/expenses?add=true"],
  ["events", "/events"],
  ["event-add", "/events?add=true"],
  ["accounts", `/club/${slug}/accounts`],
  ["settings", "/settings"],
  ["cash", "/cash"],
  ["not-found", "/nope"],
];
const report = [];
for (const lang of ["bn", "en"])
  for (const dark of [false, true]) {
    await page.evaluate(
      ([lang, dark]) => {
        localStorage.setItem("app_locale", lang);
        localStorage.setItem("pk_prefs_v1", JSON.stringify({ bnDigits: true, dark }));
      },
      [lang, dark],
    );
    for (const [name, path] of SCREENS) {
      await go(path);
      await page.addScriptTag({ content: AXE });
      const axe = await page.evaluate(async () => {
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        });
        return r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          n: v.nodes.length,
          targets: v.nodes
            .slice(0, 3)
            .map(
              (x) =>
                x.target.join(" ") +
                (x.any[0]?.message ? ` — ${x.any[0].message.slice(0, 110)}` : ""),
            ),
        }));
      });
      const small = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            "button, a[href], select, input:not([type=hidden]):not(.sr-only), [role=switch], textarea",
          ),
        ]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const s = getComputedStyle(e);
            return r.width > 0 && s.visibility !== "hidden" && (r.height < 48 || r.width < 44);
          })
          .map(
            (e) =>
              `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || e.id).trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`,
          ),
      );
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      let english = [];
      if (lang === "bn")
        english = await page.evaluate(() => {
          const ok =
            /^(PK-[\w-]+|UPI|CSV|OTP|Excel|Pujo Khata|PK|A0\d|T0\d|C0\d|[\d\s₹%,.:+−\-—·/()]+|EN|Sample Puja Committee 2026)$/;
          const out = new Set();
          const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walk.nextNode()) {
            const t = walk.currentNode.textContent.trim();
            const el = walk.currentNode.parentElement;
            if (!t || el.closest("script,style,.print-portal,[aria-hidden=true]")) continue;
            if (/[A-Za-z]{3,}/.test(t) && !ok.test(t) && !/[ঀ-৿]/.test(t)) out.add(t.slice(0, 40));
          }
          return [...out];
        });
      report.push({ screen: name, lang, dark, axe, small, overflow, english });
    }
  }
// Outsider view (view-only banner) in all modes.
for (const lang of ["bn", "en"])
  for (const dark of [false, true]) {
    await page.evaluate(
      ([lang, dark]) => {
        localStorage.setItem("app_locale", lang);
        localStorage.setItem("pk_prefs_v1", JSON.stringify({ bnDigits: true, dark }));
        localStorage.setItem(
          "pk_session_v1",
          JSON.stringify({ mode: "user", phone: "9000000556" }),
        );
      },
      [lang, dark],
    );
    await go("/home");
    await page.addScriptTag({ content: AXE });
    const axe = await page.evaluate(async () =>
      (
        await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })
      ).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        n: v.nodes.length,
        targets: v.nodes.slice(0, 2).map((x) => x.target.join(" ")),
      })),
    );
    report.push({
      screen: "outsider-home",
      lang,
      dark,
      axe,
      small: [],
      overflow: false,
      english: [],
    });
  }
await browser.close();
// Collapse identical findings across modes.
const key = (o) => JSON.stringify(o);
const byIssue = new Map();
for (const r of report) {
  for (const v of r.axe) {
    const k = key(["axe", r.screen, v.id]);
    const e = byIssue.get(k) ?? { ...v, screen: r.screen, modes: [] };
    e.modes.push(`${r.lang}${r.dark ? "-dark" : ""}`);
    byIssue.set(k, e);
  }
  for (const s of r.small) {
    const k = key(["small", r.screen, s]);
    const e = byIssue.get(k) ?? { id: "target<48", screen: r.screen, targets: [s], modes: [] };
    e.modes.push(`${r.lang}${r.dark ? "-dark" : ""}`);
    byIssue.set(k, e);
  }
  if (r.overflow) {
    const k = key(["overflow", r.screen]);
    const e = byIssue.get(k) ?? { id: "overflow", screen: r.screen, modes: [] };
    e.modes.push(`${r.lang}${r.dark ? "-dark" : ""}`);
    byIssue.set(k, e);
  }
  for (const t of r.english) {
    const k = key(["english", r.screen, t]);
    const e = byIssue.get(k) ?? { id: "english-in-bn", screen: r.screen, targets: [t], modes: [] };
    e.modes.push(`bn${r.dark ? "-dark" : ""}`);
    byIssue.set(k, e);
  }
}
for (const e of byIssue.values())
  console.log(
    `[${e.id}] ${e.screen} (${e.modes.join(",")})${e.impact ? " " + e.impact : ""}${e.n ? " ×" + e.n : ""}\n   ${(e.targets ?? []).join("\n   ")}`,
  );
console.log(`\nscreens×modes: ${report.length}, distinct issues: ${byIssue.size}`);
