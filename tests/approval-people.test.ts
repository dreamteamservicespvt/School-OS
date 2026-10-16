// Approvals show who is asking and why (owner's prototype changes of 13 Oct
// 2026): the asker's job, the reason, and links to the staff or student
// profile, only for viewers whose role may open those profiles; the home
// approval card carries the same job and reason.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { requestApproval } from "@/lib/approvals";
import { askerJobs, profileLinks } from "@/lib/approval-people";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { combineRoles } from "@/lib/permissions";
import { as, makeAttendanceSchool, type Fixture } from "./attendance/fixture";

let f: Fixture;
let approval: { id: string; askedById: string; recordType: string; recordId: string };
const perms = (key: string) => combineRoles([ALL_ROLE_TEMPLATES.find((r) => r.key === key)!.permissions]);

beforeAll(async () => {
  f = await makeAttendanceSchool("Approval People School");
  approval = await withSchool(as(f, f.teacherA.id), (tx) => requestApproval(tx, as(f, f.teacherA.id), {
    type: "re-admission", recordType: "Student", recordId: f.studentsA[0].id, summary: "Re-admit Aarav Sharma", reason: "Family moved back to the city",
  }));
}, 120_000);

describe("Who is asking", () => {
  it("names the asker's job and their class, and keeps the reason", async () => {
    const jobs = await withSchool(as(f, f.principal.id), (tx) => askerJobs(tx, [f.teacherA.id, f.admin.id]));
    expect(jobs.get(f.teacherA.id)).toBe("Teacher · Class teacher, Class 5 A");
    // No staff record: their roles.
    expect(jobs.get(f.admin.id)).toBe("School Admin");
    const a = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findUniqueOrThrow({ where: { id: approval.id } }));
    expect(a.reason).toBe("Family moved back to the city");
  });

  it("links the Principal to the asker's staff profile and the student's profile", async () => {
    const links = await withSchool(as(f, f.principal.id), (tx) => profileLinks(tx, perms("principal"), approval));
    expect(links.map((l) => l.href)).toEqual([`/staff-hr-management/${f.staffA.id}`, `/student-management/students/${f.studentsA[0].id}`]);
    expect(links[0].label).toBe("Open Ravi’s profile");
  });

  it("gives no staff profile link to a role that cannot open staff profiles", async () => {
    const links = await withSchool(as(f, f.teacherB.id), (tx) => profileLinks(tx, perms("class-teacher"), approval));
    expect(links.some((l) => l.kind === "staff")).toBe(false);
  });
});
