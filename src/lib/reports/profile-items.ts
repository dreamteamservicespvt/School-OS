// Early-warning flags on the Student Profile (19 "Connects to": "03 Student
// Management: early-warning flags on the profile"). They show in the profile's
// Today panel and summary strip, with no tab of their own, and only to people
// who see Early Warnings for that student's class (fee flags only to roles with
// Fee Management). A student's attendance item is their Attendance Flag, the
// same record the Attendance tab shows, so it appears once.
import "server-only";

import { withSchool } from "../db";
import { registerProfileTab, type ProfileTabArgs, type SummaryItem } from "../students/profile-tabs";
import { BASE, reportAccess } from "./access";
import { AREAS, STRENGTH_LABEL, studentFlags } from "./warnings";

async function flagItems({ current, studentId }: ProfileTabArgs): Promise<SummaryItem[]> {
  const a = reportAccess(current);
  if (!a.warnings.on) return [];
  return withSchool(current.ctx, async (tx) => {
    const flags = (await studentFlags(tx, current, a, studentId)).slice(0, 3);
    return flags.map((f) => ({
      label: `Early warning: ${AREAS.find((x) => x.value === f.area)?.label ?? f.area}`,
      value: STRENGTH_LABEL[f.strength] ?? f.strength,
      sub: f.reason.split("\n")[0],
      href: `${BASE}/early-warnings?open=${f.id}`,
      tone: f.strength === "ACT_NOW" ? ("danger" as const) : ("warning" as const),
    }));
  });
}

registerProfileTab({
  key: "early-warnings",
  label: "Early warnings",
  module: "reports-analytics",
  order: 999,
  tabless: true,
  load: async () => null,
  today: flagItems,
});
