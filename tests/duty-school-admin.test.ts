// Owner decision for layman tests LA11 and LD6 (12-11-2026): the School
// Admin's screens follow docs/blueprint/05-roles.md, which gives the School
// Admin Full in every module. src/lib/duty.ts no longer narrows the School
// Admin (no "View only" badge where they can act, Take Attendance and Student
// Leave shown), and Settings, Users & Permissions says plain "Full" for them
// (dutyNotes is null). The Principal and Vice Principal keep their oversight.
import { describe, expect, it } from "vitest";
import { DUTY, dutyNotes, pageMode } from "@/lib/duty";
import { MODULES } from "@/lib/modules";
import { foCan, foViewer } from "@/lib/front-office/access";
import { trCan, trViewer } from "@/lib/transport/access";
import { hostelCan, hostelViewer } from "@/lib/hostel/access";
import { combineRoles } from "@/lib/permissions";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";

const person = (...keys: string[]) => ({ roles: keys.map((key) => ({ key, permissions: null })) });
const perms = (...keys: string[]) => combineRoles(keys.map((k) => ALL_ROLE_TEMPLATES.find((r) => r.key === k)!.permissions));
const admin = person("school-admin");

describe("the School Admin works every module the blueprint gives them in Full", () => {
  it("has no duty narrowing, so every page is Full and Settings says plain Full", () => {
    expect(DUTY["school-admin"]).toBeUndefined();
    for (const m of MODULES) expect(dutyNotes(admin, m.key)).toBeNull();
    expect(pageMode(admin, "attendance-management", "take")).toBe("full");
    expect(pageMode(admin, "attendance-management", "student-leave")).toBe("full");
    expect(pageMode(admin, "attendance-management", "register")).toBe("full");
    expect(pageMode(admin, "library-management", "issue")).toBe("full");
  });

  it("works the Front Office desk, Transport and Hostel, with no reminders to send", () => {
    const user = { id: "u" };
    const fo = foViewer({ permissions: perms("school-admin"), roles: admin.roles, user });
    expect(fo.level).toBe("full");
    expect(foCan(fo)).toMatchObject({ register: true, checkOut: true });
    const tr = trViewer({ ...admin, permissions: perms("school-admin"), modulesOn: new Set(["transport-management"]), features: new Set() });
    expect(Object.values(tr.pages).filter((m) => m !== "hidden").every((m) => m === "full")).toBe(true);
    expect(trCan(tr, admin)).toMatchObject({ routes: true, settings: true, trips: true, remind: false });
    const h = hostelViewer({ permissions: perms("school-admin"), roles: admin.roles, user });
    expect(Object.values(h.pages).every((m) => m === "full")).toBe(true);
    expect(hostelCan(h)).toMatchObject({ rooms: true, allocate: true });
  });

  it("keeps the Principal's oversight as before, and says so in Settings", () => {
    const principal = person("principal");
    expect(pageMode(principal, "attendance-management", "take")).toBe("hidden");
    expect(dutyNotes(principal, "attendance-management")).toEqual({ reads: ["Staff Attendance", "Devices"], notShown: ["Take Attendance", "Student Leave"] });
    const tr = trViewer({ ...principal, permissions: perms("principal"), modulesOn: new Set(["transport-management"]), features: new Set() });
    expect(trCan(tr, principal)).toMatchObject({ routes: false, remind: true });
  });
});
