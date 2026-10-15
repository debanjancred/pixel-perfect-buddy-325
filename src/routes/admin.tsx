import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, LogOut, Moon, RotateCcw, Globe, UserPlus, Eye, Hash } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { session, useChandas, useExpenses, useInvalidateAll, useMembers } from "@/hooks/use-data";
import { api } from "@/services/api";
import type { Role } from "@/services/types";
import { AppShell } from "@/components/pk/AppShell";
import { Label, LangToggle } from "@/components/pk/ui";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Club & Roles — Pujo Khata" },
      { name: "description", content: "Manage committee roles, export accounts to Excel and set preferences." },
      { property: "og:title", content: "Club & Roles — Pujo Khata" },
      { property: "og:description", content: "Committee roles, data export and settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const ROLES: Role[] = ["secretary", "treasurer", "collector"];

function csv(name: string, rows: (string | number)[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function AdminPage() {
  const { t, pick, dark, setDark, bnDigits, setBnDigits } = useI18n();
  const navigate = useNavigate();
  const invalidate = useInvalidateAll();
  const { data: members = [] } = useMembers();
  const { data: chandas = [] } = useChandas();
  const { data: expenses = [] } = useExpenses();
  const [nm, setNm] = useState({ name: "", phone: "", role: "collector" as Role });

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("adminTitle")}</h1>

      <section className="mt-4 rounded-3xl border bg-card p-4 shadow-card">
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">{m.name.slice(0, 1)}</div>
              <div className="min-w-0 flex-1 font-semibold">{pick(m.name, m.name_en)}</div>
              <select className="field w-auto min-w-0 text-sm" value={m.role} onChange={async (e) => { await api.updateMemberRole(m.id, e.target.value as Role); invalidate(); }}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2 border-t pt-3">
          <Label>{t("addMember")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <input className="field" placeholder={t("name")} value={nm.name} onChange={(e) => setNm({ ...nm, name: e.target.value })} />
            <input className="field" inputMode="numeric" maxLength={10} placeholder={t("phone")} value={nm.phone} onChange={(e) => setNm({ ...nm, phone: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => <button key={r} className="chip px-2 text-xs" data-active={nm.role === r} onClick={() => setNm({ ...nm, role: r })}>{t(`role_${r}`)}</button>)}
          </div>
          <button className="btn btn-gold w-full" disabled={!nm.name.trim()} onClick={async () => { await api.createMember({ ...nm, name: nm.name.trim() }); setNm({ name: "", phone: "", role: "collector" }); invalidate(); }}>
            <UserPlus className="h-5 w-5" /> {t("addMember")}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-4 shadow-card">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><FileSpreadsheet className="h-5 w-5 text-success" /> {t("export")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-outline" onClick={() => csv("chanda.csv", [["receipt_no", "payer_name", "amount", "payment_mode", "collector", "created_at"], ...chandas.map((c) => [c.receipt_no, c.payer_name, c.amount, c.payment_mode, memberName(c.collector_id), c.created_at])])}>{t("exportChanda")}</button>
          <button className="btn btn-outline" onClick={() => csv("expenses.csv", [["category", "item_name", "amount", "approved_by", "created_at"], ...expenses.map((e) => [e.category, e.item_name, e.amount, memberName(e.approved_by_id), e.created_at])])}>{t("exportExpense")}</button>
        </div>
        <Link to="/audit" className="btn btn-gold mt-2 w-full"><Eye className="h-5 w-5" /> {t("publicAudit")}</Link>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-4 shadow-card">
        <h2 className="mb-2 font-bold">{t("preferences")}</h2>
        <Row icon={<Globe className="h-5 w-5" />} label={t("language")}><LangToggle /></Row>
        <Row icon={<Hash className="h-5 w-5" />} label={t("bnDigits")}><Switch on={bnDigits} set={setBnDigits} /></Row>
        <Row icon={<Moon className="h-5 w-5" />} label={t("darkMode")}><Switch on={dark} set={setDark} /></Row>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn btn-outline" onClick={async () => { await api.resetDemo(); await invalidate(); toast(t("refreshed")); }}><RotateCcw className="h-5 w-5" /> {t("resetDemo")}</button>
        <button className="btn btn-outline text-destructive" onClick={() => { session.clear(); navigate({ to: "/" }); }}><LogOut className="h-5 w-5" /> {t("logout")}</button>
      </section>
      <div className="h-6" />
    </AppShell>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b py-2 last:border-0">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 font-semibold">{label}</span>
      {children}
    </div>
  );
}

function Switch({ on, set }: { on: boolean; set: (b: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => set(!on)} className="tap flex items-center justify-center">
      <span className={`relative h-8 w-14 rounded-full transition ${on ? "bg-primary" : "bg-input"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-card shadow transition-all ${on ? "left-7" : "left-1"}`} />
      </span>
    </button>
  );
}
