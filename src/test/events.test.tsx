import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canRegister,
  countdownLabel,
  daysUntil,
  eventPhase,
  eventShareText,
  groupEvents,
} from "@/features/events";
import { queryKeys, useRegisterEvent } from "@/hooks/use-data";
import { isoDate } from "@/lib/format";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import type { Club, ClubEvent } from "@/types/domain";
import { seedAsAdmin } from "./helpers";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const TODAY = "2026-10-17";
const ev = (date: string, over: Partial<ClubEvent> = {}): ClubEvent => ({
  id: crypto.randomUUID(),
  club_id: "c",
  title_bn: "বসে আঁকো",
  title_en: "Sit & Draw",
  date,
  registrations_count: 3,
  created_at: "2026-10-01T00:00:00.000Z",
  ...over,
});

const i18n = () => renderHook(() => useI18n(), { wrapper: I18nProvider }).result;

describe("events model", () => {
  it("counts calendar days, across month ends", () => {
    expect(daysUntil(ev("2026-10-17"), TODAY)).toBe(0);
    expect(daysUntil(ev("2026-11-02"), TODAY)).toBe(16);
    expect(daysUntil(ev("2026-10-10"), TODAY)).toBe(-7);
  });

  it("keeps registration open through the event day only", () => {
    expect(eventPhase(ev("2026-10-17"), TODAY)).toBe("today");
    expect(canRegister(ev("2026-10-17"), TODAY)).toBe(true);
    expect(canRegister(ev("2026-10-18"), TODAY)).toBe(true);
    expect(canRegister(ev("2026-10-16"), TODAY)).toBe(false);
  });

  it("groups today, upcoming (soonest first), finished (latest first) and drops empty groups", () => {
    const a = ev("2026-10-25"),
      b = ev("2026-10-18"),
      c = ev("2026-10-01"),
      d = ev("2026-10-12"),
      e = ev("2026-10-17");
    expect(
      groupEvents([a, b, c, d, e], TODAY).map((s) => [s.phase, s.events.map((x) => x.id)]),
    ).toEqual([
      ["today", [e.id]],
      ["upcoming", [b.id, a.id]],
      ["past", [d.id, c.id]],
    ]);
    expect(groupEvents([a], TODAY).map((s) => s.phase)).toEqual(["upcoming"]);
  });

  it("labels the countdown in the current language", () => {
    const f = i18n();
    expect(countdownLabel(ev("2026-10-17"), TODAY, f.current)).toBe("আজ");
    expect(countdownLabel(ev("2026-10-18"), TODAY, f.current)).toBe("আগামীকাল");
    expect(countdownLabel(ev("2026-10-20"), TODAY, f.current)).toBe("৩ দিন বাকি");
    expect(countdownLabel(ev("2026-10-10"), TODAY, f.current)).toBeNull();
    act(() => f.current.setLang("en"));
    expect(countdownLabel(ev("2026-10-20"), TODAY, f.current)).toBe("In 3 days");
  });

  it("builds self-contained share text", () => {
    const f = i18n();
    act(() => f.current.setLang("en"));
    const club = { name_bn: "নমুনা", name_en: "Sample Puja Committee 2026" } as Club;
    const text = eventShareText(ev("2026-10-18", { registrations_count: 24 }), club, f.current);
    expect(text).toContain("Sample Puja Committee 2026");
    expect(text).toContain("Sit & Draw");
    expect(text).toContain("18 October 2026");
    expect(text).toContain("24 registered");
    expect(text).not.toMatch(/https?:\/\//);
  });
});

describe("events api", () => {
  const keyOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: ValidationError) => e.key,
    );

  it("seeds upcoming demo events relative to today", async () => {
    await seedAsAdmin();
    const events = await api.listEvents();
    expect(events.map((e) => e.title_en)).toEqual(["Sit & Draw", "Dhunuchi Dance"]);
    expect(events.every((e) => e.date > isoDate())).toBe(true);
  });

  it("creates events from today on, stored once as typed", async () => {
    await seedAsAdmin();
    const created = await api.createEvent({ title: "  শঙ্খ বাজানো ", date: isoDate() });
    expect(created).toMatchObject({
      title_bn: "শঙ্খ বাজানো",
      title_en: "শঙ্খ বাজানো",
      registrations_count: 0,
    });
    const yesterday = isoDate(new Date(Date.now() - 86_400_000));
    expect(await keyOf(api.createEvent({ title: "পুরনো", date: yesterday }))).toBe("err_eventPast");
    expect(await keyOf(api.createEvent({ title: "অ", date: isoDate() }))).toBe("err_nameShort");
  });

  it("undo never takes the tally below zero", async () => {
    await seedAsAdmin();
    const e = await api.createEvent({ title: "নতুন", date: isoDate() });
    expect((await api.registerEvent(e.id)).registrations_count).toBe(1);
    expect((await api.unregisterEvent(e.id)).registrations_count).toBe(0);
    expect((await api.unregisterEvent(e.id)).registrations_count).toBe(0);
  });
});

describe("useRegisterEvent", () => {
  function setup() {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const e = ev("2026-10-18", { registrations_count: 5 });
    qc.setQueryData(queryKeys.events, [e]);
    vi.spyOn(api, "listEvents").mockImplementation(() => new Promise(() => {})); // no refetch
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRegisterEvent(), { wrapper });
    const count = () => qc.getQueryData<ClubEvent[]>(queryKeys.events)![0]!.registrations_count;
    return { result, e, count };
  }

  it("updates the tally before the save finishes", async () => {
    const { result, e, count } = setup();
    vi.spyOn(api, "registerEvent").mockImplementation(() => new Promise(() => {}));
    act(() => result.current.mutate(e.id));
    await waitFor(() => expect(count()).toBe(6));
  });

  it("rolls the tally back when the save fails", async () => {
    const { result, e, count } = setup();
    vi.spyOn(api, "registerEvent").mockRejectedValue(new Error("disk full"));
    await act(() => result.current.mutateAsync(e.id).catch(() => {}));
    expect(count()).toBe(5);
  });
});
