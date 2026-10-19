import { useState } from "react";
import { Check, Phone } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { ValidationError, type ErrKey } from "@/lib/validation";
import { useUpdateMemberRole } from "@/hooks/use-data";
import { FieldError, Modal, Spinner } from "@/components/pk/ui";
import { ResetCollectDevice } from "@/features/devices";
import type { ClubMember, UserRole } from "@/types/domain";
import { ROLES, phoneDisplay } from "./model";
import { MemberAvatar } from "./MemberAvatar";

/** Admin: one member's details, their role (saved explicitly) and their collecting device. */
export function MemberSheet({
  member: m,
  isMe,
  onClose,
}: {
  member: ClubMember;
  isMe: boolean;
  onClose: () => void;
}) {
  const { t, n } = useI18n();
  const updateRole = useUpdateMemberRole();
  const [role, setRole] = useState<UserRole>(m.role);
  const [error, setError] = useState<ErrKey | null>(null);

  const save = () =>
    updateRole.mutate(
      { id: m.id, role },
      {
        onSuccess: () => {
          toast.success(t("roleChanged", { name: m.name, role: t(`role_${role}`) }));
          onClose();
        },
        onError: (e) => setError(e instanceof ValidationError ? e.key : "err_syncFailed"),
      },
    );

  return (
    <Modal open onClose={onClose} title={t("manageMember")}>
      <div className="flex items-center gap-4">
        <MemberAvatar member={m} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-lg font-bold leading-snug">
            {m.name}
            {isMe && (
              <span className="ml-2 inline-block rounded-full bg-primary-soft px-2 py-0.5 align-middle text-[11px] font-bold text-primary">
                {t("you")}
              </span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="num">{n(phoneDisplay(m.phone))}</span>
            <span className="rounded-md border px-1.5 font-mono text-[11px] font-semibold leading-5">
              {m.collector_code}
            </span>
          </p>
        </div>
        {!isMe && (
          <a
            href={`tel:+91${m.phone}`}
            className="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-card text-success"
            aria-label={`${t("callMember")}: ${m.name}`}
          >
            <Phone className="h-5 w-5" aria-hidden />
          </a>
        )}
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-semibold text-muted-foreground">{t("role")}</legend>
        <div role="radiogroup" aria-label={t("role")} className="space-y-2">
          {ROLES.map((r) => {
            const on = role === r;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setRole(r);
                  setError(null);
                }}
                className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${on ? "border-primary bg-primary-soft" : "border-border bg-card"}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                  aria-hidden
                >
                  {on && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className={`block font-semibold ${on ? "text-primary" : ""}`}>
                    {t(`role_${r}`)}
                  </span>
                  <span className="block text-sm text-muted-foreground">{t(`role_${r}_hint`)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <FieldError id="member-role-error" error={error} />
      </fieldset>

      <button
        type="button"
        className="btn btn-primary mt-4 w-full"
        disabled={role === m.role || updateRole.isPending}
        aria-busy={updateRole.isPending}
        onClick={save}
      >
        {updateRole.isPending && <Spinner />}
        {t("saveRole")}
      </button>

      <ResetCollectDevice member={m} />
    </Modal>
  );
}
