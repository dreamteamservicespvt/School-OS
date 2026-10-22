// Sensitive fields per role (20-settings.md "One role": normal, restricted,
// highly restricted; 00-global.md §5; 05-roles.md "Sensitive details are hidden";
// gap list G45). A role the school has not set keeps what it saw before, module
// by module. A School Admin may set a role's level only up to what 05-roles.md
// allows it; the change is in the audit log, every School Admin is told, and it
// can be put back. Two-step login per role is set on the same page (already built).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { restoreRoleVersion, updateRole } from "@/lib/settings/roles";
import { abilities } from "@/lib/students/access";
import { canSeeRestricted } from "@/lib/staff/access";
import { visibleFields } from "@/lib/custom-fields";
import { levelsForRole, mostForRole, seesHighlyRestricted, seesRestricted, sensitiveChoices } from "@/lib/sensitive";
import type { PermissionMap } from "@/lib/permissions";
import type { RolePermissions } from "@/lib/roles";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };
let otherAdmin: { id: string };
const ctx = () => ({ schoolId: school.id, userId: admin.id });
const role = (key: string) => withSchool(ctx(), (tx) => tx.role.findFirstOrThrow({ where: { key } }));
const keep = async (key: string, sensitiveFields: "normal" | "restricted" | "highly-restricted" | null) => {
  const r = await role(key);
  return withSchool(ctx(), (tx) => updateRole(tx, ctx(), r.id, { name: r.name, permissions: r.permissions as RolePermissions, requiresTwoStep: r.requiresTwoStep, sensitiveFields }));
};

beforeAll(async () => {
  school = await makeSchool("Sensitive Fields School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Lakshmi" });
  otherAdmin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Ravi" });
});

describe("what each role may be given (05-roles.md)", () => {
  it("Gate Security, Driver and Student see nothing sensitive; the Accountant never sees counselling; the Counsellor, Principal, School Admin and the school's own roles may", () => {
    for (const key of ["gate-security", "driver", "student"]) expect(levelsForRole({ key })).toEqual(["normal"]);
    for (const key of ["accountant", "office-staff", "teacher", "hr", "vice-principal"]) expect(mostForRole({ key })).toBe("restricted");
    for (const key of ["counsellor", "principal", "school-admin"]) expect(mostForRole({ key })).toBe("highly-restricted");
    expect(mostForRole({ key: "custom-1a2b3c4d", kind: "CUSTOM" })).toBe("highly-restricted");
    expect(sensitiveChoices({ key: "accountant" }).map((c) => c.label)).toEqual(["As before", "Normal", "Restricted"]);
  });
});

describe("a role the school has not set", () => {
  it("sees what it saw before, module by module", () => {
    const students = ["school-admin", "principal"];
    expect(seesRestricted([{ key: "principal" }], students)).toBe(true);
    expect(seesRestricted([{ key: "hr" }], students)).toBe(false);
    expect(canSeeRestricted([{ key: "hr" }])).toBe(true);
    expect(canSeeRestricted([{ key: "teacher", sensitive: null }])).toBe(false);
    expect(seesHighlyRestricted([{ key: "principal" }], (k) => ["counsellor", "principal"].includes(k))).toBe(true);
  });
});

describe("a role with its level set", () => {
  const full: PermissionMap = { "student-management": { see: "all", change: "all" } } as PermissionMap;
  const who = (roles: { key: string; sensitive?: "normal" | "restricted" | "highly-restricted" | null }[]) => ({ ctx: { schoolId: "x", userId: null }, permissions: full, roles });
  const counselling = { counsellingOn: true, counsellingRoles: ["counsellor", "principal"] };

  it("Normal hides ID numbers, bank details, restricted extra fields and counselling, even from the Principal", () => {
    const a = abilities(who([{ key: "principal", sensitive: "normal" }]), counselling);
    expect(a.seeRestricted).toBe(false);
    expect(a.seeCounselling).toBe(false);
    expect(canSeeRestricted([{ key: "principal", sensitive: "normal" }])).toBe(false);
    const fields = [{ key: "a", visibility: "everyone" }, { key: "b", visibility: "restricted" }];
    expect(visibleFields(fields, [{ key: "principal", sensitive: "normal" }]).map((f) => f.key)).toEqual(["a"]);
    expect(visibleFields(fields, [{ key: "principal" }]).map((f) => f.key)).toEqual(["a", "b"]);
  });

  it("Restricted shows ID numbers in the records the role can open, but not counselling", () => {
    const a = abilities(who([{ key: "principal", sensitive: "restricted" }]), counselling);
    expect(a.seeRestricted).toBe(true);
    expect(a.seeCounselling).toBe(false);
    expect(abilities(who([{ key: "office-staff", sensitive: "restricted" }]), counselling).seeRestricted).toBe(true);
    expect(abilities(who([{ key: "office-staff" }]), counselling).seeRestricted).toBe(false);
  });

  it("Highly restricted adds counselling only where Student Settings gives it", () => {
    expect(abilities(who([{ key: "principal", sensitive: "highly-restricted" }]), counselling).seeCounselling).toBe(true);
    expect(abilities(who([{ key: "school-admin", sensitive: "highly-restricted" }]), counselling).seeCounselling).toBe(false);
    expect(abilities(who([{ key: "counsellor" }]), counselling).seeCounsellingNotes).toBe(true);
    expect(abilities(who([{ key: "counsellor", sensitive: "restricted" }]), counselling).seeCounsellingNotes).toBe(false);
  });

  it("a person with two roles sees what either allows", () => {
    expect(seesRestricted([{ key: "principal", sensitive: "normal" }, { key: "teacher", sensitive: "restricted" }], ["principal"])).toBe(true);
  });
});

describe("a School Admin sets a role's sensitive fields", () => {
  it("only within what the role may have; audited, every School Admin told, and it can be put back", async () => {
    await expect(keep("accountant", "highly-restricted")).rejects.toThrow("The Accountant role can see at most restricted fields.");
    await expect(keep("gate-security", "restricted")).rejects.toThrow(/at most normal/);

    const entry = await keep("principal", "normal");
    expect(entry).not.toBeNull();
    expect(entry!.before).toMatchObject({ sensitiveFields: null });
    expect(entry!.after).toMatchObject({ sensitiveFields: "normal" });
    const alert = await withSchool(ctx(), (tx) => tx.notification.findFirst({ where: { userLoginId: otherAdmin.id, text: { contains: "sensitive fields: normal" } } }));
    expect(alert).not.toBeNull();
    // Saving the same again changes nothing.
    expect(await keep("principal", "normal")).toBeNull();

    // A principal signed in now gets the level with their role.
    const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }] });
    const view = await accessIn(principal.id, school.id);
    expect(view?.roles.find((r) => r.key === "principal")?.sensitive).toBe("normal");
    expect(abilities({ ctx: { schoolId: school.id, userId: principal.id }, permissions: view!.permissions, roles: view!.roles }).seeRestricted).toBe(false);

    // Put back as before.
    await withSchool(ctx(), (tx) => restoreRoleVersion(tx, ctx(), entry!.id));
    expect((await role("principal")).sensitiveFields).toBeNull();
    const again = await accessIn(principal.id, school.id);
    expect(abilities({ ctx: { schoolId: school.id, userId: principal.id }, permissions: again!.permissions, roles: again!.roles }).seeRestricted).toBe(true);
  });

  it("the database refuses a level that does not exist", async () => {
    const r = await role("teacher");
    await expect(withSchool(ctx(), (tx) => tx.role.update({ where: { id: r.id }, data: { sensitiveFields: "everything" } }))).rejects.toThrow();
  });

  it("leaving the choice out keeps the role's level (older forms)", async () => {
    await keep("teacher", "restricted");
    const r = await role("teacher");
    await withSchool(ctx(), (tx) => updateRole(tx, ctx(), r.id, { name: r.name, permissions: r.permissions as RolePermissions, requiresTwoStep: true }));
    expect(await role("teacher")).toMatchObject({ sensitiveFields: "restricted", requiresTwoStep: true });
  });
});
