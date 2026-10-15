import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Camera, ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/categories";
import { useExpenses, useInvalidateAll, useMembers } from "@/hooks/use-data";
import { api } from "@/services/api";
import type { ExpenseCategory } from "@/services/types";
import { AppShell } from "@/components/pk/AppShell";
import { Label, Modal, SyncBadge } from "@/components/pk/ui";

export const Route = createFileRoute("/expenses")({
  validateSearch: z.object({ add: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Expense Ledger — Pujo Khata" },
      { name: "description", content: "Category-wise puja expenses — pandal, idol, lighting, bhog — with receipt photos." },
      { property: "og:title", content: "Expense Ledger — Pujo Khata" },
      { property: "og:description", content: "Every puja expense with approvals and receipt photos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { t, money, pick, ago } = useI18n();
  const { add } = Route.useSearch();
  const navigate = useNavigate();
  const { data: expenses = [] } = useExpenses();
  const { data: members = [] } = useMembers();
  const [cat, setCat] = useState<ExpenseCategory | "all">("all");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (add) { setOpen(true); navigate({ to: "/expenses", search: {}, replace: true }); }
  }, [add, navigate]);

  const list = useMemo(() => expenses.filter((e) => cat === "all" || e.category === cat), [expenses, cat]);
  const total = list.reduce((s, e) => s + e.amount, 0);

  return (
    <AppShell
      fab={
        <button onClick={() => setOpen(true)} className="btn btn-primary shadow-fab fixed bottom-24 right-4 z-40 h-16 rounded-full px-6">
          <Plus className="h-6 w-6" /> {t("addExpense")}
        </button>
      }
    >
      <h1 className="text-2xl font-extrabold">{t("expenseLedger")}</h1>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        <button className="chip" data-active={cat === "all"} onClick={() => setCat("all")}>{t("all")}</button>
        {CATEGORIES.map((c) => (
          <button key={c.key} className="chip" data-active={cat === c.key} onClick={() => setCat(c.key)}>{c.emoji} {t(c.t)}</button>
        ))}
      </div>
      <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-primary-soft p-4">
        <span className="font-semibold text-primary">{t("spent")}</span>
        <span className="num text-2xl font-extrabold text-primary">{money(total)}</span>
      </div>

      <ul className="mt-4 space-y-2">
        {list.map((e) => {
          const c = CATEGORIES.find((x) => x.key === e.category)!;
          const m = members.find((x) => x.id === e.approved_by_id);
          return (
            <li key={e.id} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-card">
              <button
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-2xl"
                onClick={() => e.receipt_image && setPreview(e.receipt_image)}
                aria-label={t("receiptPhoto")}
              >
                {e.receipt_image ? <img src={e.receipt_image} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-snug">{pick(e.item_name, e.item_name_en)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{c.emoji} {t(c.t)} · {t("approvedBy")}: {m ? pick(m.name, m.name_en) : "—"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{ago(e.created_at)}</span>
                  <SyncBadge status={e.sync_status} />
                </div>
              </div>
              <div className="num font-extrabold text-primary">{money(e.amount)}</div>
            </li>
          );
        })}
      </ul>
      <div className="h-16" />

      <AddExpense open={open} onClose={() => setOpen(false)} defaultCat={cat === "all" ? "pandal" : cat} />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={t("receiptPhoto")}>
        {preview && <img src={preview} alt="" className="w-full rounded-2xl" />}
      </Modal>
    </AppShell>
  );
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = url; });
  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = img.width * scale;
  c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.7);
}

function AddExpense({ open, onClose, defaultCat }: { open: boolean; onClose: () => void; defaultCat: ExpenseCategory }) {
  const { t, pick, money } = useI18n();
  const { data: members = [] } = useMembers();
  const invalidate = useInvalidateAll();
  const [cat, setCat] = useState<ExpenseCategory>(defaultCat);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [by, setBy] = useState("");
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => { if (open) setCat(defaultCat); }, [open, defaultCat]);
  useEffect(() => { if (!by && members[0]) setBy(members[0].id); }, [members, by]);

  const ok = name.trim() && Number(amount) > 0 && by;
  const save = async () => {
    if (!ok) return;
    const e = await api.createExpense({ category: cat, item_name: name.trim(), amount: Number(amount), approved_by_id: by, receipt_image: img });
    await invalidate();
    toast.success(e.sync_status === "pending" ? t("offlineSaved") : `${money(e.amount)} ✓`);
    setName(""); setAmount(""); setImg(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("addExpense")}>
      <div className="space-y-4">
        <div>
          <Label>{t("category")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button key={c.key} className="chip px-2 text-sm" data-active={cat === c.key} onClick={() => setCat(c.key)}>{c.emoji} {t(c.t)}</button>
            ))}
          </div>
        </div>
        <div><Label>{t("itemName")}</Label><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>{t("amount")}</Label><input className="field num text-xl font-bold" inputMode="numeric" placeholder="₹" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></div>
        <div>
          <Label>{t("approvedBy")}</Label>
          <select className="field" value={by} onChange={(e) => setBy(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{pick(m.name, m.name_en)}</option>)}
          </select>
        </div>
        <div>
          <Label>{t("receiptPhoto")}</Label>
          <label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input bg-muted p-3 font-semibold text-muted-foreground">
            {img ? <img src={img} alt="" className="h-20 rounded-lg" /> : <><Camera className="h-6 w-6" /> {t("takePhoto")}</>}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await shrink(f)); }} />
          </label>
        </div>
        <button className="btn btn-primary w-full text-lg" disabled={!ok} onClick={save}>{t("save")}</button>
      </div>
    </Modal>
  );
}
