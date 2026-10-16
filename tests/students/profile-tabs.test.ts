// Student Profile tabs from other modules (03 §2): a tab shows only when the
// person may view its module and an optional module is switched on.
import { afterEach, describe, expect, it } from "vitest";
import { clearProfileTabs, profileTabsFor, registerProfileTab } from "@/lib/students/profile-tabs";
import { combineRoles } from "@/lib/permissions";
import type { RolePermissions } from "@/lib/roles";
import type { ModuleKey } from "@/lib/modules";

const tab = (key: string, module: ModuleKey, order: number) => ({ key, label: key, module, order, load: async () => null });
const perms = (levels: Partial<RolePermissions>) => combineRoles([levels as RolePermissions]);

afterEach(() => clearProfileTabs());

describe("profile tab registry", () => {
  it("shows nothing when no module has registered a tab", () => {
    expect(profileTabsFor({ permissions: perms({ "student-management": "full" }), modulesOn: new Set() })).toEqual([]);
  });

  it("orders tabs and hides those the person may not view", () => {
    registerProfileTab(tab("exams", "examination-results", 50));
    registerProfileTab(tab("fees", "fee-management", 40));
    const p = perms({ "student-management": "full", "fee-management": "view" });
    expect(profileTabsFor({ permissions: p, modulesOn: new Set() }).map((t) => t.key)).toEqual(["fees"]);
    const both = perms({ "fee-management": "view", "examination-results": "own" });
    expect(profileTabsFor({ permissions: both, modulesOn: new Set() }).map((t) => t.key)).toEqual(["fees", "exams"]);
  });

  it("hides an optional module's tab until the school switches it on", () => {
    registerProfileTab(tab("transport", "transport-management", 70));
    const p = perms({ "transport-management": "full" });
    expect(profileTabsFor({ permissions: p, modulesOn: new Set() })).toEqual([]);
    expect(profileTabsFor({ permissions: p, modulesOn: new Set<ModuleKey>(["transport-management"]) }).map((t) => t.key)).toEqual(["transport"]);
  });
});
