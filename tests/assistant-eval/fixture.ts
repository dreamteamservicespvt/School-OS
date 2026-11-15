// The eval schools: school A (the attendance test school, with today's marks
// and the assistant switched on for the Principal, School Admin and class
// teachers) and school B, whose records must never appear in A's answers.
import { readFileSync } from "node:fs";
import path from "node:path";
import { withSchool } from "@/lib/db";
import type { AssistantLang } from "@/lib/assistant/language";
import type { ToolName } from "@/lib/assistant/tools";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "../attendance/fixture";

export const EVAL_DAY = "2026-10-09";
export const EVAL_CLOCK = { now: at(EVAL_DAY, "12:00"), setup: { timeZone: TZ, weekStart: "monday" as const, calendar: {} } };

/** One eval case (cases.jsonl). */
export type EvalCase = {
  id: string; role: "principal" | "school-admin" | "class-teacher"; lang: AssistantLang; said: string;
  expect: { tool?: ToolName; args?: Record<string, unknown>; refused?: boolean; action?: "add-enquiry"; fields?: Record<string, string>; kind?: "cannot" };
  mustNot: string[];
};

export const CASES: EvalCase[] = readFileSync(path.join(import.meta.dirname, "cases.jsonl"), "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

export type EvalSchools = { a: Fixture; b: Fixture };

export async function makeEvalSchools(): Promise<EvalSchools> {
  const a = await makeAttendanceSchool("Eval School A");
  for (const [teacher, section, list, absent] of [[a.teacherA, a.sectionA, a.studentsA, [0, 1]], [a.teacherB, a.sectionB, a.studentsB, [4]]] as const) {
    const access = await accessFor(a, teacher.id);
    await withSchool(as(a, teacher.id), (tx) => saveClassAttendance(tx, as(a, teacher.id), access, {
      sectionId: section.id, date: d(EVAL_DAY), periodNo: 0, timeZone: TZ, now: at(EVAL_DAY, "09:00"),
      entries: list.map((s, i) => ({ studentId: s.id, statusKey: (absent as readonly number[]).includes(i) ? "absent" : "present" })),
    }));
  }
  const ctx = { schoolId: a.school.id, userId: a.admin.id };
  await withSchool(ctx, async (tx) => {
    await saveAssistant(tx, ctx, { on: true, roles: ["school-admin", "principal", "class-teacher"] });
    await setFeature(tx, ctx, "ai-school-assistant", true);
    await tx.calendarEntry.create({ data: { schoolId: a.school.id, campusId: a.school.campus.id, academicYearId: a.year.id, type: "event", title: "Science Fair A", startDate: d("2026-10-13"), endDate: d("2026-10-13") } });
  });

  const b = await makeAttendanceSchool("Eval School B");
  await withSchool({ schoolId: b.school.id, userId: null }, async (tx) => {
    await tx.student.update({ where: { id: b.studentsA[0].id }, data: { firstName: "Zara", lastName: "Khan", fullName: "Zara Khan" } });
    await tx.calendarEntry.create({ data: { schoolId: b.school.id, campusId: b.school.campus.id, academicYearId: b.year.id, type: "event", title: "Science Fair B", startDate: d("2026-10-13"), endDate: d("2026-10-13") } });
  });
  return { a, b };
}
