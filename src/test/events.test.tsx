import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canRegister,
  countdownLabel,
  daysUntil,
  eventDateParts,
  eventPhase,
  eventShareText,
  groupEvents,
} from "@/features/events";
import { EventCard } from "@/features/events";
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
    expect(text).toContain("Everyone's welcome");
    expect(text).not.toContain("24"); // registration is switched off for now
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

  it("only an admin edits or deletes an event; other roles view and register", async () => {
    await api.seedDemo(); // the demo acts as a collector (SPEC 2.1)
    const [first] = await api.listEvents();
    expect(await keyOf(api.updateEvent(first!.id, { title: "নতুন নাম", date: first!.date }))).toBe(
      "err_forbidden",
    );
    expect(await keyOf(api.deleteEvent(first!.id))).toBe("err_forbidden");
    expect((await api.registerEvent(first!.id)).registrations_count).toBe(
      first!.registrations_count + 1,
    );
  });

  it("an admin renames and re-dates an event; its registrations stay", async () => {
    await seedAsAdmin();
    const e = await api.createEvent({ title: "শঙ্খ", date: isoDate() });
    await api.registerEvent(e.id);
    const later = isoDate(new Date(Date.now() + 3 * 86_400_000));
    const updated = await api.updateEvent(e.id, { title: " শঙ্খধ্বনি ", date: later });
    expect(updated).toMatchObject({
      title_bn: "শঙ্খধ্বনি",
      title_en: "শঙ্খধ্বনি",
      date: later,
      registrations_count: 1,
    });
    const yesterday = isoDate(new Date(Date.now() - 86_400_000));
    expect(await keyOf(api.updateEvent(e.id, { title: "শঙ্খ", date: yesterday }))).toBe(
      "err_eventPast",
    );
  });

  it("a finished event can still be renamed without moving its date", async () => {
    await seedAsAdmin();
    const e = await api.createEvent({ title: "আঁকা", date: isoDate() });
    const past = isoDate(new Date(Date.now() - 2 * 86_400_000));
    // Simulate an event that has already happened.
    const db = JSON.parse(localStorage.getItem("pk_db_v2")!);
    db.events.find((x: ClubEvent) => x.id === e.id).date = past;
    localStorage.setItem("pk_db_v2", JSON.stringify(db));
    expect((await api.updateEvent(e.id, { title: "বসে আঁকো", date: past })).title_bn).toBe(
      "বসে আঁকো",
    );
  });

  it("a deleted event disappears and takes no more registrations", async () => {
    await seedAsAdmin();
    const e = await api.createEvent({ title: "ধুনুচি", date: isoDate() });
    await api.deleteEvent(e.id);
    expect((await api.listEvents()).some((x) => x.id === e.id)).toBe(false);
    expect(await keyOf(api.registerEvent(e.id))).toBe("err_notFound");
    expect(await keyOf(api.updateEvent(e.id, { title: "ধুনুচি", date: isoDate() }))).toBe(
      "err_notFound",
    );
    expect(await keyOf(api.deleteEvent(e.id))).toBe("err_notFound");
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

describe("EventCard", () => {
  const props = { event: ev("2026-10-25"), today: TODAY, onShare: () => {} };

  it("shows a calendar tile, weekday and countdown", () => {
    render(<EventCard {...props} />, { wrapper: I18nProvider });
    const card = screen.getByRole("article", { name: "বসে আঁকো" });
    expect(card).toHaveTextContent("২৫"); // day on the tile
    expect(card).toHaveTextContent("রবিবার");
    expect(card).toHaveTextContent("৮ দিন বাকি");
  });

  it("has no registration for now: no register button and no tally", () => {
    const onShare = vi.fn();
    render(<EventCard {...props} onShare={onShare} />, { wrapper: I18nProvider });
    expect(screen.queryByRole("button", { name: "নাম লেখান" })).toBeNull();
    expect(screen.getByRole("article")).not.toHaveTextContent("নাম লিখিয়েছেন");
    fireEvent.click(screen.getByRole("button", { name: "বসে আঁকো শেয়ার করুন" }));
    expect(onShare).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /আরও বিকল্প/ })).toBeNull();
  });

  it("gives admins edit and delete behind a ⋮ menu", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<EventCard {...props} onEdit={onEdit} onDelete={onDelete} />, {
      wrapper: I18nProvider,
    });
    fireEvent.click(screen.getByRole("button", { name: "আরও বিকল্প: বসে আঁকো" }));
    fireEvent.click(screen.getByRole("button", { name: "প্রতিযোগিতা সম্পাদনা" }));
    expect(onEdit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "আরও বিকল্প: বসে আঁকো" }));
    fireEvent.click(screen.getByRole("button", { name: "মুছে দিন" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("mutes a finished event: no buttons, and says so", () => {
    render(<EventCard {...props} event={ev("2026-10-10")} />, { wrapper: I18nProvider });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("article")).toHaveTextContent("শেষ হয়েছে");
  });
});

describe("eventDateParts", () => {
  it("splits the date for the calendar tile in either language", () => {
    expect(eventDateParts({ date: "2026-10-20" }, "en")).toEqual({
      day: 20,
      month: "Oct",
      weekday: "Tuesday",
    });
    const bn = eventDateParts({ date: "2026-10-20" }, "bn");
    expect(bn.day).toBe(20);
    expect(bn.weekday).toBe("মঙ্গলবার");
    expect(bn.month).not.toMatch(/(?:\.|\u0983)$/); // no abbreviation mark on the tile
  });
});
