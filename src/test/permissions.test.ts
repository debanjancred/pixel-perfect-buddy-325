import { beforeEach, describe, expect, it } from "vitest";

import { can, ROLE_PERMISSIONS } from "@/lib/permissions";
import { isoDate } from "@/lib/format";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import { session } from "@/services/session";
import type { UserRole } from "@/types/domain";

beforeEach(() => localStorage.clear());

const keyOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ValidationError) => e.key,
  );

describe("permission table (SPEC 6.2)", () => {
  it("collectors collect; treasurers also spend, void and receive cash; admins do all", () => {
    expect(ROLE_PERMISSIONS.collector).toEqual(["chanda.add"]);
    expect(can({ role: "treasurer" }, "expense.add")).toBe(true);
    expect(can({ role: "treasurer" }, "entry.void")).toBe(true);
    expect(can({ role: "treasurer" }, "member.manage")).toBe(false);
    expect(can({ role: "admin" }, "member.manage")).toBe(true);
    expect(can(null, "chanda.add")).toBe(false);
  });
});

describe("api enforcement", () => {
  async function actAs(role: UserRole | "outsider") {
    await api.seedDemo();
    const members = await api.listMembers();
    if (role === "outsider") session.set({ mode: "user", phone: "9999999999" });
    else session.set({ mode: "demo", member_id: members.find((m) => m.role === role)!.id });
    const treasurer = members.find((m) => m.role === "treasurer")!;
    const households = await api.listHouseholds();
    return {
      chanda: () =>
        api.addTransaction({
          id: crypto.randomUUID(),
          household_id: households[0]!.id,
          amount: 101,
          payment_method: "cash",
          status: "collected",
          collector_id: members[0]!.id,
        }),
      expense: () =>
        api.addExpense({
          id: crypto.randomUUID(),
          category: "misc",
          title: "t",
          amount: 1,
          paid_to: "p",
          authorized_by_id: treasurer.id,
          date: isoDate(),
        }),
      voidOne: async () =>
        api.voidChanda((await api.listChanda()).find((c) => !c.voided_at)!.id, "typo fix"),
      member: () => api.createMember({ name: "নতুন", phone: "9000000777", role: "collector" }),
      event: () => api.createEvent({ title: "নতুন খেলা", date: isoDate() }),
    };
  }

  it("a collector can only collect", async () => {
    const a = await actAs("collector");
    expect(await keyOf(a.chanda())).toBeNull();
    expect(await keyOf(a.expense())).toBe("err_forbidden");
    expect(await keyOf(a.voidOne())).toBe("err_forbidden");
    expect(await keyOf(a.member())).toBe("err_forbidden");
    expect(await keyOf(a.event())).toBe("err_forbidden");
  });

  it("a treasurer can spend and void but not manage members or events", async () => {
    const a = await actAs("treasurer");
    expect(await keyOf(a.expense())).toBeNull();
    expect(await keyOf(a.voidOne())).toBeNull();
    expect(await keyOf(a.member())).toBe("err_forbidden");
    expect(await keyOf(a.event())).toBe("err_forbidden");
  });

  it("an admin can do everything; the demo acts as admin by default", async () => {
    await api.seedDemo();
    expect((await api.getCurrentMember())?.role).toBe("admin");
    const a = await actAs("admin");
    for (const run of [a.chanda, a.expense, a.voidOne, a.member, a.event])
      expect(await keyOf(run())).toBeNull();
  });

  it("someone who isn't a member of the club can't change anything", async () => {
    const a = await actAs("outsider");
    expect(await api.getCurrentMember()).toBeNull();
    expect(await keyOf(a.chanda())).toBe("err_forbidden");
  });

  it("opening the demo doesn't replace a signed-in user's session", async () => {
    session.set({ mode: "user", phone: "9000000101" });
    await api.seedDemo();
    expect(session.get()).toEqual({ mode: "user", phone: "9000000101" });
  });
});
