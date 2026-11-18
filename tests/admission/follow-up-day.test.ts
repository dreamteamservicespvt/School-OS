// A follow-up due today is "today" all day, on every screen that counts it: the Dashboard card, the
// Admission Dashboard (the band, "Today's follow-ups", the pipeline card), the Enquiries list's quick
// filters and the Follow-up report. It turns overdue only when the day has ended in the school's time
// zone. Live test 17 Nov 2026 (Principal): the Dashboard said "1 follow-up today" while the Admission
// Dashboard said "4 overdue · 0 today" and "Follow-up overdue, was due 17-11-2026" on 17-11-2026.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { readListParams } from "@/lib/list";
import { buildHome } from "@/lib/dashboard/compose";
import { headline, pipeline } from "@/lib/admission/dashboard";
import { followUps, report } from "@/lib/admission/reports";
import { enquiryWhere, ENQUIRY_FILTERS } from "@/lib/admission/list";
import { names } from "@/lib/admission/choices";
import type { Current } from "@/lib/current";
import { admissionSchool } from "./fixtures";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-10-12T09:30:00Z"); // Monday 12 October 2026, 3:00 PM in India
const DAY_START = new Date("2026-10-11T18:30:00Z"); // 12 October, midnight in India
const DAY = 86_400_000;
const india = (local: string) => new Date(`${local}:00+05:30`);

type School = Awaited<ReturnType<typeof admissionSchool>>;
let s: School;
let who: Awaited<ReturnType<School["who"]>>;
let principal: Current;

beforeAll(async () => {
  s = await admissionSchool("Follow-up Day School");
  await withSchool({ schoolId: s.school.id, userId: null }, async (tx) => {
    const enquiry = (childName: string, nextFollowUpAt: Date, i: number) =>
      tx.enquiry.create({ data: { schoolId: s.school.id, campusId: s.campusId, academicYearId: s.nextYearId, childName, parentName: `Parent ${i}`, phone: `98765${String(20000 + i)}`, classId: s.c1, source: "walk-in", firstSource: "walk-in", ownerStaffId: s.counsellorStaff, createdById: s.counsellor.id, createdAt: new Date(NOW.getTime() - 2 * DAY + i * 60_000), nextFollowUpAt } });
    await enquiry("Yesterday Child", india("2026-10-11T16:00"), 1); // its day is over: overdue
    await enquiry("Morning Child", india("2026-10-12T11:00"), 2); // today, the time has passed: still today
    await enquiry("Evening Child", india("2026-10-12T17:00"), 3); // today, later
    await enquiry("Tomorrow Child", india("2026-10-13T10:00"), 4);
  });
  who = await s.who(s.principal);
  const access = await accessIn(s.principal.id, s.school.id);
  principal = { ...access!, ctx: { schoolId: s.school.id, userId: s.principal.id }, user: { id: s.principal.id, displayName: "Test Person" }, menu: [], schools: [], session: null } as unknown as Current;
}, 180_000);

const f = () => ({ yearId: s.nextYearId });
const read = <T>(fn: (tx: Parameters<Parameters<typeof withSchool>[1]>[0]) => Promise<T>) => withSchool(who.ctx, fn);

describe("a follow-up due today stays today until the day ends", () => {
  it("Admission Dashboard band: 1 overdue (yesterday's), 2 today (the 11:00 one too, at 3:00 PM)", async () => {
    const band = await read((tx) => headline(tx, who.v, f(), DAY_START, NOW));
    expect({ overdue: band.overdue, today: band.today }).toEqual({ overdue: 1, today: 2 });
  });

  it("Today's follow-ups: the same people under Overdue, Due today and Due tomorrow", async () => {
    const fu = await read((tx) => followUps(tx, who.v, f(), DAY_START));
    expect(fu.overdueCount).toBe(1);
    expect(fu.overdue.map((e) => e.childName)).toEqual(["Yesterday Child"]);
    expect(fu.today.map((e) => e.childName)).toEqual(["Morning Child", "Evening Child"]);
    expect(fu.tomorrow.map((e) => e.childName)).toEqual(["Tomorrow Child"]);
  });

  it("the pipeline card says overdue only for the day that is over", async () => {
    const cols = await read(async (tx) => pipeline(tx, who.s, who.v, f(), await names(tx), 10, TZ, NOW));
    const fact = (name: string) => cols.find((c) => c.key === "enq")!.cards.find((c) => c.name === name)!.fact;
    expect(fact("Yesterday Child").k).toBe("Follow-up overdue, was due {date}");
    expect(fact("Yesterday Child").vars).toEqual({ date: "11-10-2026" });
    expect(fact("Morning Child").k).toBe("Follow up {date}");
    expect(fact("Morning Child").tone).toBeUndefined();
    expect(fact("Evening Child").k).toBe("Follow up {date}");
  });

  it("Enquiries list: 'Follow-up today' and 'Overdue' count the same enquiries as the dashboards", async () => {
    const count = (quick: string) => read((tx) => tx.enquiry.count({ where: enquiryWhere(readListParams({ quick }, ENQUIRY_FILTERS), who.v, { yearId: s.nextYearId, timeZone: TZ, now: NOW }) }));
    expect(await count("today")).toBe(2);
    expect(await count("overdue")).toBe(1);
  });

  it("the Follow-up report counts overdue by the day too", async () => {
    const r = await read(async (tx) => report(tx, who.s, who.v, "follow-ups", f(), await names(tx), NOW));
    expect(r.rows.reduce((sum, row) => sum + Number(row.overdue), 0)).toBe(1);
  });

  it("the Dashboard says the same as the Admission Dashboard: 2 follow-ups today, 1 past its day", async () => {
    const home = await buildHome(principal, { now: NOW });
    expect(home.band.find((b) => b.id === "admissions.new-enquiries")?.foot).toBe("This week · 2 follow-ups today");
    const card = home.attention.find((a) => a.id.startsWith("admissions.follow-ups"));
    expect(card?.id).toBe("admissions.follow-ups-late");
    expect(card?.value).toBe("1");
    expect(card?.detail).toContain("Parent 1 (Yesterday Child)");
    expect(card?.detail).toContain("2 due today");
    expect(card?.href).toBe("/admission-management/enquiries?quick=overdue");
  });

  it("when the day has ended, today's follow-ups are overdue", async () => {
    const next = { start: new Date(DAY_START.getTime() + DAY), now: new Date(NOW.getTime() + DAY) };
    const band = await read((tx) => headline(tx, who.v, f(), next.start, next.now));
    expect({ overdue: band.overdue, today: band.today }).toEqual({ overdue: 3, today: 1 });
  });

  it("one rule for every screen: the day, in the school's time zone (followUpDay, followUpDue)", async () => {
    const { followUpDay, followUpDue } = await import("@/lib/admission/follow-up-day");
    const day = followUpDay(TZ, NOW);
    expect(day.start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-12T18:30:00.000Z");
    expect(followUpDue(india("2026-10-11T23:59"), day)).toBe("overdue");
    expect(followUpDue(india("2026-10-12T00:00"), day)).toBe("today");
    expect(followUpDue(india("2026-10-12T11:00"), day)).toBe("today");
    expect(followUpDue(india("2026-10-12T23:59"), day)).toBe("today");
    expect(followUpDue(india("2026-10-13T00:00"), day)).toBe("later");
    // The school's day, not the server's: 1:00 AM on the 13th in India is still the 12th in UTC.
    expect(followUpDay(TZ, india("2026-10-12T23:30")).start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(followUpDay(TZ, india("2026-10-13T01:00")).start.toISOString()).toBe("2026-10-12T18:30:00.000Z");
  });

  it("the Enquiries list page marks and counts overdue with that same rule, not by the minute", () => {
    const src = readFileSync("src/app/(school)/admission-management/enquiries/page.tsx", "utf8");
    expect(src).not.toMatch(/nextFollowUpAt: \{ lt: now \}/);
    expect(src).not.toMatch(/nextFollowUpAt < now \? "overdue"/);
    expect(src.match(/followUpDue\(/g)?.length).toBe(2);
  });
});
