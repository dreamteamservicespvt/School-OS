// Academic Management from Excel (gap list G44): Teacher Allocation, the Time
// Table and the syllabus, each on the one import engine with heading matching,
// row problems in plain words, choices for a teacher's name, Undo, the Audit
// Log and Academic Management's own rules (05-roles.md).
import { beforeAll, describe, expect, it } from "vitest";
import type { SchoolContext, Tx } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { undoImport } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import { addUpload, chooseRow, importFile, settleImports, workOn } from "@/lib/move-in/service";
import { placeRefusal } from "@/lib/imports/place-access";
import { fileHref, PLACES } from "@/lib/imports/places";
import "@/lib/import-registry";
import { academicSchool, d } from "../academic/fixture";
import { makeUser } from "../helpers";

let s: Awaited<ReturnType<typeof academicSchool>>;
let c: SchoolContext;

beforeAll(async () => {
  s = await academicSchool();
  c = s.ctx;
}, 120_000);

const run = <T,>(fn: (tx: Tx) => Promise<T>) => s.run(fn);

async function upload(text: string, name: string, kind: string) {
  const a = (await accessIn(c.userId!, c.schoolId))!;
  return run(async (tx) => {
    const saved = await saveFile(tx, c, { file: new File([text], name), purpose: "move-in", allowed: SHEET_TYPES });
    return addUpload(tx, c, a.permissions, { fileId: saved.id, fileName: name, kind }, a.modulesOn);
  });
}

async function drain() {
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: c.schoolId })) === 0) break;
  await run((tx) => settleImports(tx));
}

/** Brings in the ready rows of a file and returns the import's batch id. */
async function bringIn(id: string) {
  await run((tx) => importFile(tx, c, id, { link: fileHref(PLACES.academic, id) }));
  await drain();
  return (await run((tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }))).batchId!;
}

const checkOf = async (id: string) => (await run((tx) => workOn(tx, c, id, { check: true }))).checked!;
const problemOf = (checked: Awaited<ReturnType<typeof checkOf>>, line: number) => checked.problems.find((p) => p.line === line);

describe("Teacher allocation from Excel (G44)", () => {
  it("full Academic Management only, on its own page and in Switching to School OS", async () => {
    const principal = await s.currentFor(s.principal.id);
    const teacher = await s.currentFor(s.teacherUser.id);
    await run((tx) => tx.role.updateMany({ where: { schoolId: s.school.id, key: "office-staff" }, data: { isEnabled: true } }));
    const office = await s.currentFor((await makeUser({ schools: [{ id: s.school.id, roleKeys: ["office-staff"] }] })).id);
    for (const need of ["create", "archive"] as const) {
      expect(await placeRefusal(principal, PLACES.academic, "academic-allocations", need)).toBeNull();
      expect(await placeRefusal(principal, PLACES.settings, "academic-allocations", need)).toBeNull();
    }
    for (const p of [teacher, office]) {
      expect(await placeRefusal(p, PLACES.academic, "academic-allocations", "create")).toMatch(/full Academic Management/);
      expect(await placeRefusal(p, PLACES.settings, "academic-allocations", "create")).not.toBeNull();
    }
  });

  it("matches the headings, explains each row, asks before a name or a hand-over, brings in the rest and Undo puts everything back", async () => {
    const [asha, kiran, meera, vikram] = s.staff;
    const csv = [
      "Std,Sec,Subject,Faculty,Role,Class Teacher,Periods,From",
      "Class 6,A,English,Meera Pillai,Secondary,No,2,",
      "6,A,SCI,Vikram Shah,,Yes,,01-11-2026",
      "5-B,,Maths,Asha Rao,,,,",
      "5,B,Science,Rao,Secondary,,,",
      "Class 5,A,Hindi,Kiran Das,,,,",
      "Class 9,A,MAT,Kiran Das,,,,",
      "5,B,,Kiran Das,,Yes,,",
      "5,A,English,Nobody Known,Main teacher,Maybe,99,",
    ].join("\n");
    const [id] = await upload(csv, "allocation.csv", "academic-allocations");
    const w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ className: [0], sectionName: [1], subject: [2], teacher: [3], role: [4], classTeacher: [5], periodsPerWeek: [6], fromDate: [7] });
    let checked = w.checked!;
    expect(checked.ready.map((r) => r.line)).toEqual([2, 8]);
    expect(problemOf(checked, 3)?.problems.join(" ")).toMatch(/Meera Pillai teaches Science in Class 6 A now\. Choose to hand over to Vikram Shah/);
    expect(problemOf(checked, 3)?.choices).toEqual([expect.objectContaining({ value: `handover:${vikram.id}` })]);
    expect(problemOf(checked, 4)?.problems.join(" ")).toMatch(/Asha Rao already teaches Mathematics in Class 5 B\. Leave this row out/);
    expect(problemOf(checked, 5)?.problems.join(" ")).toMatch(/No staff member is called "Rao" exactly/);
    expect(problemOf(checked, 5)?.choices.map((x) => x.value)).toEqual([`staff:${asha.id}`]);
    expect(problemOf(checked, 6)?.problems.join(" ")).toMatch(/Subject "Hindi" is not in Subjects/);
    expect(problemOf(checked, 7)?.problems.join(" ")).toMatch(/Class 9 A is not set up this year/);
    const many = problemOf(checked, 9)?.problems.join(" ") ?? "";
    for (const words of [/No staff member has the staff ID or name "Nobody Known"/, /Role must be Primary or Secondary/, /Class teacher must be Yes or No/, /Periods per week must be a whole number/]) expect(many).toMatch(words);

    // The choices on screen: which Rao, and hand Science in 6 A over to Vikram.
    await run((tx) => chooseRow(tx, c, id, 5, `staff:${asha.id}`));
    await run((tx) => chooseRow(tx, c, id, 3, `handover:${vikram.id}`));
    checked = await checkOf(id);
    expect(checked.ready.map((r) => r.line)).toEqual([2, 3, 5, 8]);

    const batchId = await bringIn(id);
    const batch = await run((tx) => tx.importBatch.findUniqueOrThrow({ where: { id: batchId } }));
    expect(batch).toMatchObject({ added: 2, updated: 2 });
    const active = (staffId: string, sectionId: string, code: string) => run((tx) => tx.teacherAllocation.findFirst({ where: { staffId, sectionId, subjectId: s.subjects[code], archivedAt: null } }));
    expect(await active(meera.id, s.s6a.id, "ENG")).toMatchObject({ isMain: false, periodsPerWeek: 2 });
    expect(await active(vikram.id, s.s6a.id, "SCI")).toMatchObject({ isMain: true, fromDate: d("2026-11-01") });
    expect((await active(meera.id, s.s6a.id, "SCI"))?.toDate).toEqual(d("2026-10-31"));
    expect(await active(asha.id, s.s5b.id, "SCI")).toMatchObject({ isMain: false });
    const sections = async () => Object.fromEntries((await run((tx) => tx.section.findMany({ where: { id: { in: [s.s6a.id, s.s5b.id] } } }))).map((x) => [x.id, x.classTeacherId]));
    expect(await sections()).toEqual({ [s.s6a.id]: vikram.id, [s.s5b.id]: kiran.id });
    expect(await run((tx) => tx.auditLogEntry.count({ where: { recordType: "Teacher Allocation", action: "handed-over" } }))).toBe(1);

    expect(await run((tx) => undoImport(tx, c, batchId))).toMatchObject({ archived: 2, putBack: 2 });
    expect(await active(meera.id, s.s6a.id, "ENG")).toBeNull();
    expect(await active(vikram.id, s.s6a.id, "SCI")).toBeNull();
    expect(await active(asha.id, s.s5b.id, "SCI")).toBeNull();
    expect((await active(meera.id, s.s6a.id, "SCI"))?.toDate).toBeNull();
    expect(await sections()).toEqual({ [s.s6a.id]: null, [s.s5b.id]: null });
  });
});
