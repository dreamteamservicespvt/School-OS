// Settings 'Own' only reads (security audit run-2, medium): a person whose
// Settings reach is "own" (a custom role set to Own, or a Settings Full role
// under the scope "Own records only") may read Settings pages, but every
// Settings change needs change reach "all". Before this fix such a person
// could open their own login in Users & Permissions and give themselves the
// School Admin role. Calls the real server actions as each person.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { MODULE_KEYS } from "@/lib/modules";
import { settingsMay, settingsRefusal } from "@/lib/settings/page-access";
import { makeSchool, makeUser } from "../helpers";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", async (original) => ({
  ...(await original<typeof import("@/lib/current")>()),
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Own Reach School" } };
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const users = await import("@/app/(school)/settings/users/actions");

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

let school: Awaited<ReturnType<typeof makeSchool>>;
let ownRole: { id: string };
let adminRoleId: string;
let ownSettings: { id: string };
let scopedOwn: { id: string };
const sys = () => ({ schoolId: school.id, userId: null });
const as = (u: { id: string }) => { who.userId = u.id; who.schoolId = school.id; };
const roleKeysOf = async (u: { id: string }) => (await accessIn(u.id, school.id))!.roles.map((r) => r.key).sort();

beforeAll(async () => {
  school = await makeSchool("Own Reach Settings School");
  await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Real Admin" });
  ownSettings = await makeUser({ schools: [{ id: school.id, roleKeys: [] }], name: "Self Service" });
  scopedOwn = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Scoped Own" });
  await withSchool(sys(), async (tx) => {
    // 'Set every module to Own' in the role editor.
    ownRole = await tx.role.create({ data: { schoolId: school.id, name: "Staff self-service", kind: "CUSTOM", permissions: Object.fromEntries(MODULE_KEYS.map((k) => [k, "own"])) } });
    adminRoleId = (await tx.role.findFirstOrThrow({ where: { key: "school-admin" } })).id;
    const access = await tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: ownSettings.id } });
    await tx.schoolAccessRole.create({ data: { schoolId: school.id, schoolAccessId: access.id, roleId: ownRole.id } });
    await tx.schoolAccess.updateMany({ where: { userLoginId: scopedOwn.id }, data: { scope: "OWN" } });
  });
});

describe("Settings 'Own' reach only reads", () => {
  it("shows the Users page read-only and refuses changes in plain words", async () => {
    for (const u of [ownSettings, scopedOwn]) {
      const p = (await accessIn(u.id, school.id))!;
      expect(p.permissions.settings.change).toBe("own");
      expect(settingsMay(p, "users")).toMatchObject({ edit: false, create: false, archive: false, readOnly: true });
      expect(settingsRefusal(p, "users", "edit")).toMatch(/can read Users & Permissions but not change it/);
      expect(settingsRefusal(p, "users", "view")).toBeNull();
    }
  });

  it("a custom role with Settings Own cannot give itself the School Admin role", async () => {
    as(ownSettings);
    const r = await users.accessAction(null, form({ userId: ownSettings.id, roleIds: [adminRoleId], scope: "WHOLE_SCHOOL" }));
    expect(r?.ok).toBe(false);
    expect(r?.message).toMatch(/can read Users & Permissions but not change it/);
    expect(await roleKeysOf(ownSettings)).not.toContain("school-admin");
    const ex = await users.exceptionsAction(null, form({ userId: ownSettings.id, ex_settings: "full" }));
    expect(ex?.ok).toBe(false);
    const access = await withSchool(sys(), (tx) => tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: ownSettings.id } }));
    expect(access.exceptions).toEqual({});
  });

  it("a School Admin under the scope 'Own records only' cannot widen its own scope", async () => {
    as(scopedOwn);
    const r = await users.accessAction(null, form({ userId: scopedOwn.id, roleIds: [adminRoleId], scope: "WHOLE_SCHOOL" }));
    expect(r?.ok).toBe(false);
    const access = await withSchool(sys(), (tx) => tx.schoolAccess.findFirstOrThrow({ where: { userLoginId: scopedOwn.id } }));
    expect(access.scope).toBe("OWN");
  });
});
