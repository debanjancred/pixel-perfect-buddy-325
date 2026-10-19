import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/react";
import {
  environmentOf,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubUrl,
} from "@/services/monitoring";

describe("monitoring scrubbing (ADR 0002: nothing personal leaves the phone)", () => {
  it("masks phone numbers, amounts, long numbers and Bengali text", () => {
    expect(scrubText("no member for 9876543210")).toBe("no member for [phone]");
    expect(scrubText("dup +91 9876543210 / 919876543210")).toBe("dup [phone] / [phone]");
    expect(scrubText("over by ₹1,500 and ₹ ৫০০")).toBe("over by ₹[n] and ₹[n]");
    expect(scrubText("receipt 123456 failed")).toBe("receipt [n] failed");
    expect(scrubText("household রবি দাস missing")).toBe("household [bn] [bn] missing");
  });

  it("keeps what's needed to debug: short numbers, ids, line numbers, English messages", () => {
    const id = "3f2a9c1e-4b7d-4e8a-9c1f-12345678abcd";
    expect(scrubText(`TypeError: x is undefined (club ${id}) at 404`)).toBe(
      `TypeError: x is undefined (club ${id}) at 404`,
    );
  });

  it("drops query strings and hashes from URLs", () => {
    expect(scrubUrl("https://app.example/chanda?q=রবি&member=1#top")).toBe(
      "https://app.example/chanda",
    );
    expect(scrubUrl("/assets/index-abc.js")).toBe("/assets/index-abc.js");
  });

  it("scrubs a whole event: message, exception, stack, request, user and extras", () => {
    const event = {
      type: undefined,
      message: "call 9876543210",
      exception: {
        values: [
          {
            type: "Error",
            value: "amount ₹2000 for রবি",
            stacktrace: { frames: [{ filename: "https://a.b/assets/x.js?v=1", lineno: 10 }] },
          },
        ],
      },
      request: {
        url: "https://a.b/settings?member=abc",
        query_string: "member=abc",
        cookies: { a: "b" },
        headers: { "User-Agent": "UA", Referer: "https://a.b/?phone=9876543210" },
      },
      user: { id: "device-1", ip_address: "1.2.3.4", username: "x" },
      extra: { phone: "9876543210" },
      server_name: "host",
      breadcrumbs: [
        { category: "console", message: "9876543210" },
        {
          category: "fetch",
          data: { method: "GET", url: "/rest/v1/x?phone=eq.9876543210", body: "secret" },
        },
      ],
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);
    expect(out.message).toBe("call [phone]");
    expect(out.exception?.values?.[0]?.value).toBe("amount ₹[n] for [bn]");
    expect(out.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: "https://a.b/assets/x.js",
      lineno: 10,
    });
    expect(out.request).toEqual({ url: "https://a.b/settings", headers: { "User-Agent": "UA" } });
    expect(out.user).toEqual({ id: "device-1" });
    expect(out.extra).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.breadcrumbs).toEqual([
      { category: "fetch", data: { method: "GET", url: "/rest/v1/x" } },
    ]);
  });

  it("drops console breadcrumbs and keeps navigation paths only", () => {
    expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull();
    expect(
      scrubBreadcrumb({ category: "navigation", data: { from: "/a?x=1", to: "/b#c" } }),
    ).toEqual({ category: "navigation", data: { from: "/a", to: "/b" } });
  });

  it("tags local and LAN hosts apart from production", () => {
    expect(environmentOf("localhost")).toBe("local");
    expect(environmentOf("192.168.1.20")).toBe("local");
    expect(environmentOf("pujo-khata.lovable.app")).toBe("production");
  });
});
