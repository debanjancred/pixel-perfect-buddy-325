import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Smartphone, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { session, useInvalidateAll } from "@/hooks/use-data";
import { api } from "@/services/api";
import { AlponaStrip, Label, LangToggle } from "@/components/pk/ui";
import { ClubPicker } from "@/components/pk/ClubPicker";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pujo Khata — Durga Puja chanda & expense app" },
      { name: "description", content: "Collect chanda, log expenses and share transparent accounts for your para's Durga Puja. Works offline." },
      { property: "og:title", content: "Pujo Khata — পুজো খাতা" },
      { property: "og:description", content: "Transparent chanda & expense accounts for Durga Puja committees." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { t, n } = useI18n();
  const navigate = useNavigate();
  const invalidate = useInvalidateAll();
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"auth" | "club">("auth");

  useEffect(() => {
    if (session.get()) navigate({ to: "/home" });
  }, [navigate]);

  const demo = async () => {
    await api.getClubs(); // seeds demo data on first run
    session.set({ mode: "demo" });
    await invalidate();
    navigate({ to: "/home" });
  };
  const verify = () => {
    if (otp !== "1234") return;
    session.set({ mode: "user", phone });
    setStep("club");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <div className="bg-hero rounded-b-[2rem] px-5 pb-10 text-primary-foreground">
        <AlponaStrip />
        <div className="flex justify-end pt-3"><LangToggle /></div>
        <img src="/icon-192.png" alt="Pujo Khata" width={72} height={72} className="mt-4 h-18 w-18 rounded-2xl ring-2 ring-gold" />
        <h1 className="mt-4 text-4xl font-extrabold leading-tight">পুজো খাতা</h1>
        <div className="text-lg font-semibold opacity-90">Pujo Khata</div>
        <p className="mt-2 max-w-xs opacity-90">{t("tagline")}</p>
      </div>

      <div className="flex-1 space-y-5 px-5 py-6">
        {step === "auth" ? (
          <>
            <div>
              <Label><Smartphone className="mr-1 inline h-4 w-4" />{t("phone")}</Label>
              <div className="flex gap-2">
                <span className="field flex w-auto items-center font-bold">+91</span>
                <input className="field num text-lg" inputMode="numeric" placeholder="98300 12345" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            {!otpSent ? (
              <button className="btn btn-primary w-full text-lg" disabled={phone.length !== 10} onClick={() => setOtpSent(true)}>{t("sendOtp")}</button>
            ) : (
              <div className="space-y-3">
                <Label>{t("enterOtp")}</Label>
                <input className="field num text-center text-2xl tracking-[0.6em]" inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
                <button className="btn btn-gold w-full" onClick={() => setOtp("1234")}><Sparkles className="h-5 w-5" /> {t("autofill")}</button>
                <button className="btn btn-primary w-full text-lg" disabled={otp.length !== 4} onClick={verify}>{t("verify")}</button>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-muted-foreground"><div className="h-px flex-1 bg-border" />{t("orLabel")}<div className="h-px flex-1 bg-border" /></div>
            <button className="btn w-full border-2 border-primary bg-primary-soft py-4 text-lg text-primary" onClick={demo}>
              {t("exploreDemo")}
              <span className="font-normal">(বিবেকানন্দ পার্ক সার্বজনীন)</span>
            </button>
            <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> {n("2026")} · Offline-ready
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold">{t("chooseClub")}</h2>
            <ClubPicker onDone={() => navigate({ to: "/home" })} />
          </>
        )}
      </div>
    </div>
  );
}
