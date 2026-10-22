// A person who works in two schools sees, picks and passes only the roles of
// the school they are in (QA PLATFORM-ROLES-01). Before the fix, a Principal of
// two schools saw "Principal" twice in Settings › Modules On/Off › AI assistant,
// and every role list or picker offered their other school's roles too.
//
// - The database wall: inside a school, a person's own School Access rows and
//   roles from another school are hidden; before a school is chosen (sign-in,
//   School switcher) they are still readable.
// - The role lists the pages use return only this school's roles.
// - A role of the other school, passed from a form, is refused.
// - A source scan fails when a role query in src/ leaves out the school.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, withUser } from "@/lib/db";
import { accessIn, schoolsFor } from "@/lib/auth/access";
import { schoolRole, schoolRoles } from "@/lib/school-roles";
import { assignableRoles, createRole, updateRole } from "@/lib/settings/roles";
import { changeAccess } from "@/lib/settings/users";
import { saveAssistant } from "@/lib/settings/switches";
import { createStaff, type StaffDetails } from "@/lib/staff/staff";
import { d, makeHrSchool } from "./staff-hr/fixture";
import { makeSchool } from "./helpers";

let f: Awaited<ReturnType<typeof makeHrSchool>>;
let b: Awaited<ReturnType<typeof makeSchool>>;
let bCustom: { id: string; key: string | null };
const inA = () => ({ schoolId: f.school.id, userId: f.principal.id });
const inB = () => ({ schoolId: b.id, userId: f.principal.id });

beforeAll(async () => {
  f = await makeHrSchool();
  b = await makeSchool("Second School");
  // The Principal of school A is also the Principal of school B, and holds a role only school B has.
  bCustom = await withSchool({ schoolId: b.id, userId: null }, async (tx) => {
    const role = await createRole(tx, { schoolId: b.id, userId: null }, { name: "Second School Coordinator", permissions: {}, requiresTwoStep: false });
    const principal = await tx.role.findFirstOrThrow({ where: { schoolId: b.id, key: "principal" } });
    await tx.schoolAccess.create({
      data: { schoolId: b.id, userLoginId: f.principal.id, roles: { create: [{ roleId: principal.id, schoolId: b.id }, { roleId: role.id, schoolId: b.id }] } },
    });
    return role;
  });
}, 60_000);

describe("the database shows a person's other school only before a school is chosen", () => {
  it("in school A, their roles and access rows from school B are hidden", async () => {
    await withSchool(inA(), async (tx) => {
      const [roles, accesses, links] = await Promise.all([tx.role.findMany(), tx.schoolAccess.findMany(), tx.schoolAccessRole.findMany()]);
      expect(roles.every((r) => r.schoolId === f.school.id)).toBe(true);
      expect(roles.filter((r) => r.key === "principal")).toHaveLength(1);
      expect(roles.some((r) => r.id === bCustom.id)).toBe(false);
      expect(accesses.every((a) => a.schoolId === f.school.id)).toBe(true);
      expect(links.every((l) => l.schoolId === f.school.id)).toBe(true);
      expect(await tx.role.findUnique({ where: { id: bCustom.id } })).toBeNull();
    });
  });

  it("sign-in and the School switcher still see both schools, each with its own roles", async () => {
    expect((await schoolsFor(f.principal.id)).map((s) => s.id).sort()).toEqual([f.school.id, b.id].sort());
    const ownRows = await withUser(f.principal.id, (tx) => tx.schoolAccess.findMany({ include: { roles: { include: { role: true } } } }));
    expect(new Set(ownRows.map((a) => a.schoolId))).toEqual(new Set([f.school.id, b.id]));
    expect(ownRows.flatMap((a) => a.roles.map((r) => r.role.id))).toContain(bCustom.id);
    const a = await accessIn(f.principal.id, f.school.id);
    expect(a!.roles.map((r) => r.name)).toEqual(["Principal"]);
    const inSecond = await accessIn(f.principal.id, b.id);
    expect(inSecond!.roles.map((r) => r.name).sort()).toEqual(["Principal", "Second School Coordinator"]);
  });
});

describe("the role lists the pages use hold only this school's roles", () => {
  it("Settings role lists, pickers and the AI assistant's roles: each role once, all from school A", async () => {
    await withSchool(inA(), async (tx) => {
      const lists = [
        await schoolRoles(tx, inA(), { where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { id: true, key: true, name: true, schoolId: true } }),
        await schoolRoles(tx, inA(), { orderBy: [{ name: "asc" }] }),
        await assignableRoles(tx, inA()),
      ];
      for (const list of lists) {
        expect(list.some((r) => r.id === bCustom.id)).toBe(false);
        const names = list.map((r) => r.name);
        expect(new Set(names).size).toBe(names.length);
      }
      expect(lists[0].every((r) => r.schoolId === f.school.id)).toBe(true);
      expect(await schoolRole(tx, inA(), { where: { key: bCustom.key } })).toBeNull();
    });
  });

  it("school B's own lists still hold its role", async () => {
    await withSchool(inB(), async (tx) => {
      expect((await schoolRoles(tx, inB(), { select: { id: true } })).map((r) => r.id)).toContain(bCustom.id);
    });
  });
});

describe("a role of the other school, sent from a form, is refused in school A", () => {
  const details = (over: Partial<StaffDetails> = {}): StaffDetails => ({
    fullName: "Cross School", phone: "9123499001", designation: "Teacher", departmentId: null, joiningDate: d("2026-10-01"), gender: "Female",
    email: null, staffCode: null, dateOfBirth: null, bloodGroup: null, aadhaar: null, address: null, permanentAddress: null, qualification: null,
    experienceYears: null, employmentType: "Permanent", reportingToId: null, campusId: null, phoneVerified: false, emailVerified: false, photoFileId: null, ...over,
  });

  it("Staff & HR › Add Staff with school B's role", async () => {
    await expect(withSchool(inA(), (tx) => createStaff(tx, inA(), details(), { roleKeys: [bCustom.key!], username: null, exceptions: {}, campusId: null }, [])))
      .rejects.toThrow(/Choose from the list/);
  });

  it("Settings › Users & Permissions: giving a person school B's role", async () => {
    await expect(withSchool(inA(), (tx) => changeAccess(tx, inA(), f.teacherLogin.id, { roleIds: [bCustom.id], scope: "WHOLE_SCHOOL", campusId: null })))
      .rejects.toThrow(/not found/);
  });

  it("Settings › Roles: changing or copying school B's role", async () => {
    await expect(withSchool(inA(), (tx) => updateRole(tx, inA(), bCustom.id, { name: "Taken over", permissions: {}, requiresTwoStep: false })))
      .rejects.toThrow(/not found/);
    const copy = await withSchool(inA(), (tx) => createRole(tx, inA(), { name: "Copied Across", permissions: {}, requiresTwoStep: false, copyFromId: bCustom.id }));
    const audit = await withSchool(inA(), (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Role", recordId: copy.id, action: "created" } }));
    expect((audit.after as { copiedFrom: string | null }).copiedFrom).toBeNull();
  });

  it("Settings › Modules On/Off › AI assistant with only school B's role", async () => {
    await expect(withSchool(inA(), (tx) => saveAssistant(tx, inA(), { on: true, roles: [bCustom.key!] }))).rejects.toThrow(/at least one role/);
  });
});

describe("every role query in src/ names the school", () => {
  const root = path.resolve(import.meta.dirname, "..", "src");
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const HELPER = path.join(root, "lib", "school-roles.ts");

  /** The text of a call from its opening bracket to the matching closing one. */
  const callText = (s: string, open: number) => {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")" && --depth === 0) return s.slice(open, i + 1);
    }
    return s.slice(open);
  };

  it("finds no tx.role read that could return another school's roles", () => {
    const bad: string[] = [];
    for (const file of files(root)) {
      if (file === HELPER) continue;
      const s = fs.readFileSync(file, "utf8");
      for (const m of s.matchAll(/\btx\.role\.(findMany|findFirst|findFirstOrThrow|findUnique|findUniqueOrThrow|count|aggregate|groupBy|updateMany)\(/g)) {
        const call = callText(s, m.index! + m[0].length - 1);
        // findUnique by id cannot name the school: use schoolRole(tx, ctx, { where: { id } }).
        if (m[1].startsWith("findUnique") || !/\bschoolId\b/.test(call)) {
          bad.push(`${path.relative(root, file)}:${s.slice(0, m.index).split("\n").length} tx.role.${m[1]}`);
        }
      }
    }
    expect(bad, "Use schoolRoles()/schoolRole() from src/lib/school-roles.ts, or add schoolId to the where").toEqual([]);
  });
});
