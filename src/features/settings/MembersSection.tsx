import { ChevronRight, UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCurrentMember, useMembers, usePermission } from "@/hooks/use-data";
import { useSearchModal } from "@/hooks/use-search-modal";
import { Modal } from "@/components/pk/ui";
import type { ClubMember } from "@/types/domain";
import { membersByRole, phoneDisplay } from "./model";
import { MemberAvatar } from "./MemberAvatar";
import { AddMemberForm } from "./AddMemberForm";
import { MemberSheet } from "./MemberSheet";

/**
 * Story 6.2: members grouped by role. Admins tap a member to change their role or reset their
 * collecting device (MemberSheet), and add members from a sheet; both sheets live in the URL
 * (`?member=<id>`, `?addMember=true`) so the phone's back button closes them.
 */
export function MembersSection({
  memberId,
  adding,
}: {
  memberId?: string | undefined;
  adding?: boolean | undefined;
}) {
  const { t, n } = useI18n();
  const { data: members = [], isPending } = useMembers();
  const me = useCurrentMember();
  const manage = usePermission("member.manage");
  const memberSheet = useSearchModal("member");
  const addSheet = useSearchModal("addMember");
  const open = manage ? members.find((m) => m.id === memberId) : undefined;

  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-members">
      <div className="flex items-center justify-between gap-3">
        <h2 id="set-members" className="flex items-center gap-2 font-bold">
          {t("members")}
          {!isPending && (
            <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {t("memberCount", { count: n(String(members.length)) })}
            </span>
          )}
        </h2>
        {manage && (
          <button
            type="button"
            className="btn btn-gold min-h-12 px-3 text-sm"
            onClick={() => addSheet.open()}
          >
            <UserPlus className="h-4 w-4" aria-hidden /> {t("addMemberShort")}
          </button>
        )}
      </div>

      {isPending ? (
        <div className="mt-3 h-32 animate-pulse rounded-2xl bg-muted" aria-busy="true" />
      ) : (
        membersByRole(members).map((g) => (
          <div key={g.role} className="mt-4">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gold-ink">
              {t(`role_${g.role}`)}
            </h3>
            {g.members.length === 0 ? (
              <p className="rounded-2xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                {t("noMembersInRole")}
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-2xl border">
                {g.members.map((m) => (
                  <li key={m.id}>
                    <MemberRow
                      member={m}
                      isMe={me?.id === m.id}
                      onOpen={manage ? () => memberSheet.open(m.id) : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))
      )}

      {open && <MemberSheet member={open} isMe={me?.id === open.id} onClose={memberSheet.close} />}
      <Modal open={manage && !!adding} onClose={addSheet.close} title={t("addMember")}>
        <AddMemberForm onAdded={addSheet.close} />
      </Modal>
    </section>
  );
}

/** One member: avatar in their role's tone, name, phone and code; tappable for admins. */
function MemberRow({
  member: m,
  isMe,
  onOpen,
}: {
  member: ClubMember;
  isMe: boolean;
  onOpen?: (() => void) | undefined;
}) {
  const { t, n } = useI18n();
  const body = (
    <>
      <MemberAvatar member={m} />
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold">{m.name}</span>
          {isMe && (
            <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
              {t("you")}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="num whitespace-nowrap">{n(phoneDisplay(m.phone))}</span>
          <span className="rounded-md border px-1.5 font-mono text-[11px] font-semibold leading-5">
            {m.collector_code}
          </span>
        </div>
      </div>
    </>
  );
  if (!onOpen) return <div className="flex min-h-16 items-center gap-3 px-3 py-2">{body}</div>;
  return (
    <button
      type="button"
      className="flex min-h-16 w-full items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/60 active:bg-muted"
      aria-label={t("manageMemberLabel", { name: m.name })}
      onClick={onOpen}
    >
      {body}
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
