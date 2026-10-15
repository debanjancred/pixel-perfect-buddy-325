import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/categories";
import {
  useAddExpense,
  useCurrentMember,
  useExpenses,
  useMembers,
  useVoucherImage,
} from "@/hooks/use-data";
import { isVoid } from "@/lib/accounts";
import { ValidationError, expenseSchema, fieldErrors, type ErrKey } from "@/lib/validation";
import type { ExpenseCategory, ExpenseRecord } from "@/types/domain";
import { AppShell } from "@/components/pk/AppShell";
import { FieldError, Label, Modal, SyncBadge, TextField } from "@/components/pk/ui";

export const Route = createFileRoute("/expenses")({
  validateSearch: z.object({ add: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Expense Ledger — Pujo Khata" },
      {
        name: "description",
        content:
          "Category-wise puja expenses — pandal, idol, lighting, bhog — with receipt photos.",
      },
      { property: "og:title", content: "Expense Ledger — Pujo Khata" },
      {
        property: "og:description",
        content: "Every puja expense with approvals and receipt photos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { t, money, ago } = useI18n();
  const { add } = Route.useSearch();
  const navigate = useNavigate();
  const { data: expenses = [] } = useExpenses();
  const { data: members = [] } = useMembers();
  const [cat, setCat] = useState<ExpenseCategory | "all">("all");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ExpenseRecord | null>(null);

  useEffect(() => {
    if (add) {
      setOpen(true);
      navigate({ to: "/expenses", search: {}, replace: true });
    }
  }, [add, navigate]);

  const list = useMemo(
    () => expenses.filter((e) => cat === "all" || e.category === cat),
    [expenses, cat],
  );
  // Voided expenses stay listed for audit but never count (SPEC Section 6).
  const total = list.filter((e) => !isVoid(e)).reduce((s, e) => s + e.amount, 0);

  return (
    <AppShell
      fab={
        <button
          onClick={() => setOpen(true)}
          className="btn btn-primary shadow-fab fixed bottom-24 right-4 z-40 h-16 rounded-full px-6"
        >
          <Plus className="h-6 w-6" /> {t("addExpense")}
        </button>
      }
    >
      <h1 className="text-2xl font-extrabold">{t("expenseLedger")}</h1>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        <button className="chip" data-active={cat === "all"} onClick={() => setCat("all")}>
          {t("all")}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className="chip"
            data-active={cat === c.key}
            onClick={() => setCat(c.key)}
          >
            {c.emoji} {t(c.t)}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-primary-soft p-4">
        <span className="font-semibold text-primary">{t("spent")}</span>
        <span className="num text-2xl font-extrabold text-primary">{money(total)}</span>
      </div>

      <ul className="mt-4 space-y-2">
        {list.map((e) => {
          const c = CATEGORIES.find((x) => x.key === e.category)!;
          const m = members.find((x) => x.id === e.authorized_by_id);
          return (
            <li key={e.id} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-card">
              <button
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-2xl"
                onClick={() => e.voucher_image_id && setPreview(e)}
                aria-label={t("receiptPhoto")}
              >
                <VoucherThumb id={e.voucher_image_id} />
              </button>
              <div className="min-w-0 flex-1">
                <div className={`font-bold leading-snug ${isVoid(e) ? "line-through" : ""}`}>
                  {e.title}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {c.emoji} {t(c.t)} · {t("paidTo")}: {e.paid_to} · {t("approvedBy")}:{" "}
                  {m?.name ?? "—"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {ago(e.created_at)}
                  </span>
                  <SyncBadge status={e.sync_status} />
                </div>
              </div>
              <div className="num font-extrabold text-primary">{money(e.amount)}</div>
            </li>
          );
        })}
      </ul>
      <div className="h-16" />

      <AddExpense
        open={open}
        onClose={() => setOpen(false)}
        defaultCat={cat === "all" ? "pandal" : cat}
      />
      <Modal open={!!preview} onClose={() => setPreview(null)} title={t("receiptPhoto")}>
        {preview && <VoucherImage id={preview.voucher_image_id} />}
      </Modal>
    </AppShell>
  );
}

function VoucherThumb({ id }: { id: string | undefined }) {
  const url = useVoucherImage(id);
  return url ? (
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : (
    <ImageIcon className="h-6 w-6 text-muted-foreground" />
  );
}

function VoucherImage({ id }: { id: string | undefined }) {
  const url = useVoucherImage(id);
  return url ? <img src={url} alt="" className="w-full rounded-2xl" /> : null;
}

/** Downscale a camera photo to ≤ 640px JPEG before it goes to IndexedDB. */
async function shrink(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r) => {
    img.onload = r;
    img.src = url;
  });
  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = img.width * scale;
  c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.7),
  );
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
type ExpenseField = "title" | "amount" | "paid_to" | "authorized_by_id" | "date";

function AddExpense({
  open,
  onClose,
  defaultCat,
}: {
  open: boolean;
  onClose: () => void;
  defaultCat: ExpenseCategory;
}) {
  const { t, money } = useI18n();
  const { data: members = [] } = useMembers();
  const me = useCurrentMember();
  const addExpense = useAddExpense();
  const [cat, setCat] = useState<ExpenseCategory>(defaultCat);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [date, setDate] = useState(today);
  const [by, setBy] = useState("");
  const [img, setImg] = useState<Blob | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: string; key: ErrKey } | null>(null);
  // Client-generated id = idempotency key for retries and double taps.
  const expenseId = useRef<string | null>(null);
  // Only admins and treasurers may authorise an expense (Story 3.1).
  const approvers = members.filter((m) => m.role !== "collector");

  useEffect(() => {
    if (open) setCat(defaultCat);
  }, [open, defaultCat]);
  useEffect(() => {
    if (by || !approvers.length) return;
    setBy((approvers.find((m) => m.id === me?.id) ?? approvers[0])!.id);
  }, [approvers, by, me]);
  useEffect(() => {
    if (!img) return setImgUrl(null);
    const u = URL.createObjectURL(img);
    setImgUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [img]);

  const input = {
    id: expenseId.current ?? "pending",
    category: cat,
    title,
    amount: amount ? Number(amount) : NaN,
    paid_to: paidTo,
    authorized_by_id: by,
    date,
  };
  const errors = fieldErrors(expenseSchema, input);
  const err = (f: ExpenseField) =>
    (submitted ? errors[f] : undefined) ?? (serverErr?.field === f ? serverErr.key : undefined);

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (addExpense.isPending) return;
    setSubmitted(true);
    const first = (["title", "amount", "paid_to", "authorized_by_id", "date"] as const).find(
      (f) => errors[f],
    );
    if (first) return document.getElementById(`expense-${first}`)?.focus();
    setServerErr(null);
    expenseId.current ??= crypto.randomUUID();
    try {
      const e = await addExpense.mutateAsync({ ...input, id: expenseId.current, voucher: img });
      toast.success(navigator.onLine ? `${money(e.amount)} ✓` : t("offlineSaved"));
      expenseId.current = null;
      setTitle("");
      setAmount("");
      setPaidTo("");
      setDate(today());
      setImg(null);
      setSubmitted(false);
      onClose();
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      if (ex.field === "voucher") toast.error(t(ex.key));
      else setServerErr({ field: ex.field, key: ex.key });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("addExpense")}>
      <form className="space-y-4" onSubmit={save} noValidate>
        <div>
          <Label>{t("category")}</Label>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.key}
                className="chip px-2 text-sm"
                data-active={cat === c.key}
                aria-pressed={cat === c.key}
                onClick={() => setCat(c.key)}
              >
                {c.emoji} {t(c.t)}
              </button>
            ))}
          </div>
        </div>
        <TextField
          id="expense-title"
          label={t("itemName")}
          maxLength={120}
          value={title}
          error={err("title")}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          id="expense-amount"
          label={t("amount")}
          className="num text-xl font-bold"
          inputMode="numeric"
          placeholder="₹"
          value={amount}
          error={err("amount")}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
        />
        <TextField
          id="expense-paid_to"
          label={t("paidTo")}
          maxLength={80}
          value={paidTo}
          error={err("paid_to")}
          onChange={(e) => setPaidTo(e.target.value)}
        />
        <TextField
          id="expense-date"
          label={t("date")}
          type="date"
          value={date}
          max={today()}
          error={err("date")}
          onChange={(e) => setDate(e.target.value)}
        />
        <div>
          <Label htmlFor="expense-authorized_by_id">{t("approvedBy")}</Label>
          <select
            id="expense-authorized_by_id"
            className="field"
            value={by}
            aria-invalid={!!err("authorized_by_id")}
            aria-describedby={
              err("authorized_by_id") ? "expense-authorized_by_id-error" : undefined
            }
            onChange={(e) => setBy(e.target.value)}
          >
            {approvers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {t(`role_${m.role}`)}
              </option>
            ))}
          </select>
          <FieldError id="expense-authorized_by_id-error" error={err("authorized_by_id")} />
        </div>
        <div>
          <Label>{t("receiptPhoto")}</Label>
          <label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input bg-muted p-3 font-semibold text-muted-foreground">
            {imgUrl ? (
              <img src={imgUrl} alt="" className="h-20 rounded-lg" />
            ) : (
              <>
                <Camera className="h-6 w-6" /> {t("takePhoto")}
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setImg(await shrink(f));
              }}
            />
          </label>
        </div>
        <button
          type="submit"
          className="btn btn-primary w-full text-lg"
          disabled={addExpense.isPending}
        >
          {t("save")}
        </button>
      </form>
    </Modal>
  );
}
