// Layman test D (docs/qa/2026-11-12-layman-D.md), Staff & HR part:
// LD3 expired documents count as Expired, LD5 staff age 18 to 80,
// LD11 appraisal points follow the staff type, LD13 a role without
// Staff & HR (or Admission, Attendance) gets a 403 from its file addresses, not a blank 500.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    getCurrent: requireCurrent,
    requireCurrent,
    requirePage: requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});

import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { parseForm } from "@/lib/forms";
import { ageOn, detailsSchema, personalSchema, staffAgeProblem } from "@/lib/staff/schemas";
import { staffAgeWarningFor } from "@/lib/staff/age";
import { docStatus } from "@/lib/staff/documents";
import { saveReview, startCycle } from "@/lib/staff/talent";
import { pointsOf, STAFF_CRITERIA, TEACHING_CRITERIA } from "@/lib/staff/criteria";
import { GET as staffExport } from "@/app/(school)/staff-hr-management/export/route";
import { GET as idCards } from "@/app/(school)/staff-hr-management/id-cards/route";
import { GET as enquiryExport } from "@/app/(school)/admission-management/enquiries/export/route";
import { GET as registerExport } from "@/app/(school)/attendance-management/register/export/route";
import { GET as leaveExport } from "@/app/(school)/attendance-management/student-leave/export/route";
import { d, makeHrSchool } from "./fixture";
import { makeUser } from "../helpers";

const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  const v = {
    fullName: "Meena Rao", phone: "9123400001", designation: "Teacher", departmentId: "", joiningDate: "2026-11-12", gender: "Female", email: "", staffCode: "",
    dateOfBirth: "", bloodGroup: "", aadhaar: "", address: "", permanentAddress: "", qualification: "", experienceYears: "", employmentType: "Permanent", reportingToId: "", campusId: "", ...over,
  };
  for (const [k, x] of Object.entries(v)) fd.set(k, x);
  return fd;
};
const yearsAgo = (n: number, days = 0) => {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear() - n, t.getUTCMonth(), t.getUTCDate() + days)).toISOString().slice(0, 10);
};

describe("staff date of birth (LD5)", () => {
  it("refuses a date of birth that makes them 1 year old, on Add Staff and on the profile", () => {
    const r = parseForm(detailsSchema, form({ dateOfBirth: yearsAgo(1) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.state.errors?.dateOfBirth).toBe("This date of birth makes them 1 year old. Check the year of birth.");
    const p = new FormData();
    for (const [k, v] of Object.entries({ fullName: "Meena Rao", dateOfBirth: yearsAgo(1), gender: "", bloodGroup: "", address: "", permanentAddress: "", qualification: "", experienceYears: "" })) p.set(k, v);
    expect(parseForm(personalSchema, p).ok).toBe(false);
  });

  it("refuses an age that cannot be right (under 14, over 100) and takes an unusual one with a warning", () => {
    expect(parseForm(detailsSchema, form({ dateOfBirth: yearsAgo(18) })).ok).toBe(true);
    expect(parseForm(detailsSchema, form({ dateOfBirth: yearsAgo(16) })).ok).toBe(true);
    expect(parseForm(detailsSchema, form({ dateOfBirth: yearsAgo(14, 1) })).ok).toBe(false);
    const old = parseForm(detailsSchema, form({ dateOfBirth: "1920-01-01" }));
    expect(old.ok).toBe(false);
    if (!old.ok) expect(old.state.errors?.dateOfBirth).toMatch(/makes them 10\d years old/);
    expect(parseForm(detailsSchema, form({ dateOfBirth: "1940-06-15" })).ok).toBe(true);
    expect(parseForm(detailsSchema, form({ dateOfBirth: "1985-06-15" })).ok).toBe(true);
    expect(staffAgeWarningFor("2010-06-15", "2026-11-13")).toBe("This makes them 16 years old. Check the year of birth; if it is right, carry on.");
    expect(staffAgeWarningFor("1940-06-15", "2026-11-13")).toMatch(/86 years old/);
    expect(staffAgeWarningFor("1985-06-15", "2026-11-13")).toBeNull();
    expect(staffAgeWarningFor("2025-01-01", "2026-11-13")).toBeNull(); // refused instead
  });

  it("counts whole years", () => {
    expect(ageOn(d("2008-11-12"), d("2026-11-12"))).toBe(18);
    expect(ageOn(d("2008-11-13"), d("2026-11-12"))).toBe(17);
    expect(staffAgeProblem(null)).toBeNull();
  });
});

describe("document status (LD3)", () => {
  const today = d("2026-11-12");
  it("is Expired when the expiry has passed, even with no file collected", () => {
    expect(docStatus({ fileId: null, expiresOn: d("2026-09-30") }, today)).toBe("Expired");
    expect(docStatus({ fileId: "x", expiresOn: d("2026-09-30") }, today)).toBe("Expired");
  });
  it("is Missing only when no file was collected and it has not expired", () => {
    expect(docStatus({ fileId: null, expiresOn: null }, today)).toBe("Missing");
    expect(docStatus({ fileId: null, expiresOn: d("2027-03-31") }, today)).toBe("Missing");
    expect(docStatus({ fileId: "x", expiresOn: d("2026-11-20") }, today)).toBe("Expiring soon");
    expect(docStatus({ fileId: "x", expiresOn: null }, today)).toBe("Valid");
  });
});

let f: Awaited<ReturnType<typeof makeHrSchool>>;
beforeAll(async () => { f = await makeHrSchool(); }, 120_000);
const as = (userId: string | null) => ({ schoolId: f.school.id, userId });

describe("appraisal points by staff type (LD11)", () => {
  it("rates a non-teaching staff member on the other staff's points, a teacher on the teachers'", async () => {
    const driver = await withSchool(as(f.admin.id), (tx) => tx.staff.create({
      data: { schoolId: f.school.id, campusId: f.teacher.campusId, staffCode: "LD-DRV-1", firstName: "Ramu", fullName: "Ramu Driver", phone: "9123499001", designation: "Driver", staffType: "Non-teaching", joiningDate: d("2025-06-01") },
    }));
    const cycle = await withSchool(as(f.admin.id), (tx) => startCycle(tx, as(f.admin.id), { name: "LD appraisal", academicYearId: f.year.id, criteria: TEACHING_CRITERIA, staffCriteria: STAFF_CRITERIA, startDate: d("2026-11-01"), endDate: d("2026-12-31") }));
    const [mine, teacher] = await withSchool(as(f.admin.id), (tx) => Promise.all([
      tx.appraisal.findFirstOrThrow({ where: { cycleId: cycle.id, staffId: driver.id }, include: { cycle: true } }),
      tx.appraisal.findFirstOrThrow({ where: { cycleId: cycle.id, staffId: f.teacher.id }, include: { cycle: true } }),
    ]));
    expect(pointsOf(mine, mine.cycle)).toEqual(STAFF_CRITERIA);
    expect(pointsOf(mine, mine.cycle)).not.toContain("Classroom teaching");
    expect(pointsOf(teacher, teacher.cycle)).toEqual(TEACHING_CRITERIA);
    // The self review is checked against the driver's own points.
    const ratings = Object.fromEntries(STAFF_CRITERIA.map((c) => [c, 4]));
    await withSchool(as(f.admin.id), (tx) => saveReview(tx, as(f.admin.id), mine.id, "self", ratings, null));
    await expect(withSchool(as(f.admin.id), (tx) => saveReview(tx, as(f.admin.id), teacher.id, "self", ratings, null))).rejects.toThrow(/Rate "Subject knowledge"/);
  });

  it("keeps an older appraisal (no points of its own) on the cycle's points", () => {
    expect(pointsOf({ criteria: [] }, { criteria: ["Punctuality"] })).toEqual(["Punctuality"]);
  });
});

describe("Staff & HR file addresses for a role without the module (LD13)", () => {
  it("answer 403, not a blank 500", async () => {
    const driver = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["driver"] }], name: "Bus Driver" });
    const access = await accessIn(driver.id, f.school.id);
    who.current = { ...access!, ctx: { schoolId: f.school.id, userId: driver.id }, user: { id: driver.id, displayName: "Bus Driver" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
    const csv = await staffExport(new Request("http://localhost/staff-hr-management/export?format=csv"));
    expect(csv.status).toBe(403);
    expect(await csv.text()).toBe("Your role cannot export from Staff & HR Management.");
    expect((await idCards(new Request("http://localhost/staff-hr-management/id-cards"))).status).toBe(403);
    // The same for other modules' file addresses the Driver has no part in (src/lib/route-access.ts).
    for (const res of [
      await enquiryExport(new Request("http://localhost/admission-management/enquiries/export?format=csv")),
      await registerExport(new Request("http://localhost/attendance-management/register/export?format=csv")),
      await leaveExport(new Request("http://localhost/attendance-management/student-leave/export?format=csv")),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.text()).toMatch(/^Your role/);
    }
  });
});
