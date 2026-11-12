// Self-test A (2026-11-12) A1: "Log a call" with "Set a follow-up" on defaulted to 11:00 today,
// so after 11 AM the untouched form was refused ("The follow-up must be later than now.").
import { describe, expect, it } from "vitest";
import { followUpStart } from "@/lib/front-office/words";

describe("followUpStart: the default follow-up time is never in the past", () => {
  it("is about an hour from now, on the half hour", () => {
    expect(followUpStart("2026-11-12", 15 * 60 + 5)).toEqual({ date: "2026-11-12", time: "16:30" });
    expect(followUpStart("2026-11-12", 9 * 60)).toEqual({ date: "2026-11-12", time: "10:00" });
  });
  it("is later than now at any minute of the day", () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      const f = followUpStart("2026-11-12", m);
      const [h, mm] = f.time.split(":").map(Number);
      if (f.date === "2026-11-12") expect(h * 60 + mm).toBeGreaterThan(m);
      else expect(f.date).toBe("2026-11-13");
    }
  });
  it("late in the evening moves to 10:00 the next day, across a month end", () => {
    expect(followUpStart("2026-11-30", 23 * 60)).toEqual({ date: "2026-12-01", time: "10:00" });
  });
});
