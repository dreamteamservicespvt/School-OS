// Settings, Users & Permissions: roles. Copy, edit with the permission grid,
// archive (not if in use), templates on and off, alerts, and putting a change back.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { reachFor } from "@/lib/permissions";
import { archiveRole, cleanPermissions, createRole, permissionChanges, restoreRoleVersion, setTemplateOn, updateRole } from "@/lib/settings/roles";
import { changeAccess } from "@/lib/settings/users";
import type { RolePermissions } from "@/lib/roles";
import { makeSchool, makeUser } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };
const ctx = () => ({ schoolId: school.id, userId: admin.id });
const role = (key: string) => withSchool(ctx(), (tx) => tx.role.findFirstOrThrow({ where: { key } }));

beforeAll(async () => {
  school = await makeSchool("Roles School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Suresh" });
});

describe("the permission grid", () => {
  it("round-trips: what is saved is what the grid shows, unknown levels become None", () => {
    const grid = cleanPermissions({ dashboard: "full", "fee-management": "view", "salary-management": "own", settings: "everything", nonsense: "full" });
    expect(grid.dashboard).toBe("full");
    expect(grid["fee-management"]).toBe("view");
    expect(grid["salary-management"]).toBe("own");
    expect(grid.settings).toBe("none");
    expect(Object.keys(grid)).toHaveLength(20);
    expect("nonsense" in grid).toBe(false);
  });

  it("describes changes in plain words", () => {
    const words = permissionChanges("Teacher", { "salary-management": "own", "fee-management": "none", settings: "full" } as Partial<RolePermissions>, { "salary-management": "full", "fee-management": "view", settings: "none" } as Partial<RolePermissions>);
    expect(words).toEqual([
      "Teacher role can now see Fee Management",
      "Teacher role can now change everything in Salary Management",
      "Teacher role can no longer open Settings",
    ]);
  });
});

describe("Done when 2: a Vice Principal copied from Principal without salary", () => {
  it("copies, removes salary, and a user with the role cannot reach salary data", async () => {
    const principal = await role("principal");
    const perms = { ...(principal.permissions as RolePermissions), "salary-management": "none" };
    const created = await withSchool(ctx(), (tx) => createRole(tx, ctx(), { name: "Deputy Principal", permissions: perms, requiresTwoStep: false, copyFromId: principal.id }));
    expect(created.kind).toBe("CUSTOM");
    expect(created.key).toMatch(/^custom-/);
    const saved = await withSchool(ctx(), (tx) => tx.role.findUniqueOrThrow({ where: { id: created.id } }));
    expect(saved.permissions).toEqual(perms);

    const person = await makeUser({ schools: [{ id: school.id, roleKeys: [] }] });
    await withSchool(ctx(), async (tx) => {
      const a = await tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: person.id } });
      await tx.schoolAccessRole.create({ data: { schoolId: school.id, schoolAccessId: a.id, roleId: created.id } });
    });
    const access = await accessIn(person.id, school.id);
    expect(reachFor(access!.permissions, "salary-management", "view")).toBe("none");
    expect(reachFor(access!.permissions, "fee-management", "view")).toBe("all");
    expect(access!.roles.map((r) => r.name)).toEqual(["Deputy Principal"]);

    // In use: cannot be archived.
    await expect(withSchool(ctx(), (tx) => archiveRole(tx, ctx(), created.id))).rejects.toThrow(/1 person has the Deputy Principal role/);
    // Names are unique.
    await expect(withSchool(ctx(), (tx) => createRole(tx, ctx(), { name: "deputy principal", permissions: perms, requiresTwoStep: false }))).rejects.toThrow(/already a role/);
  });
});

describe("editing a role", () => {
  it("saves, alerts every School Admin, and can be put back", async () => {
    const teacher = await role("teacher");
    const before = teacher.permissions as RolePermissions;
    const other = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Second Admin" });
    const entry = await withSchool(ctx(), (tx) => updateRole(tx, ctx(), teacher.id, { name: teacher.name, permissions: { ...before, "salary-management": "full" }, requiresTwoStep: false }));
    expect(entry).not.toBeNull();
    const alert = await withSchool(ctx(), (tx) => tx.notification.findFirstOrThrow({ where: { userLoginId: other.id, type: "security" }, orderBy: { createdAt: "desc" } }));
    expect(alert.text).toContain("Suresh changed a role: Teacher role can now change everything in Salary Management");
    // Nothing changed: nothing saved.
    expect(await withSchool(ctx(), (tx) => updateRole(tx, ctx(), teacher.id, { name: teacher.name, permissions: { ...before, "salary-management": "full" }, requiresTwoStep: false }))).toBeNull();
    // Put back from the role history.
    await withSchool(ctx(), (tx) => restoreRoleVersion(tx, ctx(), entry!.id));
    expect((await role("teacher")).permissions).toEqual(before);
  });

  it("the School Admin role keeps full Settings", async () => {
    const sa = await role("school-admin");
    await expect(withSchool(ctx(), (tx) => updateRole(tx, ctx(), sa.id, { name: sa.name, permissions: { ...(sa.permissions as RolePermissions), settings: "view" }, requiresTwoStep: true }))).rejects.toThrow(/must keep Full access to Settings/);
  });

  it("ready roles cannot be archived or renamed", async () => {
    const acc = await role("accountant");
    await expect(withSchool(ctx(), (tx) => archiveRole(tx, ctx(), acc.id))).rejects.toThrow(/ready role/);
    await withSchool(ctx(), (tx) => updateRole(tx, ctx(), acc.id, { name: "Money Person", permissions: acc.permissions as RolePermissions, requiresTwoStep: true }));
    expect((await role("accountant")).name).toBe("Accountant");
  });

  it("an unused custom role can be archived", async () => {
    const r = await withSchool(ctx(), (tx) => createRole(tx, ctx(), { name: "Lab Assistant", permissions: { dashboard: "own" }, requiresTwoStep: false }));
    await withSchool(ctx(), (tx) => archiveRole(tx, ctx(), r.id));
    expect((await withSchool(ctx(), (tx) => tx.role.findUniqueOrThrow({ where: { id: r.id } }))).archivedAt).not.toBeNull();
  });
});

describe("role templates", () => {
  it("switch on, can be given, and cannot be switched off while in use", async () => {
    const vp = await role("vice-principal");
    expect(vp.isEnabled).toBe(false);
    const person = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    await expect(withSchool(ctx(), (tx) => changeAccess(tx, ctx(), person.id, { roleIds: [vp.id], scope: "WHOLE_SCHOOL", campusId: null }))).rejects.toThrow(/switched off/);
    await withSchool(ctx(), (tx) => setTemplateOn(tx, ctx(), vp.id, true));
    await withSchool(ctx(), (tx) => changeAccess(tx, ctx(), person.id, { roleIds: [vp.id], scope: "WHOLE_SCHOOL", campusId: null }));
    await expect(withSchool(ctx(), (tx) => setTemplateOn(tx, ctx(), vp.id, false))).rejects.toThrow(/Give them another role first/);
  });
});
