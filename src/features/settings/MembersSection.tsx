import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useMembers, useUpdateMemberRole } from "@/hooks/use-data";
import { ValidationError } from "@/lib/validation";
import type { ClubMember, UserRole } from "@/types/domain";
import { ROLES, membersByRole } from "./model";
import { AddMemberForm } from "./AddMemberForm";

/** Story 6.2: members grouped by role, with the role editable per member. */
export function MembersSection() {
  const { t } = useI18n();
  const { data: members = [], isPending } = useMembers();

  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-members">
      <h2 id="set-members" className="font-bold">
        {t("members")}
      </h2>
      {isPending ? (
        <div className="mt-3 h-32 animate-pulse rounded-2xl bg-muted" aria-busy="true" />
      ) : (
        membersByRole(members).map((g) => (
          <div key={g.role} className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gold-ink">
              {t(`role_${g.role}`)}
            </h3>
            {g.members.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t("noMembersInRole")}</p>
            ) : (
              <ul className="divide-y">
                {g.members.map((m) => (
                  <MemberRow key={m.id} member={m} />
                ))}
              </ul>
            )}
          </div>
        ))
      )}
      <AddMemberForm />
    </section>
  );
}

function MemberRow({ member: m }: { member: ClubMember }) {
  const { t, n } = useI18n();
  const updateRole = useUpdateMemberRole();
  const change = (role: UserRole) =>
    updateRole.mutate(
      { id: m.id, role },
      {
        onSuccess: () => toast.success(t("roleChanged", { name: m.name, role: t(`role_${role}`) })),
        onError: (e) => toast.error(e instanceof ValidationError ? t(e.key) : t("loadFailedHint")),
      },
    );
  return (
    <li className="flex items-center gap-3 py-2">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary"
        aria-hidden
      >
        {m.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{m.name}</div>
        <div className="num text-xs text-muted-foreground">
          {n(m.phone)} · {m.collector_code}
        </div>
      </div>
      <select
        className="field w-auto min-w-0 text-sm"
        aria-label={`${t("role")}: ${m.name}`}
        value={m.role}
        disabled={updateRole.isPending}
        onChange={(e) => change(e.target.value as UserRole)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {t(`role_${r}`)}
          </option>
        ))}
      </select>
    </li>
  );
}
