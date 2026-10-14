// The phone bar, "New" and the Dashboard's quick actions follow each role's duty
// (owner's prototype changes of 13 Oct 2026): the Principal, School Admin and
// Vice Principal get summaries, gaps and Approve, never Collect fee or Take
// attendance; the people who do that work keep it.
import { describe, expect, it } from "vitest";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { combineRoles, menuModules } from "@/lib/permissions";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { dutyOpen, quickActionsFor } from "@/lib/shell-data";
import { settingsPagesFor } from "@/lib/settings-pages";
import { BOTTOM_BY_ROLE } from "@/components/shell/nav-config";

const ON = new Set<ModuleKey>(MODULES.map((m) => m.key));
function person(...keys: string[]) {
  const roles = keys.map((key) => ({ key, name: key, permissions: null }));
  const permissions = combineRoles(keys.map((k) => ALL_ROLE_TEMPLATES.find((r) => r.key === k)!.permissions));
  return { roles, permissions, menu: menuModules(permissions, ON) };
}
const hrefs = (keys: string[], canApprove = true) => quickActionsFor(person(...keys) as never, canApprove).map((q) => q.href);

describe("Desk work by role", () => {
  it("gives leaders no Collect fee or Take attendance, on the phone bar or in quick actions", () => {
    for (const role of ["principal", "school-admin", "vice-principal"]) {
      const bar = BOTTOM_BY_ROLE[role].map((b) => b.href);
      expect(bar).toContain("/approvals");
      expect(bar).not.toContain("/fee-management");
      expect(bar).not.toContain("/attendance-management");
      const quick = hrefs([role]);
      expect(quick).not.toContain("/fee-management");
      expect(quick).not.toContain("/attendance-management");
      expect(quick).not.toContain("/fee-management/collect");
    }
    expect(hrefs(["principal"])[0]).toBe("/approvals");
    expect(hrefs(["principal"])).toContain("/fee-management/defaulters");
  });

  it("hides desk pages for leaders and keeps them for the people at the desk", () => {
    const principal = person("principal");
    expect(dutyOpen(principal, "/fee-management")).toBe(true); // the Fee Dashboard
    expect(dutyOpen(principal, "/fee-management/collect")).toBe(false);
    expect(dutyOpen(principal, "/attendance-management")).toBe(false); // Take Attendance
    expect(dutyOpen(principal, "/attendance-management/register")).toBe(true);
    expect(dutyOpen(principal, "/staff-hr-management/add")).toBe(false);
    expect(dutyOpen(person("accountant"), "/fee-management/collect")).toBe(true);
    expect(dutyOpen(person("class-teacher"), "/attendance-management")).toBe(true);
    // A Principal who also teaches a class takes its attendance.
    expect(dutyOpen(person("principal", "class-teacher"), "/attendance-management")).toBe(true);
  });

  it("shows Approvals only to people who may approve", () => {
    expect(hrefs(["principal"], false)).not.toContain("/approvals");
  });

  it("leaves gateways, message channels and backups off the Principal's Settings", () => {
    const keys = (r: string) => settingsPagesFor(person(r)).map((p) => p.href);
    expect(keys("principal")).not.toContain("/settings/payment-gateways");
    expect(keys("principal")).toContain("/settings/users");
    expect(keys("school-admin")).toContain("/settings/payment-gateways");
  });
});
