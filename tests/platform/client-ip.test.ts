// QA (Chaitanya EM School audit), PLATFORM-05 / ACADEMICS-05: the sign-in limit
// took the first X-Forwarded-For entry, which the visitor writes, so a new fake
// address on every try skipped the limit.
import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";

const headers = (h: Record<string, string>) => (n: string) => h[n] ?? null;

describe("client address", () => {
  it("ignores what the visitor put in front of the proxy's entry", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), 1)).toBe("203.0.113.9");
  });
  it("counts two proxies from the right", () => {
    expect(clientIp(headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.9, 10.0.0.2" }), 2)).toBe("203.0.113.9");
  });
  it("uses X-Real-IP when there is no forwarded list", () => {
    expect(clientIp(headers({ "x-real-ip": "203.0.113.9" }), 1)).toBe("203.0.113.9");
  });
  it("trusts no header when no proxy is in front", () => {
    expect(clientIp(headers({ "x-forwarded-for": "1.1.1.1" }), 0)).toBeNull();
  });
});
