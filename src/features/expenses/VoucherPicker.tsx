import { useEffect, useId, useState } from "react";
import { Camera, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { FieldError, Label, Spinner } from "@/components/pk/ui";
import { compressImage, ImageError } from "@/lib/image";
import type { ErrKey } from "@/lib/validation";

/**
 * "Add bill photo" (Story 3.1): opens the rear camera on phones, compresses the photo on
 * the device, previews it and lets the user change or remove it.
 */
export function VoucherPicker({
  value,
  onChange,
  error: externalError,
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
  error?: ErrKey | undefined;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrKey | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await compressImage(file));
    } catch (e) {
      setError(e instanceof ImageError ? e.code : "err_photoRead");
    } finally {
      setBusy(false);
    }
  };

  const shown = error ?? externalError;
  return (
    <div>
      <Label htmlFor={inputId}>{t("receiptPhoto")}</Label>
      <div className="flex items-stretch gap-2">
        <label
          htmlFor={inputId}
          className="flex min-h-24 flex-1 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input bg-muted p-3 font-semibold text-muted-foreground"
          aria-busy={busy}
        >
          {busy ? (
            <>
              <Spinner className="h-6 w-6 text-primary" /> {t("compressing")}
            </>
          ) : preview ? (
            <>
              <img src={preview} alt="" className="h-20 rounded-lg" />
              <span>{t("changePhoto")}</span>
            </>
          ) : (
            <>
              <Camera className="h-6 w-6" /> {t("takePhoto")}
            </>
          )}
        </label>
        {value && !busy && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="tap flex w-14 items-center justify-center rounded-2xl border bg-card"
            aria-label={t("removePhoto")}
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-invalid={!!shown}
        aria-describedby={shown ? `${inputId}-error` : undefined}
        disabled={busy}
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = ""; // allow picking the same file again after removing it
        }}
      />
      <FieldError id={`${inputId}-error`} error={shown} />
    </div>
  );
}
