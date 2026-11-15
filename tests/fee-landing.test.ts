// Where Fee Management opens from the menu (owner decision 18, 15 Nov 2026): the Accountant
// on Collect Fee (the module's own address), the School Admin and the Principal on the Fee Dashboard.
import { describe, expect, it } from "vitest";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { combineRoles } from "@/lib/permissions";
import { landingFor } from "@/lib/shell-data";

function person(...keys: string[]) {
  const roles = keys.map((key) => ({ key, name: key }));
  const permissions = combineRoles(keys.map((k) => ALL_ROLE_TEMPLATES.find((r) => r.key === k)!.permissions));
  return { roles, permissions, user: { id: "u1" } } as never;
}
const fees = (...keys: string[]) => landingFor(person(...keys))["fee-management"] ?? "/fee-management";

describe("Fee Management's first page", () => {
  it("opens Collect Fee for the Accountant", () => {
    expect(fees("accountant")).toBe("/fee-management");
  });

  it("opens the Fee Dashboard for the School Admin and the Principal", () => {
    expect(fees("school-admin")).toBe("/fee-management/dashboard");
    expect(fees("principal")).toBe("/fee-management/dashboard");
  });

  it("leaves the Receptionist at the counter", () => {
    expect(fees("receptionist")).toBe("/fee-management");
  });
});
