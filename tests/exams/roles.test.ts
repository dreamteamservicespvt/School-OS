// Examination & Results role checks on the server (05-roles.md, 08 §1): a role
// without access is refused by the server action itself, not only hidden on
// screen. The signed-in person is swapped in for each call; everything else
// (the permission check, the scope, the transaction) is the real code.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/flash", () => ({ flash: async () => undefined }));

import { reachFor } from "@/lib/permissions";
import { examScope, teachesPaper, writesReportCards } from "@/lib/exams/scope";
import { writesBank } from "@/lib/exams/questions";
import { examSettings } from "@/lib/exams/settings";
import { setFeatureAction, saveScaleAction, addListItemAction } from "@/app/(school)/examination-results/settings/actions";
import { cancelScheduledAction, publishAction } from "@/app/(school)/examination-results/results/actions";
import { reopenPaperAction, lockExamAction } from "@/app/(school)/examination-results/marks/actions";
import { saveRemarksAction } from "@/app/(school)/examination-results/report-cards/actions";
import { saveDatesheet } from "@/app/(school)/examination-results/datesheet/actions";
import { makeUser } from "../helpers";
import { academicSchool } from "../academic/fixture";

let s: Awaited<ReturnType<typeof academicSchool>>;
let accountant: Current;
let teacher: Current;
let office: Current;
let principal: Current;

const as = (c: Current) => { who.current = c; };
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };

beforeAll(async () => {
  s = await academicSchool();
  await s.run(async (tx) => {
    await examSettings(tx, s.ctx);
    await tx.role.updateMany({ where: { key: "office-staff" }, data: { isEnabled: true } });
  });
  const acc = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["accountant"] }] });
  const off = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["office-staff"] }] });
  accountant = await s.currentFor(acc.id);
  office = await s.currentFor(off.id);
  teacher = await s.currentFor(s.teacherUser.id);
  principal = await s.currentFor(s.principal.id);
}, 120_000);

describe("who reaches Examination & Results", () => {
  it("the Accountant has no access at all, and is refused by every action", async () => {
    expect(reachFor(accountant.permissions, "examination-results", "view")).toBe("none");
    as(accountant);
    expect(await setFeatureAction("exam-seating", true)).toMatch(/permission|cannot|role/i);
    expect(await cancelScheduledAction("00000000-0000-0000-0000-000000000000")).toMatch(/permission|cannot|role/i);
    const r = await saveDatesheet({ ok: false }, form({ title: "Sneaky" }));
    expect(r?.ok).toBe(false);
  });

  it("a teacher's scope: own sections only, no settings, no locking, no publishing", async () => {
    const scope = await s.run((tx) => examScope(tx, teacher, s.year.id));
    expect(scope).toMatchObject({ manage: false, publish: false, datesheets: false, office: false, results: true });
    expect(new Set(scope.sectionIds)).toEqual(new Set([s.s5a.id, s.s5b.id]));
    expect(teachesPaper(scope, s.s5a.id, s.subjects.MAT)).toBe(true);
    expect(teachesPaper(scope, s.s5a.id, s.subjects.ENG)).toBe(false);
    expect(teachesPaper(scope, s.s6a.id, s.subjects.MAT)).toBe(false);
    expect(writesReportCards(scope, s.s5a.id)).toBe(true); // class teacher of 5 A
    expect(writesReportCards(scope, s.s5b.id)).toBe(false);
    expect(await s.run((tx) => writesBank(tx, scope, s.year.id, s.c5.id, s.subjects.MAT))).toBe(true);
    expect(await s.run((tx) => writesBank(tx, scope, s.year.id, s.c5.id, s.subjects.SCI))).toBe(false);
    expect(await s.run((tx) => writesBank(tx, scope, s.year.id, s.c6.id, s.subjects.MAT))).toBe(false);
  });

  it("the server refuses a teacher's settings, datesheet, lock, reopen and publish actions", async () => {
    as(teacher);
    expect(await setFeatureAction("exam-seating", true)).toMatch(/Ask the Exam In-charge or the Principal|cannot|permission/i);
    expect(await addListItemAction("examType", "Sneaky test")).toBeTruthy();
    expect(await saveScaleAction(null, "Sneaky scale", [])).toBeTruthy();
    expect(await lockExamAction("00000000-0000-0000-0000-000000000000")).toBeTruthy();
    expect((await reopenPaperAction({ ok: false }, form({ entryId: "x", sectionId: s.s5a.id, reason: "x" })))?.ok).toBe(false);
    expect((await saveDatesheet({ ok: false }, form({ title: "Sneaky" })))?.message).toMatch(/does not prepare datesheets|cannot|permission/i);
    const pub = await publishAction({ ok: false }, form({ key: `exam:00000000-0000-0000-0000-000000000000`, sectionIds: s.s5a.id }));
    expect(pub?.ok).toBe(false);
    const n = await s.run((tx) => tx.examType.count({ where: { name: "Sneaky test" } }));
    expect(n).toBe(0);
  });

  it("a teacher cannot write remarks for a section they are not class teacher of", async () => {
    as(teacher);
    const r = await saveRemarksAction(s.s5b.id, "year", [{ studentId: "00000000-0000-0000-0000-000000000000", classTeacherRemark: "Good" }]);
    expect(r?.ok).toBe(false);
    expect(r.message).toMatch(/Only the class teacher/);
  });

  it("Office Staff prepare datesheets but see no marks or results", async () => {
    const scope = await s.run((tx) => examScope(tx, office, s.year.id));
    expect(scope).toMatchObject({ office: true, manage: false, publish: false, results: false });
    expect(teachesPaper(scope, s.s5a.id, s.subjects.MAT)).toBe(false);
  });

  it("the Principal may change settings and publish", async () => {
    const scope = await s.run((tx) => examScope(tx, principal, s.year.id));
    expect(scope).toMatchObject({ manage: true, publish: true, datesheets: true, principal: true, sectionIds: null });
    as(principal);
    expect(await setFeatureAction("exam-seating", true)).toBeUndefined();
  });
});
