import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Sparkles, Smartphone, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { session, useInvalidateAll } from "@/hooks/use-data";
import { api, DEMO_OTP } from "@/services/api";
import {
  ValidationError,
  check,
  normalizePhone,
  otpSchema,
  phoneSchema,
  type ErrKey,
} from "@/lib/validation";
import { AlponaStrip, FieldError, Label, LangToggle } from "@/components/pk/ui";
import { ClubPicker } from "@/components/pk/ClubPicker";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pujo Khata — Durga Puja chanda & expense app" },
      {
        name: "description",
        content:
          "Collect chanda, log expenses and share transparent accounts for your para's Durga Puja. Works offline.",
      },
      { property: "og:title", content: "Pujo Khata — পুজো খাতা" },
      {
        property: "og:description",
        content: "Transparent chanda & expense accounts for Durga Puja committees.",
      },
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
  const [step, setStep] = useState<"phone" | "otp" | "club">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<ErrKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (session.get()) navigate({ to: "/home", replace: true });
  }, [navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      setError(e.key);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = (e?: FormEvent) => {
    e?.preventDefault();
    const err = check(phoneSchema, phone);
    if (err) return setError(err);
    run(async () => {
      const r = await api.requestOtp(phone);
      setOtp("");
      setResendIn(r.resend_after);
      setStep("otp");
    });
  };
  const verify = (e: FormEvent) => {
    e.preventDefault();
    const err = check(otpSchema, otp);
    if (err) return setError(err);
    run(async () => {
      await api.verifyOtp(phone, otp);
      setStep("club");
    });
  };
  const changeNumber = () => {
    setStep("phone");
    setOtp("");
    setError(null);
  };
  // The session starts only once a club is chosen, so a half-finished signup stays logged out.
  const finish = () => {
    session.set({ mode: "user", phone });
    navigate({ to: "/home" });
  };
  const demo = () =>
    run(async () => {
      await api.enterDemo();
      session.set({ mode: "demo" });
      await invalidate();
      navigate({ to: "/home" });
    });

  const pretty = `${phone.slice(0, 5)} ${phone.slice(5)}`;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <div className="bg-hero rounded-b-[2rem] px-5 pb-10 text-primary-foreground">
        <AlponaStrip />
        <div className="flex justify-end pt-3">
          <LangToggle />
        </div>
        <img
          src="/icon-192.png"
          alt=""
          width={72}
          height={72}
          className="mt-4 h-18 w-18 rounded-2xl ring-2 ring-gold"
        />
        <h1 className="mt-4 text-4xl font-extrabold leading-tight">পুজো খাতা</h1>
        <div className="text-lg font-semibold opacity-90">Pujo Khata</div>
        <p className="mt-2 max-w-xs opacity-90">{t("tagline")}</p>
      </div>

      <div className="flex-1 space-y-5 px-5 py-6">
        {step === "club" ? (
          <>
            <h2 className="text-xl font-bold">{t("chooseClub")}</h2>
            <ClubPicker onDone={finish} />
          </>
        ) : (
          <>
            {step === "phone" ? (
              <form className="space-y-5" onSubmit={sendOtp} noValidate>
                <div>
                  <Label htmlFor="phone">
                    <Smartphone className="mr-1 inline h-4 w-4" />
                    {t("phone")}
                  </Label>
                  <div className="flex gap-2">
                    <span className="field flex w-auto items-center font-bold" aria-hidden>
                      +91
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      className="field num text-lg"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="98300 12345"
                      value={phone}
                      aria-invalid={!!error}
                      aria-describedby={error ? "phone-error" : undefined}
                      onChange={(e) => {
                        setPhone(normalizePhone(e.target.value));
                        setError(null);
                      }}
                    />
                  </div>
                  <FieldError id="phone-error" error={error} />
                </div>
                <button type="submit" className="btn btn-primary w-full text-lg" disabled={busy}>
                  {t("sendOtp")}
                </button>
              </form>
            ) : (
              <form className="space-y-3" onSubmit={verify} noValidate>
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span>
                    {t("otpSentTo")} <b className="num">+91 {n(pretty)}</b>
                  </span>
                  <button
                    type="button"
                    className="min-h-12 font-semibold text-primary underline"
                    onClick={changeNumber}
                  >
                    {t("changeNumber")}
                  </button>
                </p>
                <div>
                  <Label htmlFor="otp">{t("enterOtp")}</Label>
                  <input
                    id="otp"
                    className="field num text-center text-2xl tracking-[0.6em]"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={4}
                    autoFocus
                    value={otp}
                    aria-invalid={!!error}
                    aria-describedby={error ? "otp-error" : undefined}
                    onChange={(e) => {
                      setOtp(e.target.value.replace(/\D/g, ""));
                      setError(null);
                    }}
                  />
                  <FieldError id="otp-error" error={error} />
                </div>
                <button
                  type="button"
                  className="btn btn-gold w-full"
                  onClick={() => {
                    setOtp(DEMO_OTP);
                    setError(null);
                  }}
                >
                  <Sparkles className="h-5 w-5" /> {t("autofill")}
                </button>
                <button type="submit" className="btn btn-primary w-full text-lg" disabled={busy}>
                  {t("verify")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline w-full"
                  disabled={busy || resendIn > 0}
                  onClick={() => sendOtp()}
                >
                  {resendIn > 0
                    ? `${t("resendIn")} ${n(String(resendIn))}${t("sec")}`
                    : t("resendOtp")}
                </button>
              </form>
            )}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              {t("orLabel")}
              <div className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              className="btn w-full flex-wrap border-2 border-primary bg-primary-soft py-4 text-lg text-primary"
              disabled={busy}
              onClick={demo}
            >
              {t("exploreDemo")}
              <span className="font-normal">({t("demoClub")})</span>
            </button>
            <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> {n("2026")} · {t("offlineReady")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
