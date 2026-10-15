import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useClubs, useInvalidateAll } from "@/hooks/use-data";
import { api } from "@/services/api";
import { Label } from "./ui";

export function ClubPicker({ onDone }: { onDone: () => void }) {
  const { t, pick, n } = useI18n();
  const { data } = useClubs();
  const invalidate = useInvalidateAll();
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: "", para: "", zone: "", target: "500000" });

  const select = async (id: string) => {
    await api.setActiveClub(id);
    await invalidate();
    onDone();
  };
  const create = async () => {
    if (!f.name.trim()) return;
    await api.createClub({ name: f.name.trim(), para: f.para, zone: f.zone, puja_year: 2026, target_amount: Number(f.target) || 0 });
    await invalidate();
    onDone();
  };

  if (creating)
    return (
      <div className="space-y-4">
        <div><Label>{t("clubName")}</Label><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("para")}</Label><input className="field" value={f.para} onChange={(e) => setF({ ...f, para: e.target.value })} /></div>
          <div><Label>{t("zone")}</Label><input className="field" value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("year")}</Label><input className="field" value={n("2026")} readOnly /></div>
          <div><Label>{t("target")} (₹)</Label><input className="field" inputMode="numeric" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value.replace(/\D/g, "") })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-outline" onClick={() => setCreating(false)}>{t("cancel")}</button>
          <button className="btn btn-primary" onClick={create} disabled={!f.name.trim()}>{t("save")}</button>
        </div>
      </div>
    );

  return (
    <div className="space-y-2">
      {data?.clubs.map((c) => (
        <button key={c.id} onClick={() => select(c.id)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="font-bold">{pick(c.name, c.name_en)}</div>
            <div className="text-sm text-muted-foreground">{[c.para, c.zone].filter(Boolean).join(" · ")}</div>
          </div>
          {data.active_club_id === c.id && <Check className="h-5 w-5 text-primary" />}
        </button>
      ))}
      <button onClick={() => setCreating(true)} className="btn btn-gold w-full">
        <Plus className="h-5 w-5" /> {t("createClub")}
      </button>
    </div>
  );
}
