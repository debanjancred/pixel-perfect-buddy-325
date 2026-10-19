import type { ClubMember } from "@/types/domain";
import { ROLE_TONE, initialOf } from "./model";

/** A member's initial in their role's brand tone (admin vermilion, treasurer gold). */
export function MemberAvatar({
  member: m,
  size = "md",
}: {
  member: ClubMember;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${ROLE_TONE[m.role]} ${size === "lg" ? "h-16 w-16 text-2xl" : "h-11 w-11 text-lg"}`}
      aria-hidden
    >
      {initialOf(m.name)}
    </div>
  );
}
