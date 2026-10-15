// Reports & Analytics demo: the early-warning check run once over the other
// modules' demo records (so flags show on Early Warnings, the Dashboard and
// the Student Profile), Custom & Scheduled Reports switched on for the full
// demo school with one saved custom report and a weekly schedule to the
// Principal, and a few pinned reports for the Principal.
import { withSchool } from "../../src/lib/db";
import { CUSTOM_FEATURE } from "../../src/lib/reports/access";
import { refreshFlags, warningSettings } from "../../src/lib/reports/warnings";
import { cleanSpec, saveCustom, saveSchedule } from "../../src/lib/reports/custom";
import { viewerOf } from "../../src/lib/reports/run";
import { togglePin } from "../../src/lib/reports/pins";
import type { SeedSchool } from "./types";

export async function seedReports(school: SeedSchool) {
  const { schoolId, users } = school;
  await withSchool({ schoolId, userId: null }, async (tx) => {
    await warningSettings(tx, { schoolId, userId: null });
    await refreshFlags(tx, { schoolId, userId: null });
  }, { timeout: 120_000 });
  if (!school.full || !users.principal) return;

  const ctx = { schoolId, userId: users.principal };
  await withSchool(ctx, async (tx) => {
    await tx.schoolFeature.upsert({
      where: { schoolId_featureKey: { schoolId, featureKey: CUSTOM_FEATURE } },
      create: { schoolId, featureKey: CUSTOM_FEATURE, isOn: true },
      update: { isOn: true },
    });
    if (await tx.customReport.count()) return;
    const who = await viewerOf(tx, users.principal!, schoolId);
    if (!who) return;
    const spec = cleanSpec({ area: "attendance", columns: ["name", "cls", "att", "absent"], show: "90", group: "none", totals: true }, who);
    const report = await saveCustom(tx, who, "Below 90% attendance, all classes", spec);
    await saveSchedule(tx, who, { reportKey: `c:${report.id}`, datePreset: "default", frequency: "WEEKLY", day: 1, timeMin: 480, format: "pdf", recipientIds: [users.principal!] }, null);
    for (const key of ["fe-defaulter", "at-daily"]) await togglePin(tx, ctx, "report", key, true);
  }, { timeout: 60_000 });
}
