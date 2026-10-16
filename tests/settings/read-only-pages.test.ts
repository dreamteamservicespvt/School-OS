// Settings pages a leader only reads (src/lib/duty.ts, prototype config.js
// DUTY): the Principal reads School Profile, Users & Permissions, Document
// Designs and Modules On/Off, and keeps Forms & Approvals. Their screens show
// the settings with no save buttons (settingsMay), and the server refuses
// their changes even though their role has Full Settings. A person who is
// also School Admin keeps every page. Calls the real server actions as each
// person.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { settingsMay, settingsMode, settingsRefusal, type SettingsPageKey } from "@/lib/settings/page-access";
import { settingsPagesFor } from "@/lib/settings-pages";
import { makeSchool, makeUser } from "../helpers";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", async (original) => ({
  ...(await original<typeof import("@/lib/current")>()),
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Read Only School" } };
    // The real role check runs first, exactly as in src/lib/current.ts.
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const modules = await import("@/app/(school)/settings/modules/actions");
const profile = await import("@/app/(school)/settings/school-profile/actions");
const users = await import("@/app/(school)/settings/users/actions");
const designs = await import("@/app/(school)/settings/document-designs/actions");
const formsApprovals = await import("@/app/(school)/settings/forms-approvals/actions");

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};

let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };
let principal: { id: string };
let both: { id: string };
const as = (u: { id: string }) => { who.userId = u.id; who.schoolId = school.id; };
const person = async (u: { id: string }) => (await accessIn(u.id, school.id))!;

const READ: SettingsPageKey[] = ["school-profile", "users", "document-designs", "modules"];

beforeAll(async () => {
  school = await makeSchool("Read Only Settings School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Suresh Admin" });
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Lakshmi Principal" });
  both = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal", "school-admin"] }], name: "Owner Both" });
});

describe("which Settings pages the Principal only reads", () => {
  it("reads School Profile, Users, Document Designs and Modules, keeps Forms & Approvals, and has no gateways, channels or backups in the tabs", async () => {
    const p = await person(principal);
    for (const page of READ) {
      expect(settingsMode(p, page)).toBe("view");
      expect(settingsMay(p, page)).toMatchObject({ edit: false, create: false, archive: false, readOnly: true });
      expect(settingsRefusal(p, page, "edit")).toMatch(/You can read .* but not change it/);
      expect(settingsRefusal(p, page, "view")).toBeNull();
      expect(settingsRefusal(p, page, "export")).toBeNull();
    }
    expect(settingsMode(p, "forms-approvals")).toBe("full");
    expect(settingsMay(p, "forms-approvals").edit).toBe(true);
    expect(settingsPagesFor(p).map((x) => x.href)).toEqual(["/settings/school-profile", "/settings/users", "/settings/document-designs", "/settings/forms-approvals", "/settings/modules"]);
  });

  it("leaves every page to the School Admin, and to a Principal who is also School Admin", async () => {
    for (const u of [admin, both]) {
      const p = await person(u);
      for (const page of [...READ, "forms-approvals", "payment-gateways", "messaging", "data-security"] as SettingsPageKey[]) {
        expect(settingsMay(p, page)).toMatchObject({ edit: true, create: true, archive: true, readOnly: false });
        expect(settingsRefusal(p, page, "edit")).toBeNull();
      }
    }
  });
});

describe("the server refuses changes from a reader", () => {
  it("Modules On/Off: the Principal cannot save preferences or switch a module; the School Admin can", async () => {
    as(principal);
    const refused = await modules.preferencesAction(null, form({ weekStart: "sunday", rollNumberOrder: "name" }));
    expect(refused?.ok).toBe(false);
    expect(refused?.message).toMatch(/You can read Modules On\/Off but not change it/);
    expect(await modules.moduleAction("transport-management", true)).toMatch(/You can read Modules On\/Off/);
    expect(await modules.featureAction("ai-homework", true)).toMatch(/You can read/);
    const prefs = async () => (await withSchool({ schoolId: school.id, userId: admin.id }, (tx) => tx.school.findUniqueOrThrow({ where: { id: school.id } }))).preferences as Record<string, unknown> | null;
    expect((await prefs())?.weekStart).toBeUndefined();
    // Reading is still allowed: the template preview is a "view" action.
    expect((await modules.previewTemplateAction("cbse-day", false))?.message ?? "").not.toMatch(/You can read/);

    as(admin);
    expect((await modules.preferencesAction(null, form({ weekStart: "sunday", rollNumberOrder: "name" })))?.ok).toBe(true);
    expect((await prefs())?.weekStart).toBe("sunday");
  });

  it("School Profile: the Principal cannot save the school's details", async () => {
    as(principal);
    const r = await profile.saveDetailsAction(null, form({ name: "Renamed", address: "1 Road", phone: "9876543210", email: "office@school.in", website: "", affiliationNumber: "", gstin: "", brandColor: "#1d4ed8" }));
    expect(r?.ok).toBe(false);
    expect(r?.message).toMatch(/You can read School Profile/);
    const s = await withSchool({ schoolId: school.id, userId: admin.id }, (tx) => tx.school.findUniqueOrThrow({ where: { id: school.id } }));
    expect(s.name).not.toBe("Renamed");
    expect(await profile.removeLogoAction()).toMatch(/You can read School Profile/);
  });

  it("Users & Permissions: the Principal cannot disable a login or change a role", async () => {
    as(principal);
    expect(await users.disableAction(both.id)).toMatch(/You can read Users & Permissions/);
    const roleId = (await withSchool({ schoolId: school.id, userId: admin.id }, (tx) => tx.role.findFirstOrThrow({ where: { key: "librarian" } }))).id;
    expect(await users.roleAction(roleId, "off")).toMatch(/You can read Users & Permissions/);
    const access = await accessIn(both.id, school.id);
    expect(access).not.toBeNull();
  });

  it("Document Designs: the Principal cannot save a design or add a signatory, but can preview", async () => {
    as(principal);
    await expect(designs.saveDesignAction("fee-receipt", "classic", "{}")).rejects.toThrow(/You can read Document Designs/);
    await expect(designs.addSignatoryAction(null, form({ name: "Lakshmi", title: "Principal" }))).rejects.toThrow(/You can read Document Designs/);
    const preview = await designs.previewDesign("fee-receipt", "classic", "{}", null);
    expect("message" in preview ? preview.message : "").not.toMatch(/You can read/);
    expect(await withSchool({ schoolId: school.id, userId: admin.id }, (tx) => tx.documentDesign.count())).toBe(0);
  });

  it("Forms & Approvals stays the Principal's to change", async () => {
    as(principal);
    const r = await formsApprovals.fieldAction(null, form({ recordType: "student", label: "House colour", fieldType: "text", visibility: "everyone" }));
    expect(r?.ok).toBe(true);
    expect(await withSchool({ schoolId: school.id, userId: admin.id }, (tx) => tx.customField.count({ where: { label: "House colour" } }))).toBe(1);
  });
});

describe("every Settings change goes through the page check", () => {
  it("no Settings server action checks the module alone", () => {
    const root = join(process.cwd(), "src/app/(school)/settings");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (n === "actions.ts") files.push(p);
      }
    };
    walk(root);
    expect(files.length).toBe(9);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/requireAction\(/);
      expect(src, f).toMatch(/const PAGE = "[a-z-]+" as const;/);
    }
  });
});
