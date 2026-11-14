// "Me" in the menu (owner, 14 Nov 2026: "there is no option for staff to apply for leave"):
// Staff & HR leaves the menu for people who only see their own record, so a linked staff
// login gets My leave (and My salary slips) as their own menu items instead.
import { describe, expect, it } from "vitest";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { combineRoles, menuModules } from "@/lib/permissions";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { mineLinks } from "@/lib/shell-data";

const ON = new Set<ModuleKey>(MODULES.map((m) => m.key));
function person(...keys: string[]) {
  const permissions = combineRoles(keys.map((k) => ALL_ROLE_TEMPLATES.find((r) => r.key === k)!.permissions));
  return { permissions, modulesOn: ON, menu: menuModules(permissions, ON) };
}

describe("My leave in the menu", () => {
  for (const role of ["teacher", "class-teacher", "accountant", "librarian"]) {
    it(`gives a ${role} linked to a staff record a way to apply for leave`, () => {
      const p = person(role);
      expect(p.menu.map((m) => m.key)).not.toContain("staff-hr-management");
      expect(mineLinks(p, true).map((l) => l.href)).toContain("/staff-hr-management/leave?view=mine");
    });
  }

  it("shows nothing for a login with no staff record", () => {
    expect(mineLinks(person("teacher"), false)).toEqual([]);
  });

  it("adds no second Leave link for HR, who has Staff & HR in the menu already", () => {
    const hr = person("hr");
    expect(hr.menu.map((m) => m.key)).toContain("staff-hr-management");
    expect(mineLinks(hr, true).map((l) => l.label)).not.toContain("My leave");
  });
});
