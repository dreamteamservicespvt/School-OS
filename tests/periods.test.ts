// The date filters every list and report uses (lib/periods.ts).
import { describe, expect, it } from "vitest";
import { dayStartUtc, momentWhere, periodRange, rangeWords } from "@/lib/periods";

// 12 Oct 2026 is a Monday; 00:30 in India is still 11 Oct in UTC.
const now = new Date("2026-10-11T19:00:00Z");
const opts = { timeZone: "Asia/Kolkata", now };
const r = (period: string, extra: Record<string, string> = {}) => periodRange({ period, ...extra }, opts);

describe("date periods", () => {
  it("use the school's day, not the server's", () => {
    expect(r("today")).toMatchObject({ from: "2026-10-12", to: "2026-10-12", label: "Today" });
    expect(r("yesterday")).toMatchObject({ from: "2026-10-11", to: "2026-10-11" });
  });

  it("count the last N days including today", () => {
    expect(r("2d")).toMatchObject({ from: "2026-10-11", to: "2026-10-12" });
    expect(r("3d")).toMatchObject({ from: "2026-10-10", to: "2026-10-12" });
    expect(r("7d")).toMatchObject({ from: "2026-10-06", to: "2026-10-12" });
    expect(r("30d")).toMatchObject({ from: "2026-09-13", to: "2026-10-12" });
  });

  it("know weeks, months, quarters, years and the April financial year", () => {
    expect(r("week")).toMatchObject({ from: "2026-10-12", to: "2026-10-12" });
    expect(r("lastweek")).toMatchObject({ from: "2026-10-05", to: "2026-10-11" });
    expect(periodRange({ period: "week" }, { ...opts, weekStart: "sunday" })).toMatchObject({ from: "2026-10-11" });
    expect(r("month")).toMatchObject({ from: "2026-10-01", to: "2026-10-12" });
    expect(r("lastmonth")).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(r("quarter")).toMatchObject({ from: "2026-10-01" });
    expect(r("year")).toMatchObject({ period: "calyear", from: "2026-01-01", to: "2026-12-31" });
    expect(r("lastyear")).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
    expect(r("fy")).toMatchObject({ period: "finyear", from: "2026-04-01", to: "2027-03-31" });
    expect(r("lastfy")).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(periodRange({ period: "lastmonth" }, { timeZone: "Asia/Kolkata", now: new Date("2026-01-15T06:00:00Z") })).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("take any From and To dates, swapped if typed backwards, and ignore bad ones", () => {
    expect(periodRange({ from: "2026-09-01", to: "2026-09-15" }, opts)).toMatchObject({ period: "custom", from: "2026-09-01", to: "2026-09-15", label: "Custom dates" });
    expect(periodRange({ period: "custom", from: "2026-09-15", to: "2026-09-01" }, opts)).toMatchObject({ from: "2026-09-01", to: "2026-09-15" });
    expect(periodRange({ period: "custom", from: "2026-02-30" }, opts)).toBeNull();
    expect(periodRange({ period: "nonsense" }, opts)).toBeNull();
    expect(periodRange({}, { ...opts, fallback: "thismonth" })).toMatchObject({ period: "thismonth" });
    expect(periodRange({ period: "nonsense" }, { ...opts, fallback: "today" })).toMatchObject({ period: "today" });
  });

  it("read the old words for the same periods", () => {
    expect(r("2d")).toMatchObject({ period: "last2" });
    expect(r("week")).toMatchObject({ period: "thisweek" });
    expect(r("month")).toMatchObject({ period: "thismonth" });
    expect(r("lastfy")).toMatchObject({ period: "lastfinyear" });
  });

  it("know the approved design's ranges: 15 days, 3 and 6 months, coming up", () => {
    expect(r("last15")).toMatchObject({ from: "2026-09-28", to: "2026-10-12", label: "Last 15 days" });
    expect(r("last3m")).toMatchObject({ from: "2026-08-01", to: "2026-10-12" });
    expect(r("last6m")).toMatchObject({ from: "2026-05-01", to: "2026-10-12" });
    expect(r("tomorrow")).toMatchObject({ from: "2026-10-13", to: "2026-10-13" });
    expect(r("next7")).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
    expect(r("nextmonth")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("show one whole month", () => {
    expect(r("month", { from: "2025-06" })).toMatchObject({ period: "month", from: "2025-06-01", to: "2025-06-30", label: "June 2025", month: "2025-06" });
    expect(r("m-2024-02")).toMatchObject({ from: "2024-02-01", to: "2024-02-29" });
    expect(r("month", { from: "2025-13" })).toBeNull();
  });

  it("use the school's own terms and academic years", () => {
    expect(r("acyear")).toMatchObject({ from: "2026-06-01", to: "2027-03-31" });
    expect(r("lastacyear")).toMatchObject({ from: "2025-06-01", to: "2026-03-31" });
    expect(r("term")).toBeNull();
    const calendar = {
      year: { name: "2026–27", from: "2026-04-01", to: "2027-03-31" },
      lastYear: { name: "2025–26", from: "2025-04-01", to: "2026-03-31" },
      term: { name: "Term 1", from: "2026-04-01", to: "2026-10-15" },
      nextTerm: { name: "Term 2", from: "2026-10-16", to: "2027-03-31" },
    };
    const c = (period: string) => periodRange({ period }, { ...opts, calendar });
    expect(c("acyear")).toMatchObject({ from: "2026-04-01" });
    expect(c("lastacyear")).toMatchObject({ to: "2026-03-31" });
    expect(c("term")).toMatchObject({ from: "2026-04-01", to: "2026-10-15", label: "This term" });
    expect(c("nextterm")).toMatchObject({ from: "2026-10-16", label: "Term 2" });
  });

  it("turn days into moments in the school's zone", () => {
    expect(dayStartUtc("2026-10-12", "Asia/Kolkata").toISOString()).toBe("2026-10-11T18:30:00.000Z");
    const w = momentWhere(r("today")!, "Asia/Kolkata");
    expect(w.lt.getTime() - w.gte.getTime()).toBe(86_400_000);
  });

  it("say ranges in words", () => {
    expect(rangeWords("2026-10-12", "2026-10-12")).toBe("12 Oct 2026");
    expect(rangeWords("2026-09-28", "2026-10-03")).toBe("28 Sep – 3 Oct 2026");
    expect(rangeWords("2025-12-28", "2026-01-03")).toBe("28 Dec 2025 – 3 Jan 2026");
  });
});
