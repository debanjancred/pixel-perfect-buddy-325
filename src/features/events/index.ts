// Public surface of the events module (M5 / SPEC Story 6.1). Import from
// "@/features/events" rather than reaching into its files.
export { EventCard } from "./EventCard";
export { EventForm } from "./EventForm";
export { useEventActions } from "./use-event-actions";
export {
  canRegister,
  countdownLabel,
  daysUntil,
  eventDateParts,
  eventPhase,
  eventShareText,
  groupEvents,
  type EventPhase,
  type EventSection,
} from "./model";
