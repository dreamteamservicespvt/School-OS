// Management brief (01 Dashboard Principal summary; gap list G26): a short
// brief each school morning for the Principal and School Admin, weekly on
// Monday: what happened (from the school's own records, with the list behind
// each number), what may need them next (Looking ahead, labelled Suggestion)
// and what waits for their decision. Sent once, in the morning only, where the
// school switched it on; shown on the Dashboard as Today's brief.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { briefAllowed, briefKind, briefNote, briefTime, composeBrief, sendBriefs } from "@/lib/reports/brief";
import { channelsForType } from "@/lib/notification-kinds";
import { feature } from "../fees/fixture";
import { at, d, makeAttendanceSchool, type Fixture } from "../attendance/fixture";

let f: Fixture;
let sys: SchoolContext;

async function viewer(userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId: f.school.id, userId }, (tx) => viewerOf(tx, userId, f.school.id));
  if (!v) throw new Error("no access");
  return v;
}
async function home(userId: string, now: Date) {
  const view = await accessIn(userId, f.school.id);
  const v = { ...view!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
  return buildHome(v, { now });
}

/** Monday to Saturday from `from` to `to` (the fixture's Saturdays are school days), leaving out 2 October. */
function schoolDays(from: string, to: string) {
  const out: string[] = [];
  for (let t = d(from).getTime(); t <= d(to).getTime(); t += 86_400_000) {
    const x = new Date(t);
    const iso = x.toISOString().slice(0, 10);
    if (x.getUTCDay() !== 0 && iso !== "2026-10-02") out.push(iso);
  }
  return out;
}

beforeAll(async () => {
  f = await makeAttendanceSchool("Brief School");
  sys = { schoolId: f.school.id, userId: null };
  for (const k of ["ai-assistant", "ai-principal-summary", "ai-forecasts"]) await feature(sys, k);
  // Everyone present from 14 September; on Thursday 15 October two of the ten are away.
  const days = schoolDays("2026-09-14", "2026-10-17");
  await withSchool(sys, async (tx) => {
    await tx.attendanceMark.createMany({
      data: days.flatMap((day) => [...f.studentsA.map((s) => ({ s, sec: f.sectionA.id })), ...f.studentsB.map((s) => ({ s, sec: f.sectionB.id }))].map((x, i) => ({
        schoolId: f.school.id, academicYearId: f.year.id, studentId: x.s.id, sectionId: x.sec, date: d(day), periodNo: 0,
        statusKey: day === "2026-10-15" && i < 2 ? "absent" : "present",
      }))),
    });
    // One Looking ahead suggestion, as the background job stores them.
    await tx.forecastSignal.create({ data: { schoolId: f.school.id, key: "seats-empty:test", area: "admissions", strength: "WATCH", title: "About 12 of 40 seats in Class 5 may stay empty in 2027-28", body: "Expected about 28 students.", source: "sections and seats", href: "/admission-management/enquiries", score: 30, certainty: "medium" } });
  });
}, 180_000);

describe("the rules on their own", () => {
  it("is weekly on Monday, daily on other mornings, and only sent between 7:30 and 11 AM on a school day", () => {
    expect(briefKind(d("2026-10-19"))).toBe("WEEKLY");
    expect(briefKind(d("2026-10-16"))).toBe("DAILY");
    expect(briefTime(7 * 60 + 29, true)).toBe(false);
    expect(briefTime(7 * 60 + 30, true)).toBe(true);
    expect(briefTime(10 * 60 + 59, true)).toBe(true);
    expect(briefTime(11 * 60, true)).toBe(false);
    expect(briefTime(22 * 60, true)).toBe(false);
    expect(briefTime(8 * 60, false)).toBe(false);
  });

  it("goes by the channels each person chose for it in My profile", () => {
    expect(channelsForType(null, "management-brief")).toEqual(["app"]);
    expect(channelsForType({ "management-brief": ["app", "whatsapp"] }, "management-brief")).toEqual(["app", "whatsapp"]);
  });
});

describe("Today's brief", () => {
  it("says what happened yesterday, what may need the Principal next and what waits, each with its list", async () => {
    const principal = await viewer(f.principal.id);
    const b = await withSchool(principal.ctx, (tx) => composeBrief(tx, principal, at("2026-10-16", "08:00")));
    expect(b).toMatchObject({ kind: "DAILY", title: "Today's brief", period: "Looking back on yesterday, 15-10-2026" });
    const att = b.lines.find((l) => l.text.startsWith("Attendance"))!;
    expect(att).toMatchObject({ section: "happened", text: "Attendance yesterday: 80%, 2 students absent (usually 100% over the 4 weeks before).", href: "/reports-analytics/r/at-daily?period=custom&from=2026-10-15&to=2026-10-15" });
    expect(b.lines.find((l) => l.text.startsWith("Fees collected"))).toMatchObject({ section: "happened", text: "Fees collected yesterday: ₹0 in 0 payments." });
    const next = b.lines.filter((l) => l.section === "next");
    expect(next).toEqual([expect.objectContaining({ text: "About 12 of 40 seats in Class 5 may stay empty in 2027-28", suggestion: true, href: "/admission-management/enquiries" })]);
    expect(b.lines.find((l) => l.section === "decide")).toMatchObject({ text: "Nothing waiting for your approval.", href: "/approvals" });
    // Every line says where its number comes from.
    expect(b.lines.every((l) => l.basis)).toBe(true);
    // The short note for the notification has counts and totals, no student names.
    const note = briefNote(b, "Brief School");
    expect(note).toMatch(/^Today's brief for Brief School: Attendance yesterday: 80%/);
    expect(note).toMatch(/1 suggestion to look at/);
    for (const s of [...f.studentsA, ...f.studentsB]) expect(note).not.toContain(s.name);
  });

  it("is for the Principal and School Admin only, where the school switched it on", async () => {
    expect(briefAllowed(await viewer(f.principal.id))).toBe(true);
    expect(briefAllowed(await viewer(f.admin.id))).toBe(true);
    expect(briefAllowed(await viewer(f.teacherA.id))).toBe(false);
  });

  it("shows on the Dashboard as Today's brief, not on a teacher's", async () => {
    const h = await home(f.principal.id, at("2026-10-16", "09:00"));
    const panel = h.panels.first.find((p) => p.kind === "brief");
    expect(panel).toMatchObject({ kind: "brief", title: "Today's brief" });
    expect(panel?.kind === "brief" && panel.sections.map((s) => s.heading)).toEqual(["What happened", "What may need you next", "Waiting for your decision"]);
    const t = await home(f.teacherA.id, at("2026-10-16", "09:00"));
    expect(t.panels.first.some((p) => p.kind === "brief")).toBe(false);
  });
});

describe("Sending the brief", () => {
  const sent = () => withSchool(sys, (tx) => tx.managementBrief.findMany({ where: { sentAt: { not: null } } }));
  const notes = () => withSchool(sys, (tx) => tx.notification.findMany({ where: { type: "management-brief" } }));

  it("waits until 7:30 in the morning, then sends each leader's brief once", async () => {
    expect(await withSchool(sys, (tx) => sendBriefs(tx, sys, at("2026-10-16", "06:45")))).toMatchObject({ sent: 0, skipped: "not-now" });
    expect(await withSchool(sys, (tx) => sendBriefs(tx, sys, at("2026-10-16", "07:45")))).toMatchObject({ sent: 2 });
    expect((await sent()).map((b) => b.userLoginId).sort()).toEqual([f.principal.id, f.admin.id].sort());
    expect((await notes()).map((n) => n.userLoginId).sort()).toEqual([f.principal.id, f.admin.id].sort());
    // Safe to run twice: nothing is sent again that morning.
    expect(await withSchool(sys, (tx) => sendBriefs(tx, sys, at("2026-10-16", "08:00")))).toMatchObject({ sent: 0 });
    expect(await notes()).toHaveLength(2);
    // The kept brief is what the Dashboard shows.
    const kept = (await sent()).find((b) => b.userLoginId === f.principal.id)!;
    const h = await home(f.principal.id, at("2026-10-16", "10:00"));
    const panel = h.panels.first.find((p) => p.kind === "brief");
    expect(panel?.kind === "brief" && panel.sections.flatMap((s) => s.lines.map((l) => l.text))).toEqual((kept.lines as { text: string }[]).map((l) => l.text));
  });

  it("never sends at night or on a Sunday, and sends the weekly brief on Monday", async () => {
    expect(await withSchool(sys, (tx) => sendBriefs(tx, sys, at("2026-10-17", "22:00")))).toMatchObject({ sent: 0, skipped: "not-now" });
    expect(await withSchool(sys, (tx) => sendBriefs(tx, sys, at("2026-10-18", "07:45")))).toMatchObject({ sent: 0, skipped: "not-now" });
    expect(await withSchool(sys, (tx) => sendBriefs(tx, sys, at("2026-10-19", "07:40")))).toMatchObject({ sent: 2 });
    const weekly = await withSchool(sys, (tx) => tx.managementBrief.findFirstOrThrow({ where: { kind: "WEEKLY", userLoginId: f.principal.id } }));
    expect(weekly.forDate.toISOString().slice(0, 10)).toBe("2026-10-19");
    const principal = await viewer(f.principal.id);
    const b = await withSchool(principal.ctx, (tx) => composeBrief(tx, principal, at("2026-10-19", "08:00")));
    expect(b).toMatchObject({ kind: "WEEKLY", title: "This week's brief", period: "Looking back on last week, 12-10-2026 to 18-10-2026" });
    expect(b.lines.find((l) => l.text.startsWith("Attendance last week"))).toBeTruthy();
  });

  it("sends nothing where the school has not switched it on", async () => {
    await feature(sys, "ai-principal-summary", false);
    expect(await withSchool(sys, (tx) => sendBriefs(tx, sys, at("2026-10-20", "07:45")))).toMatchObject({ sent: 0, skipped: "off" });
    await feature(sys, "ai-principal-summary", true);
  });
});
