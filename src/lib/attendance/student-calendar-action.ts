"use server";

// Pages a student's attendance calendar (Student Profile) to another month.
// Checked on the server every time: the Attendance view permission, and the
// person's reach (own sections only for class and subject teachers).
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { todayIn } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { attendanceAccess, AttendanceProblem, MODULE } from "@/lib/attendance/access";
import { attendanceSettings } from "@/lib/attendance/settings";
import { parseMonth, studentCalendarFor } from "@/lib/attendance/calendar-months";

export async function studentMonthAction(studentId: string, month: string) {
  const current = await requirePage(MODULE, "view");
  if (!UUID_RE.test(studentId)) return { error: "This student was not found." };
  const m = parseMonth(month);
  if (!m) return { error: "Choose a month." };
  try {
    return await withSchool(current.ctx, async (tx) => {
      const settings = await attendanceSettings(tx, current.ctx);
      const access = await attendanceAccess(tx, current.ctx, current, settings.lockOverrideRoles);
      const data = await studentCalendarFor(tx, current.ctx, access, studentId, m, todayIn(current.school.timeZone));
      return { view: data.view };
    });
  } catch (e) {
    if (e instanceof AttendanceProblem) return { error: e.message };
    throw e;
  }
}
