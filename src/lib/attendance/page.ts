// What every Attendance page starts with: the signed-in person, checked on
// the server, what they may do here, the school's settings and today's date.
import "server-only";

import { cache } from "react";
import { requirePage, type Current } from "../current";
import { withSchool } from "../db";
import type { Action } from "../permissions";
import { todayIn } from "../staff/dates";
import { attendanceAccess, inYear, MODULE, type AttendanceAccess } from "./access";
import { narrowToCampus } from "../campus";
import { readViewYear, type ViewYear } from "../academic/view-year";
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
export async function onCampusFromPage(p: { current: Current; access: AttendanceAccess; settings: { lockOverrideRoles: string[] }; today: Date }, raw: string | string[] | undefined, rawYear?: string | string[] | undefined): Promise<{ current: Current; access: AttendanceAccess; view: ViewYear | null }> {
  if (!raw && !rawYear) return { current: p.current, access: p.access, view: null };
  return withSchool(p.current.ctx, async (tx) => {
    const current = raw ? await narrowToCampus(tx, p.current, raw) : p.current;
    const access = current === p.current ? p.access : await attendanceAccess(tx, current.ctx, current, p.settings.lockOverrideRoles);
    const view = rawYear ? await readViewYear(tx, current.ctx, current, rawYear, p.today) : null;
    return { current, access: inYear(access, view), view };
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
