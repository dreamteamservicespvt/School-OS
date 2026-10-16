// Co-curricular & Sports, Daily Activities, parent consent for events and PTM
// breaks: the rules (credits, house points with a reason, certificates once,
// the diary written only by the pre-primary class teacher, consent registers
// the child) and who may do what, through the real server actions.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { evPageAllowed } from "@/lib/events/access";
import { saveEventsSettings } from "@/lib/events/settings";
import { addHousePoints, archiveAchievement, assignHouses, creditTotals, issueCertificates, leaderboard, recordAchievements, saveHouse } from "@/lib/events/cocurricular";
import { assignActivity, logActivity, todayProgress } from "@/lib/events/daily";
import { consentCounts, recordConsent } from "@/lib/events/consent";
import { createEvent } from "@/lib/events/events";
import { planPtm, slotStarts } from "@/lib/events/ptm";
import { EventsProblem } from "@/lib/events/problem";
import { TODAY, as, evFor, eventInput, makeEventsSchool, type EvFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Activities School" } };
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const acts = await import("@/app/(school)/events-calendar/activity-actions");

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};

describe("Co-curricular & Sports, Daily Activities and consent", () => {
  let f: EvFixture;
  let ukg = "";
  let kids: string[] = [];
  const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };

  beforeAll(async () => {
    f = await makeEventsSchool("Activities School");
    // A pre-primary class, UKG A, with Meena as class teacher and two children.
    const sys = as(f, null);
    const r = await withSchool(sys, async (tx) => {
      const cls = await tx.schoolClass.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "UKG", sortOrder: 0, level: "Pre-primary" } });
      const sec = await tx.section.create({ data: { schoolId: f.school.id, classId: cls.id, academicYearId: f.yearId, name: "A", classTeacherId: f.meena.id } });
      const ids: string[] = [];
      for (const [n, first] of [[21, "Anaya"], [22, "Advik"]] as const) {
        const st = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, admissionNo: `EV-${n}`, firstName: first, lastName: "Reddy", fullName: `${first} Reddy`, status: "ACTIVE" } });
        await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: st.id, academicYearId: f.yearId, classId: cls.id, sectionId: sec.id, rollNo: n } });
        ids.push(st.id);
      }
      return { sec: sec.id, ids };
    });
    ukg = r.sec;
    kids = r.ids;
  });

  it("records achievements with activity credits by level, and reverses them when taken off the record", async () => {
    const p = as(f, f.principal.id);
    await withSchool(p, (tx) => saveEventsSettings(tx, p, { creditsOn: true }));
    const r = await withSchool(p, (tx) => recordAchievements(tx, p, { studentIds: [f.aarav.id, f.diya.id], activity: "Inter-school quiz", kind: "Olympiad", level: "District", position: "1st", won: true, date: TODAY, certificate: false }, TODAY));
    expect(r.made).toHaveLength(2);
    expect(r.credits).toBe(20);
    const totals = await withSchool(p, (tx) => creditTotals(tx, [f.aarav.id], f.yearId));
    expect(totals.get(f.aarav.id)).toBe(20);
    await withSchool(p, (tx) => archiveAchievement(tx, p, r.made[0].id, "Recorded for the wrong student", TODAY));
    expect((await withSchool(p, (tx) => creditTotals(tx, [f.aarav.id], f.yearId))).get(f.aarav.id)).toBe(0);
    await expect(withSchool(p, (tx) => recordAchievements(tx, p, { studentIds: [f.aarav.id], activity: "Future quiz", kind: "Olympiad", level: "School", position: null, won: false, date: "2026-12-01", certificate: false }, TODAY))).rejects.toThrow(EventsProblem);
  });

  it("numbers a certificate once", async () => {
    const p = as(f, f.principal.id);
    const r = await withSchool(p, (tx) => recordAchievements(tx, p, { studentIds: [f.kabir.id], activity: "Art competition", kind: "Art", level: "School", position: null, won: false, date: TODAY, certificate: false }, TODAY));
    const first = await withSchool(p, (tx) => issueCertificates(tx, p, [r.made[0].id]));
    expect(first.issued).toBe(1);
    await expect(withSchool(p, (tx) => issueCertificates(tx, p, [r.made[0].id]))).rejects.toThrow(/already issued/);
    const a = await withSchool(p, (tx) => tx.achievement.findUniqueOrThrow({ where: { id: r.made[0].id } }));
    expect(a.certificateNo).toMatch(/^CC\/2026\//);
  });

  it("needs a reason for house points and keeps every change; assigns houses in turn", async () => {
    const p = as(f, f.principal.id);
    const red = await withSchool(p, (tx) => saveHouse(tx, p, { name: "Tagore House", colour: "bad", captainStudentId: null }));
    await withSchool(p, (tx) => saveHouse(tx, p, { name: "Raman House", colour: "info", captainStudentId: null }));
    await expect(withSchool(p, (tx) => addHousePoints(tx, p, red.id, 10, "", TODAY))).rejects.toThrow(/reason/);
    await withSchool(p, (tx) => addHousePoints(tx, p, red.id, 50, "Inter-house quiz, winners", TODAY));
    await withSchool(p, (tx) => addHousePoints(tx, p, red.id, -10, "Late to assembly", TODAY));
    const board = await withSchool(p, (tx) => leaderboard(tx, f.yearId));
    expect(board[0].name).toBe("Tagore House");
    expect(board[0].points).toBe(40);
    const turn = await withSchool(p, (tx) => assignHouses(tx, p, { mode: "turn" }, TODAY));
    expect(turn.assigned).toBe(5);
    await expect(withSchool(p, (tx) => assignHouses(tx, p, { mode: "turn" }, TODAY))).rejects.toThrow(/already has a house/);
  });

  it("lets only the pre-primary class teacher write the diary; the Principal and VP read and remind", async () => {
    const m = as(f, f.meenaLogin.id);
    const a = await withSchool(m, (tx) => assignActivity(tx, m, { sectionId: ukg, type: "Meal", label: "Snack", startMin: 10 * 60, dates: [TODAY] }, TODAY));
    expect(a.made).toBe(1);
    const act = await withSchool(m, (tx) => tx.dailyActivity.findFirstOrThrow({ where: { sectionId: ukg } }));
    const logged = await withSchool(m, (tx) => logActivity(tx, m, { activityId: act.id, studentIds: kids, value: "Ate all", note: null }, TODAY));
    expect(logged.logged).toBe(2);
    for (const id of [f.principal.id, f.vp.id, f.teacher.id]) {
      const c = as(f, id);
      await expect(withSchool(c, (tx) => logActivity(tx, c, { activityId: act.id, studentIds: kids, value: "Ate half", note: null }, TODAY))).rejects.toThrow(/Only the class teacher of UKG A/);
      await expect(withSchool(c, (tx) => assignActivity(tx, c, { sectionId: ukg, type: "Nap", label: "Nap", startMin: 13 * 60, dates: [TODAY] }, TODAY))).rejects.toThrow(/Only the class teacher/);
    }
    // Through the server actions too.
    for (const id of [f.principal.id, f.vp.id]) {
      asUser(id);
      const r = await acts.logActivityAction(null, form({ activityId: act.id, studentIds: kids, value: "Ate half" }));
      expect(r?.ok).toBe(false);
      expect((await acts.sendDiaryAction(null, form({ sectionId: ukg })))?.ok).toBe(false);
    }
    const p = as(f, f.principal.id);
    const progress = await withSchool(p, (tx) => todayProgress(tx, p, f.yearId, TODAY, 11 * 60));
    expect(progress.find((x) => x.id === ukg)).toMatchObject({ due: 1, logged: 1, missing: [] });
    // A teacher cannot send a diary reminder; the events team can open Daily Activities.
    asUser(f.teacher.id);
    expect((await acts.remindDiaryAction(null, form({ sectionId: ukg })))?.ok).toBe(false);
    expect(evPageAllowed((await evFor(f, f.principal.id)).v, "daily")).toBe(true);
  });

  it("refuses Co-curricular & Sports changes to teachers, the Accountant and View roles", async () => {
    for (const id of [f.teacher.id, f.accountant.id, f.librarian.id]) {
      asUser(id);
      expect((await acts.achievementAction(null, form({ studentIds: [f.aarav.id], activity: "Quiz", kind: "Olympiad", level: "School", date: TODAY })))?.ok).toBe(false);
      expect((await acts.clubAction(null, form({ name: "Eco Club" })))?.ok).toBe(false);
      expect((await acts.teamAction(null, form({ name: "Under-14 Cricket", sport: "Cricket", coachName: "Visiting" })))?.ok).toBe(false);
      expect((await acts.fixtureAction(null, form({ title: "Match", date: TODAY })))?.ok).toBe(false);
      expect(evPageAllowed((await evFor(f, id)).v, "cocurricular")).toBe(false);
    }
    asUser(f.vp.id);
    expect((await acts.clubAction(null, form({ name: "Eco Club", meets: "Thursdays, 2:20 PM" })))?.ok).toBe(true);
  });

  it("registers a child when the parent gives consent and charges nothing on a no", async () => {
    const p = as(f, f.principal.id);
    const e = await withSchool(p, (tx) => createEvent(tx, p, eventInput({ name: "Wonderla picnic", date: "2026-10-24", feePaise: BigInt(120000), consentOn: true, consentBy: "2026-10-20" })));
    await withSchool(p, (tx) => recordConsent(tx, p, { eventId: e.id, studentId: f.aarav.id, answer: "GIVEN", guardianId: null, how: "office" }, TODAY));
    await withSchool(p, (tx) => recordConsent(tx, p, { eventId: e.id, studentId: f.diya.id, answer: "DECLINED", guardianId: null, how: "office" }, TODAY));
    const regs = await withSchool(p, (tx) => tx.eventRegistration.findMany({ where: { eventId: e.id, withdrawnAt: null } }));
    expect(regs.map((r) => r.studentId)).toEqual([f.aarav.id]);
    const c = await withSchool(p, (tx) => consentCounts(tx, e));
    expect(c.given).toBe(1);
    expect(c.declined).toBe(1);
    await expect(withSchool(p, (tx) => createEvent(tx, p, eventInput({ name: "No reg", registrationOn: false, consentOn: true })))).rejects.toThrow(/registration/);
  });

  it("makes no PTM slots inside a break", async () => {
    expect(slotStarts(570, 630, 10, 590, 600)).toEqual([570, 580, 600, 610, 620]);
    const p = as(f, f.principal.id);
    const r = await withSchool(p, (tx) => planPtm(tx, p, { date: "2026-12-07", classIds: [f.c1], startMin: 570, endMin: 630, slotMinutes: 10, venue: null, subjectTeachers: false, breakStartMin: 590, breakEndMin: 600 }, TODAY));
    const slots = await withSchool(p, (tx) => tx.ptmSlot.findMany({ where: { ptmId: r.ptm.id }, orderBy: { startMin: "asc" } }));
    expect(slots.map((s) => s.startMin)).toEqual([570, 580, 600, 610, 620]);
  });
});
