// Admission Management widgets on the Dashboard: the Receptionist sees only
// the enquiries they own or added, the admission team sees every enquiry and
// the applications waiting for a decision, and another school's admissions
// never show. Each number is the same filter as the list it opens.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { admissionSchool, day } from "../admission/fixtures";

const NOW = new Date("2026-10-12T06:30:00Z"); // Monday 12:00 noon in India
const HOUR = 3_600_000;
type School = Awaited<ReturnType<typeof admissionSchool>>;

async function seed(s: School, opts: { mine: number; others: number; late: number; deciding: number }) {
  await withSchool({ schoolId: s.school.id, userId: null }, async (tx) => {
    let i = 0;
    const enquiry = (owner: string, createdById: string, extra: { nextFollowUpAt?: Date; createdAt?: Date }) => {
      i++;
      return tx.enquiry.create({ data: { schoolId: s.school.id, campusId: s.campusId, academicYearId: s.nextYearId, childName: `Child ${i}`, parentName: `Parent ${i}`, phone: `98765${String(10000 + i)}`, classId: s.c1, source: "walk-in", firstSource: "walk-in", ownerStaffId: owner, createdById, createdAt: extra.createdAt ?? new Date(NOW.getTime() - HOUR), nextFollowUpAt: extra.nextFollowUpAt } });
    };
    for (let k = 0; k < opts.mine; k++) await enquiry(s.frontdeskStaff, s.frontdesk.id, { nextFollowUpAt: k < opts.late ? new Date(NOW.getTime() - 2 * HOUR) : new Date(NOW.getTime() + 3 * HOUR) });
    for (let k = 0; k < opts.others; k++) await enquiry(s.counsellorStaff, s.counsellor.id, { nextFollowUpAt: new Date(NOW.getTime() - 5 * HOUR) });
    // An old enquiry: not "new this week".
    await enquiry(s.counsellorStaff, s.counsellor.id, { createdAt: new Date(NOW.getTime() - 20 * 24 * HOUR) });
    for (let k = 0; k < opts.deciding; k++) {
      await tx.application.create({ data: { schoolId: s.school.id, campusId: s.campusId, academicYearId: s.nextYearId, applicationNo: `APP-${k}`, classId: s.c1, firstName: `Applicant${k}`, fullName: `Applicant ${k}`, dateOfBirth: day("2021-01-01"), gender: "Male", phone: `9876600${String(100 + k)}`, address: "Hyderabad", stage: "DECISION" } });
    }
  });
}

let s: School, other: School;
let principal: Current, frontdesk: Current, teacher: Current;
const current = async (school: School, u: { id: string; displayName?: string }) => {
  const access = await accessIn(u.id, school.school.id);
  return { ...access!, ctx: { schoolId: school.school.id, userId: u.id }, user: { id: u.id, displayName: "Test Person" }, menu: [], schools: [], session: null } as unknown as Current;
};

beforeAll(async () => {
  s = await admissionSchool();
  // Front desk: 3 own enquiries (1 late). Counsellor: 2 late ones. 2 applications to decide.
  await seed(s, { mine: 3, others: 2, late: 1, deciding: 2 });
  other = await admissionSchool("Other Admission School");
  await seed(other, { mine: 9, others: 9, late: 9, deciding: 9 });
  [principal, frontdesk, teacher] = await Promise.all([current(s, s.principal), current(s, s.frontdesk), current(s, s.teacher)]);
}, 180_000);

describe("admissions.new-enquiries", () => {
  it("the Receptionist counts only their own enquiries", async () => {
    const b = (await buildHome(frontdesk, { now: NOW })).band.find((x) => x.id === "admissions.new-enquiries");
    expect(b?.label).toBe("My new enquiries");
    expect(b?.big).toBe("3");
    expect(b?.foot).toBe("This week · 3 follow-ups today"); // the list's "Follow-up today" includes the late one from this morning
    expect(b?.href).toBe("/admission-management/enquiries?quick=new-week");
  });

  it("the Principal counts every enquiry of this school only", async () => {
    const b = (await buildHome(principal, { now: NOW })).band.find((x) => x.id === "admissions.new-enquiries");
    expect(b?.big).toBe("5");
  });
});

describe("admissions.follow-ups", () => {
  it("the Receptionist hears only about their own late follow-ups", async () => {
    const a = (await buildHome(frontdesk, { now: NOW })).attention.find((x) => x.id.startsWith("admissions.follow-ups"));
    expect(a?.title).toBe("1 enquiry follow-up of yours past the time set");
    expect(a?.detail).not.toMatch(/Child 4|Child 5/);
    expect(a?.href).toBe("/admission-management/enquiries?quick=overdue");
  });

  it("the Principal sees every late follow-up of this school, none of another's", async () => {
    const a = (await buildHome(principal, { now: NOW })).attention.find((x) => x.id.startsWith("admissions.follow-ups"));
    expect(a?.value).toBe("3");
  });
});

describe("admissions.pending-applications", () => {
  it("only the admission team sees applications; the Receptionist does not", async () => {
    expect((await buildHome(frontdesk, { now: NOW })).attention.some((x) => x.id === "admissions.pending-applications")).toBe(false);
    const a = (await buildHome(principal, { now: NOW })).attention.find((x) => x.id === "admissions.pending-applications");
    expect(a?.title).toBe("2 applications waiting for a decision");
    expect(a?.href).toBe("/admission-management/applications?stage=DECISION");
  });

  it("a teacher, who has no Admission Management, gets no admission widgets at all", async () => {
    const h = await buildHome(teacher, { now: NOW });
    expect([...h.band, ...h.attention].some((x) => x.id.startsWith("admissions."))).toBe(false);
  });
});
