import { describe, expect, it } from "vitest";
import { hitLimit } from "@/lib/rate-limit";
import { scrub } from "@/lib/errors";

describe("limits against abuse", () => {
  it("allows up to the limit in one window, then asks to wait", async () => {
    const key = `test:${Math.random()}`;
    const now = new Date("2026-10-09T10:00:05Z");
    for (let i = 0; i < 3; i++) expect((await hitLimit(key, 3, 60, now)).ok).toBe(true);
    const over = await hitLimit(key, 3, 60, now);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.retryAfterSeconds).toBe(55);
  });
  it("starts counting again in the next window", async () => {
    const key = `test:${Math.random()}`;
    await hitLimit(key, 1, 60, new Date("2026-10-09T10:00:00Z"));
    expect((await hitLimit(key, 1, 60, new Date("2026-10-09T10:00:30Z"))).ok).toBe(false);
    expect((await hitLimit(key, 1, 60, new Date("2026-10-09T10:01:00Z"))).ok).toBe(true);
  });
});

describe("error records", () => {
  it("never keep phone numbers, emails or ids", () => {
    const text = scrub("Failed for 9876543210 ravi@example.com at /students/0b6c9a52-8f0e-4a8e-9f8a-3e1d2c4b5a69");
    expect(text).not.toMatch(/9876543210|ravi@|0b6c9a52/);
    expect(text).toContain("/students/:id");
  });
});
