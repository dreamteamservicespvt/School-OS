// Attendance Settings and Devices & QR are for the School Admin and the
// Principal only (05 §6, owner rule 2). The pages hide them from other roles,
// and the server actions refuse them too: this test calls the real server
// actions as a class teacher, office staff and HR, and checks nothing changed.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { makeAttendanceSchool, type Fixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId }, ctx: { schoolId: who.schoolId, userId: who.userId } };
    // The real role check runs first, exactly as in src/lib/current.ts.
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const { saveLateRulesAction, saveFeatureAction } = await import("@/app/(school)/attendance-management/settings/actions");
const { addDeviceAction } = await import("@/app/(school)/attendance-management/devices/actions");

let f: Fixture;
beforeAll(async () => {
  f = await makeAttendanceSchool("Settings Access School");
});

function lateRules(lockTime: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ studentStartTime: "08:45", studentLateAfterMin: "10", staffStartTime: "08:30", staffLateAfterMin: "10", staffHalfDayAfter: "", lockTime })) fd.set(k, v);
  fd.append("lockOverrideRoles", "principal");
  return fd;
}
const lockNow = () => withSchool({ schoolId: f.school.id, userId: null }, async (tx) => (await tx.attendanceSetting.findUniqueOrThrow({ where: { schoolId: f.school.id } })).lockTime);

describe("Attendance Settings on the server", () => {
  it("refuses a class teacher, office staff and HR, and changes nothing", async () => {
    const before = await lockNow();
    for (const user of [f.teacherA, f.officeLogin, f.hrLogin]) {
      who.userId = user.id;
      who.schoolId = f.school.id;
      const r = await saveLateRulesAction(null, lateRules("12:30"));
      expect(r?.ok).toBe(false);
      expect(r?.message).toMatch(/Only the School Admin or the Principal|not allowed|permission/i);
      const feature = new FormData();
      feature.set("key", "attendance-overtime");
      feature.set("on", "1");
      expect((await saveFeatureAction(null, feature))?.ok).toBe(false);
      const device = new FormData();
      for (const [k, v] of Object.entries({ name: "Mine", serialNo: "X-9", campusId: f.school.campus.id, deviceType: "face", allowedUsers: "both" })) device.set(k, v);
      expect((await addDeviceAction(null, device))?.ok).toBe(false);
    }
    expect(await lockNow()).toBe(before);
    const devices = await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.attendanceDevice.count());
    expect(devices).toBe(0);
  });

  it("lets the Principal change the lock time", async () => {
    who.userId = f.principal.id;
    who.schoolId = f.school.id;
    const r = await saveLateRulesAction(null, lateRules("11:30"));
    expect(r?.message).toBeTruthy();
    expect(await lockNow()).toBe("11:30");
  });
});
