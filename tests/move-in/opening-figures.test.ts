// Mid-year opening figures (gap list G19): a school that starts on School OS
// part way through the year brings in attendance so far, leave balances,
// staff pay details and salary to date, each on the one import engine with
// its module's own rules, row problems, Undo and Audit Log.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { undoImport } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { addUpload, importFile, settleImports, workOn } from "@/lib/move-in/service";
import { placeRefusal } from "@/lib/imports/place-access";
import { fileHref, PLACES } from "@/lib/imports/places";
import { attendanceSummary } from "@/lib/attendance/summary";
import { statusList } from "@/lib/attendance/settings";
import "@/lib/import-registry";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";
import { makeUser } from "../helpers";

let f: FeeSchool;

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

/** What the place checks read of the signed-in person. */
async function who(userId: string, schoolId = f.school.id): Promise<Current> {
  const a = (await accessIn(userId, schoolId))!;
  return { permissions: a.permissions, roles: a.roles, modulesOn: a.modulesOn, user: { id: userId }, ctx: { schoolId, userId } } as unknown as Current;
}

const run = <T,>(c: SchoolContext, fn: (tx: Tx) => Promise<T>) => withSchool(c, fn, { timeout: 120_000 });
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function upload(c: SchoolContext, text: string, name: string, kind: string) {
  const a = (await accessIn(c.userId!, c.schoolId))!;
  return run(c, async (tx) => {
    const saved = await saveFile(tx, c, { file: new File([text], name), purpose: "move-in", allowed: SHEET_TYPES });
    return addUpload(tx, c, a.permissions, { fileId: saved.id, fileName: name, kind }, a.modulesOn);
  });
}

async function drain(c: SchoolContext) {
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: c.schoolId })) === 0) break;
  await run(c, (tx) => settleImports(tx));
}

/** Checks a file, brings in the ready rows and returns the import's batch id. */
async function bringIn(c: SchoolContext, id: string, place: (typeof PLACES)[keyof typeof PLACES]) {
  await run(c, (tx) => importFile(tx, c, id, { link: fileHref(place, id) }));
  await drain(c);
  return (await run(c, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }))).batchId!;
}

describe("Attendance so far (G19)", () => {
  it("full Attendance Management only, on its own page and in Switching to School OS", async () => {
    const principal = await who(f.principal.id);
    const acc = await who(f.accountant.id);
    const teacher = await who((await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }] })).id);
    expect(await placeRefusal(principal, PLACES.attendance, "attendance-so-far", "create")).toBeNull();
    expect(await placeRefusal(principal, PLACES.settings, "attendance-so-far", "create")).toBeNull();
    expect(await placeRefusal(principal, PLACES.attendance, "attendance-so-far", "archive")).toBeNull();
    for (const p of [acc, teacher]) {
      expect(await placeRefusal(p, PLACES.attendance, "attendance-so-far", "create")).toMatch(/Only the Principal, the Vice Principal or the School Admin/);
      expect(await placeRefusal(p, PLACES.settings, "attendance-so-far", "create")).not.toBeNull();
    }
  });

  it("brings in one opening total per student, counted in the year's % and not in a month after it; Undo takes it back", async () => {
    const c = f.pctx;
    const csv = [
      "Adm No,Total Working Days,Present Days,As on",
      `${f.ravi.admissionNo},92,87.5,30-09-2026`,
      `${f.sita.admissionNo},,,`,
      `${f.anil.admissionNo},10,12,30-09-2026`,
      "NOPE-1,10,9,30-09-2026",
      `${f.ravi.admissionNo},50,40,30-09-2026`,
      `${f.sita.admissionNo},200,100,31-03-2026`,
    ].join("\n");
    const [id] = await upload(c, csv, "attendance.csv", "attendance-so-far");
    const w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ admissionNo: [0], daysMet: [1], daysPresent: [2], upToDate: [3] });
    const checked = w.checked!;
    expect(checked.ready.map((r) => r.line)).toEqual([2]);
    const problem = (line: number) => checked.problems.find((p) => p.line === line)?.problems.join(" ") ?? "";
    expect(problem(4)).toMatch(/Days present \(12\) cannot be more than the days the school met \(10\)/);
    expect(problem(5)).toMatch(/No student with admission number "NOPE-1"/);
    expect(problem(6)).toMatch(/twice in the file/);
    expect(problem(7)).toMatch(/Up to must be in 2026-27/);
    // An empty row in a sheet of every student is left out, not a problem.
    expect(checked.problems.some((p) => p.line === 3)).toBe(false);

    const batchId = await bringIn(c, id, PLACES.attendance);
    const row = await run(c, (tx) => tx.openingAttendance.findFirstOrThrow({ where: { studentId: f.ravi.id, archivedAt: null } }));
    expect(row).toMatchObject({ academicYearId: f.year.id, fromDate: day("2026-04-01"), upTo: day("2026-09-30") });
    expect(Number(row.daysMet)).toBe(92);
    expect(await run(c, (tx) => tx.auditLogEntry.count({ where: { action: "brought-in", recordType: "Opening Attendance", recordId: row.id } }))).toBe(1);

    // One absent day in School OS after go-live, and a stray mark inside the brought-in weeks (not counted twice).
    await run(c, async (tx) => {
      await statusList(tx, c);
      await tx.attendanceMark.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, studentId: f.ravi.id, sectionId: f.a.id, date: day("2026-10-01"), statusKey: "absent" } });
      await tx.attendanceMark.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, studentId: f.ravi.id, sectionId: f.a.id, date: day("2026-09-15"), statusKey: "absent" } });
    });
    const year = await run(c, (tx) => attendanceSummary(tx, c, { studentIds: [f.ravi.id], from: f.year.startDate, to: day("2026-10-01") }));
    const p = year.people.get(f.ravi.id)!;
    expect(p).toMatchObject({ countedDays: 93, present: 87.5, absent: 5.5, percent: 94.1 });
    expect(p.broughtIn).toMatchObject({ met: 92, present: 87.5 });
    // A section's register over the year counts it too.
    const section = await run(c, (tx) => attendanceSummary(tx, c, { sectionId: f.a.id, from: f.year.startDate, to: day("2026-10-01") }));
    expect(section.people.get(f.ravi.id)?.percent).toBe(94.1);
    // October alone does not hold the brought-in weeks.
    const october = await run(c, (tx) => attendanceSummary(tx, c, { studentIds: [f.ravi.id], from: day("2026-10-01"), to: day("2026-10-01") }));
    expect(october.people.get(f.ravi.id)).toMatchObject({ countedDays: 1, percent: 0 });

    // Brought in twice: the second file says so.
    const [again] = await upload(c, `Admission number,Days the school met,Days present,Up to\n${f.ravi.admissionNo},92,87,30-09-2026\n`, "again.csv", "attendance-so-far");
    const second = (await run(c, (tx) => workOn(tx, c, again, { check: true }))).checked!;
    expect(second.problems[0].problems.join(" ")).toMatch(/already brought in \(87.5 of 92 days up to 30-09-2026\)/);

    await run(c, (tx) => undoImport(tx, c, batchId));
    expect((await run(c, (tx) => tx.openingAttendance.findUniqueOrThrow({ where: { id: row.id } }))).archivedAt).not.toBeNull();
    const after = await run(c, (tx) => attendanceSummary(tx, c, { studentIds: [f.ravi.id], from: f.year.startDate, to: day("2026-10-01") }));
    expect(after.people.get(f.ravi.id)).toMatchObject({ countedDays: 2, percent: 0 });
    expect(after.people.get(f.ravi.id)?.broughtIn).toBeUndefined();
  });
});
