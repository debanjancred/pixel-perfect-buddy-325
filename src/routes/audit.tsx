import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { BadgeCheck, Download, Share2, ArrowLeft } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/categories";
import { useExpenses, useSummary } from "@/hooks/use-data";
import { AlponaStrip, LangToggle, shareOrWhatsApp } from "@/components/pk/ui";
import { indian, toBnDigits } from "@/lib/format";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Public Audit — Pujo Khata" },
      { name: "description", content: "Read-only, verified public account of this Durga Puja's collections and expenses." },
      { property: "og:title", content: "সর্বজনীন স্বচ্ছ হিসাব — Pujo Khata" },
      { property: "og:description", content: "See exactly how your para's puja chanda was spent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { t, money, pick, n } = useI18n();
  const { data: s } = useSummary();
  const { data: expenses = [] } = useExpenses();

  const byCat = useMemo(
    () => CATEGORIES.map((c) => ({ ...c, value: expenses.filter((e) => e.category === c.key).reduce((a, e) => a + e.amount, 0) })).filter((c) => c.value > 0),
    [expenses],
  );
  const max = s ? Math.max(s.collected, s.spent, 1) : 1;

  const shareText = s
    ? `📢 ${s.club.name}\nআদায়: ₹${toBnDigits(indian(s.collected))}\nখরচ: ₹${toBnDigits(indian(s.spent))}\nহাতে জমা: ₹${toBnDigits(indian(s.balance))}\nস্বচ্ছ হিসাব দেখুন:`
    : "";

  const downloadCard = async () => {
    if (!s) return;
    await document.fonts.ready;
    const W = 1080, H = 1920;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const col = (v: string) => { const el = document.createElement("div"); el.style.color = css.getPropertyValue(v); document.body.appendChild(el); const r = getComputedStyle(el).color; el.remove(); return r; };
    const primary = col("--primary"), deep = col("--primary-deep"), gold = col("--gold"), light = col("--primary-foreground");
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, primary); grad.addColorStop(1, deep);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = gold; g.lineWidth = 6; g.strokeRect(50, 50, W - 100, H - 100);
    g.fillStyle = gold; g.textAlign = "center";
    g.font = "700 48px 'Hind Siliguri'"; g.fillText("✦ স্বচ্ছ খাতা · Verified ✦", W / 2, 220);
    g.fillStyle = light; g.font = "700 64px 'Hind Siliguri'";
    const words = s.club.name.split(" "); let line = "", y = 380;
    for (const w of words) { if (g.measureText(line + w).width > 860) { g.fillText(line, W / 2, y); line = ""; y += 90; } line += w + " "; }
    g.fillText(line, W / 2, y);
    const rows: [string, number][] = [["আদায়", s.collected], ["খরচ", s.spent], ["হাতে জমা", s.balance]];
    rows.forEach(([k, v], i) => {
      const yy = 820 + i * 260;
      g.font = "500 48px 'Hind Siliguri'"; g.fillStyle = gold; g.fillText(k, W / 2, yy);
      g.font = "800 110px 'Hind Siliguri'"; g.fillStyle = light; g.fillText(`₹${toBnDigits(indian(v))}`, W / 2, yy + 120);
    });
    g.font = "600 44px 'Hind Siliguri'"; g.fillStyle = gold; g.fillText("পুজো খাতা · Pujo Khata", W / 2, H - 140);
    const a = document.createElement("a");
    a.download = "pujo-khata-hisab.png"; a.href = c.toDataURL("image/png"); a.click();
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-12">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <AlponaStrip />
        <div className="flex items-center gap-2 px-4 py-2">
          <Link to="/home" className="tap flex items-center justify-center rounded-full" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1 font-bold text-primary">{t("publicAudit")}</div>
          <LangToggle />
        </div>
      </header>

      <main className="space-y-5 px-4 pt-4">
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-success/40 bg-success-soft px-4 py-2 text-sm font-bold text-success">
            <BadgeCheck className="h-5 w-5" /> {t("verified")}
          </span>
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold leading-snug">{s ? pick(s.club.name, s.club.name_en) : "…"}</h1>
          <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
        </div>

        <section className="bg-hero rounded-3xl p-5 text-primary-foreground">
          <div className="grid grid-cols-3 gap-2 text-center">
            {s && ([["collected", s.collected], ["spent", s.spent], ["balance", s.balance]] as const).map(([k, v]) => (
              <div key={k}>
                <div className="text-xs opacity-85">{t(k)}</div>
                <div className="num text-lg font-extrabold">{money(v)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-card">
          <h2 className="font-bold">{t("collVsExp")}</h2>
          {s && ([["collected", s.collected, "bg-success"], ["spent", s.spent, "bg-primary"]] as const).map(([k, v, bg]) => (
            <div key={k} className="mt-3">
              <div className="mb-1 flex justify-between text-sm"><span>{t(k)}</span><span className="num font-bold">{money(v)}</span></div>
              <div className="h-4 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${bg}`} style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-card">
          <h2 className="font-bold">{t("byCategory")}</h2>
          <div className="h-64">
            {byCat.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCat.map((c) => ({ name: t(c.t), value: c.value, color: c.color }))} dataKey="value" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none">
                    {byCat.map((c) => <Cell key={c.key} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2">
            {byCat.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="flex-1">{t(c.t)}</span>
                <span className="num font-semibold">{s && s.spent ? n(String(Math.round((c.value / s.spent) * 100))) : 0}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button className="btn btn-gold" onClick={downloadCard}><Download className="h-5 w-5" /> {t("storyCard")}</button>
          <button className="btn btn-whatsapp" onClick={() => shareOrWhatsApp(shareText, window.location.origin + "/audit")}><Share2 className="h-5 w-5" /> {t("share")}</button>
        </section>
      </main>
    </div>
  );
}
