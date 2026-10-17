import { toast } from "sonner";
import { useClub, useRegisterEvent, useUnregisterEvent } from "@/hooks/use-data";
import { useI18n } from "@/lib/i18n";
import { shareOrWhatsApp } from "@/lib/share";
import type { ClubEvent } from "@/types/domain";
import { eventShareText } from "./model";

/** Register (+1, with an Undo toast for stray taps) and share actions for event cards. */
export function useEventActions() {
  const i18n = useI18n();
  const { data: club } = useClub();
  const register = useRegisterEvent();
  const unregister = useUnregisterEvent();

  return {
    register: (e: ClubEvent) =>
      register.mutate(e.id, {
        onSuccess: () =>
          toast.success(i18n.t("registeredOne", { title: i18n.pick(e.title_bn, e.title_en) }), {
            action: { label: i18n.t("undo"), onClick: () => unregister.mutate(e.id) },
          }),
        onError: () => toast.error(i18n.t("loadFailedHint")),
      }),
    share: (e: ClubEvent) => shareOrWhatsApp(eventShareText(e, club, i18n)),
  };
}
