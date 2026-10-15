import { beforeEach, describe, expect, it } from "vitest";

import { session } from "@/hooks/use-data";
import {
  ValidationError,
  check,
  clubSchema,
  fieldErrors,
  normalizePhone,
  phoneSchema,
} from "@/lib/validation";
import { api, DEMO_OTP } from "@/services/api";

const club = {
  name: "নতুন পল্লী ক্লাব",
  para: "",
  zone: "",
  puja_year: 2026,
  target_amount: 200000,
};

async function rejectsWith(p: Promise<unknown>, key: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ValidationError);
  expect((err as ValidationError).key).toBe(key);
}

beforeEach(() => localStorage.clear());

describe("phone validation", () => {
  it("normalizes pasted numbers with +91, 0 and spaces", () => {
    expect(normalizePhone("+91 98300-12345")).toBe("9830012345");
    expect(normalizePhone("09830012345")).toBe("9830012345");
    expect(normalizePhone("98300123456789")).toBe("9830012345");
  });

  it("accepts Indian mobiles starting 6–9 only", () => {
    expect(check(phoneSchema, "9830012345")).toBeNull();
    expect(check(phoneSchema, "6000000000")).toBeNull();
    expect(check(phoneSchema, "5830012345")).toBe("err_phone");
    expect(check(phoneSchema, "983001234")).toBe("err_phone");
  });
});

describe("club validation", () => {
  it("reports one error key per field", () => {
    expect(fieldErrors(clubSchema, { ...club, name: "  ", target_amount: 0 })).toEqual({
      name: "err_required",
      target_amount: "err_target",
    });
    expect(fieldErrors(clubSchema, { ...club, name: "ab" }).name).toBe("err_clubNameShort");
    expect(fieldErrors(clubSchema, { ...club, target_amount: NaN }).target_amount).toBe(
      "err_target",
    );
    expect(fieldErrors(clubSchema, { ...club, target_amount: 100_000_001 }).target_amount).toBe(
      "err_target",
    );
    expect(fieldErrors(clubSchema, club)).toEqual({});
  });
});

describe("api OTP", () => {
  it("rejects an invalid phone", async () => {
    await rejectsWith(api.requestOtp("12345"), "err_phone");
  });

  it("verifies the demo code once and only after a request", async () => {
    await rejectsWith(api.verifyOtp("9830012345", DEMO_OTP), "err_otpExpired");
    await api.requestOtp("9830012345");
    await expect(api.verifyOtp("9830012345", DEMO_OTP)).resolves.toEqual({ phone: "9830012345" });
    await rejectsWith(api.verifyOtp("9830012345", DEMO_OTP), "err_otpExpired");
  });

  it("locks out after five wrong codes until a new OTP is requested", async () => {
    await api.requestOtp("9830012345");
    for (let i = 0; i < 4; i++)
      await rejectsWith(api.verifyOtp("9830012345", "0000"), "err_otpWrong");
    await rejectsWith(api.verifyOtp("9830012345", "0000"), "err_otpExpired");
    await rejectsWith(api.verifyOtp("9830012345", DEMO_OTP), "err_otpExpired");
    await api.requestOtp("9830012345");
    await expect(api.verifyOtp("9830012345", DEMO_OTP)).resolves.toBeTruthy();
  });
});

describe("api clubs", () => {
  it("creates a trimmed club and makes it active", async () => {
    const c = await api.createClub({ ...club, name: "  নতুন   পল্লী ক্লাব " });
    expect(c.name_bn).toBe("নতুন   পল্লী ক্লাব");
    expect(c.area_label).toBe("");
    expect((await api.getClub())?.id).toBe(c.id);
  });

  it("rejects invalid input and duplicate names", async () => {
    await rejectsWith(api.createClub({ ...club, target_amount: 10 }), "err_target");
    await api.createClub(club);
    await rejectsWith(api.createClub({ ...club, name: "নতুন  পল্লী ক্লাব" }), "err_clubExists");
  });

  it("starts with no club; seedDemo opens the sample club again after switching", async () => {
    expect(await api.getClub()).toBeNull();
    await api.seedDemo();
    const demo = (await api.getClub())!;
    await api.createClub(club);
    await api.seedDemo();
    expect((await api.getClub())?.id).toBe(demo.id);
  });
});

describe("session", () => {
  it("treats tampered or malformed sessions as logged out", () => {
    localStorage.setItem("pk_session_v1", "{oops");
    expect(session.get()).toBeNull();
    localStorage.setItem("pk_session_v1", JSON.stringify({ mode: "admin" }));
    expect(session.get()).toBeNull();
    localStorage.setItem("pk_session_v1", JSON.stringify({ mode: "user", phone: "123" }));
    expect(session.get()).toBeNull();
    session.set({ mode: "user", phone: "9830012345" });
    expect(session.get()).toEqual({ mode: "user", phone: "9830012345" });
  });
});
