import { useClub } from "@/hooks/use-data";
import { useI18n } from "@/lib/i18n";
import { shareOrWhatsApp } from "@/lib/share";
import type { ClubEvent } from "@/types/domain";
import { eventShareText } from "./model";

/**
 * Actions for event cards: share. (Registration — +1 with an Undo toast via
 * useRegisterEvent/useUnregisterEvent — is switched off until it returns as its own feature.)
 */
export function useEventActions() {
  const i18n = useI18n();
  const { data: club } = useClub();

  return {
    share: (e: ClubEvent) => shareOrWhatsApp(eventShareText(e, club, i18n)),
  };
}
