// What every Attendance page starts with: the signed-in person, checked on
// the server, what they may do here, the school's settings and today's date.
import "server-only";

import { cache } from "react";
import { requirePage, type Current } from "../current";
import { withSchool } from "../db";
import type { Action } from "../permissions";
import { todayIn } from "../staff/dates";
import { attendanceAccess, MODULE, type AttendanceAccess } from "./access";
import { narrowToCampus } from "../campus";
import { attendanceFeatures, attendanceSettings } from "./settings";

export const attendancePage = cache(async (action: Action = "view") => {
  const current = await requirePage(MODULE, action);
  const { access, settings, features } = await withSchool(current.ctx, async (tx) => {
    const settings = await attendanceSettings(tx, current.ctx);
    return {
      settings,
      features: await attendanceFeatures(tx, current.ctx),
      access: await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles),
    };
  });
  const tz = current.school.timeZone;
  return { current, access, settings, features, tz, today: todayIn(tz), now: new Date() };
});

/**
 * The person and their reach narrowed to a campus chosen in the page address
 * (?campus=, from the Dashboard's filter; src/lib/campus.ts narrowToCampus).
 */
export async function onCampusFromPage(p: { current: Current; access: AttendanceAccess; settings: { lockOverrideRoles: string[] } }, raw: string | string[] | undefined) {
  if (!raw) return { current: p.current, access: p.access };
  return withSchool(p.current.ctx, async (tx) => {
    const current = await narrowToCampus(tx, p.current, raw);
    if (current === p.current) return { current, access: p.access };
    return { current, access: await attendanceAccess(tx, current.ctx, current, p.settings.lockOverrideRoles) };
  });
}

/** For server actions: what the person may do, and the school's settings. */
export async function actionContext(current: Current) {
  return withSchool(current.ctx, async (tx) => {
    const settings = await attendanceSettings(tx, current.ctx);
    const features = await attendanceFeatures(tx, current.ctx);
    return { settings, features, access: await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles) };
  });
}
