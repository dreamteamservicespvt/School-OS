// Role-specific screens (05-roles): a teacher ("own" reach) sees only their classes and
// never gets the list's export, add, import or settings tools; the server refuses them too.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { abilities } from "@/lib/students/access";
import { reachFor } from "@/lib/permissions";
import { studentSchool } from "./fixtures";

let s: Awaited<ReturnType<typeof studentSchool>>;
let signedIn: Awaited<ReturnType<typeof s.who>> | null = null;

vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  return {
    ...real,
    requireAction: async () => {
      if (!signedIn) throw new Error("No one is signed in");
      return { current: { ...signedIn, school: { timeZone: "Asia/Kolkata", name: "Test School" }, user: { id: signedIn.ctx.userId, displayName: "Test person" } } };
    },
  };
});

beforeAll(async () => {
  s = await studentSchool();
});

describe("own-reach roles", () => {
  it("a teacher gets no export, add, import or settings tools", async () => {
    const teacher = await s.who(s.teacherUser.id);
    const a = abilities(teacher);
    expect(a.reach).toBe("own");
    expect(a.exportList).toBe(false);
    expect(a.manage).toBe(false);
    expect(reachFor(teacher.permissions, "student-management", "export")).toBe("own");
  });

  it("the server refuses the Student List export for a teacher, and allows it for the School Admin", async () => {
    const { GET } = await import("@/app/(school)/student-management/export/route");
    signedIn = await s.who(s.teacherUser.id);
    const refused = await GET(new Request("http://localhost/student-management/export?format=csv"));
    expect(refused.status).toBe(403);
    signedIn = await s.who(s.admin.id);
    const allowed = await GET(new Request("http://localhost/student-management/export?format=csv"));
    expect(allowed.status).toBe(200);
  });
});

describe("DigiLocker-ready file", () => {
  it("is refused to a teacher, and is off until the school switches it on", async () => {
    const { GET } = await import("@/app/(school)/student-management/certificates/digilocker/route");
    signedIn = await s.who(s.teacherUser.id);
    expect((await GET(new Request("http://localhost/student-management/certificates/digilocker"))).status).toBe(403);
    signedIn = await s.who(s.admin.id);
    expect((await GET(new Request("http://localhost/student-management/certificates/digilocker"))).status).toBe(404);
  });

  it("lists only numbered certificates, one header row, safe from spreadsheet formulas", async () => {
    const { digiLockerCsv } = await import("@/lib/students/digilocker");
    const base = { type: "Bonafide certificate", issueDate: new Date("2026-10-09T00:00:00Z"), admissionNo: "SPS/2026/0001", dateOfBirth: new Date("2014-03-02T00:00:00Z"), gender: "Male", apaarId: null, className: "Class 7 B", purpose: "Bank account" };
    const csv = digiLockerCsv([
      { ...base, number: "BON/2026/0142", studentName: "Aarav Sharma" },
      { ...base, number: null, studentName: "Not issued" },
      { ...base, number: "BON/2026/0143", studentName: "=HYPERLINK(1)" },
    ], "Asia/Kolkata");
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Document number,Document type,Issue date/);
    expect(lines[1]).toContain("BON/2026/0142,Bonafide certificate,09-10-2026,Aarav Sharma,02-03-2014");
    expect(lines[2]).toContain("'=HYPERLINK(1)");
  });
});
