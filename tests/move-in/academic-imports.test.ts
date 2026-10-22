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

describe("Time Table from Excel (G44)", () => {
  it("the people who keep the Time Table: full Academic Management or the Office Staff template", async () => {
    const principal = await s.currentFor(s.principal.id);
    const teacher = await s.currentFor(s.teacherUser.id);
    await run((tx) => tx.role.updateMany({ where: { schoolId: s.school.id, key: "office-staff" }, data: { isEnabled: true } }));
    const office = await s.currentFor((await makeUser({ schools: [{ id: s.school.id, roleKeys: ["office-staff"] }] })).id);
    for (const p of [principal, office]) {
      expect(await placeRefusal(p, PLACES.academic, "academic-timetable", "create")).toBeNull();
      expect(await placeRefusal(p, PLACES.academic, "academic-timetable", "archive")).toBeNull();
    }
    expect(await placeRefusal(office, PLACES.settings, "academic-timetable", "create")).toBeNull();
    expect(await placeRefusal(teacher, PLACES.academic, "academic-timetable", "create")).toMatch(/does not arrange the Time Table/);
    expect(await placeRefusal(teacher, PLACES.settings, "academic-timetable", "create")).not.toBeNull();
  });

  it("fills the year's draft, never the published Time Table; clashes and periods outside the plan are row problems; Undo puts the draft back", async () => {
    const [asha, kiran, meera, vikram] = s.staff;
    const published = () => run((tx) => tx.timetablePeriod.findMany({ where: { versionId: s.version.id, archivedAt: null }, orderBy: [{ sectionId: "asc" }, { dayOfWeek: "asc" }, { periodNo: "asc" }] }));
    const before = await published();
    const csv = [
      "Class,Sec,Day,Period No,Subject,Teacher,Room",
      "5,A,Mon,1,Maths,,",
      "5,A,Monday,Period 2,English,Kiran Das,",
      "5,B,MON,1,Science,Meera Pillai,",
      "6,A,Mon,1,English,Kiran Das,",
      "5,B,Monday,2,Maths,Kiran Das,",
      "5,A,Mon,9,Science,Meera Pillai,",
      "5,A,Sun,3,Science,Meera Pillai,",
      "5,A,Mon,1,Science,Meera Pillai,",
      "6,A,Tue,3,Hindi,,",
      "5,A,Tue,4,Science,Meera Pillai,Lab",
      "6,A,Tue,4,Maths,Vikram Shah,Lab",
    ].join("\n");
    const [id] = await upload(csv, "timetable.csv", "academic-timetable");
    const w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ className: [0], sectionName: [1], day: [2], period: [3], subject: [4], teacher: [5], room: [6] });
    const checked = w.checked!;
    expect(checked.ready.map((r) => r.line)).toEqual([2, 3, 4, 5, 11]);
    const problem = (line: number) => problemOf(checked, line)?.problems.join(" ") ?? "";
    expect(problem(6)).toMatch(/Kiran Das is already in Class 5 A \(row 3\), period 2 on Monday/);
    expect(problem(7)).toMatch(/Period 9 is not in the school's period plan\. Its periods are 1, 2, 3, 4, 5, 6, 7, 8/);
    expect(problem(8)).toMatch(/Sunday is not a working day/);
    expect(problem(9)).toMatch(/Class 5 A, period 1 on Monday is twice in the file/);
    expect(problem(10)).toMatch(/Subject "Hindi" is not in Subjects/);
    expect(problem(12)).toMatch(/Room Lab is already booked for Class 5 A \(row 11\), period 4 on Tuesday/);

    const batchId = await bringIn(id);
    const tb = await run((tx) => tx.importBatch.findUniqueOrThrow({ where: { id: batchId } }));
    expect(tb).toMatchObject({ added: 1, updated: 4 });
    // The published Time Table is untouched; the rows are in a draft.
    expect(await published()).toEqual(before);
    const draft = await run((tx) => tx.timetableVersion.findFirstOrThrow({ where: { academicYearId: s.year.id, status: "DRAFT", archivedAt: null } }));
    const cells = async (sectionId: string) => (await run((tx) => tx.timetablePeriod.findMany({ where: { versionId: draft.id, sectionId, archivedAt: null }, orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }] })))
      .map((p) => `${p.dayOfWeek}:${p.periodNo}:${p.staffId}:${p.room ?? ""}`);
    // Each class named in the file is replaced; Asha comes from Teacher Allocation for Maths in 5 A.
    expect(await cells(s.s5a.id)).toEqual([`1:1:${asha.id}:`, `1:2:${kiran.id}:`, `2:4:${meera.id}:Lab`]);
    expect(await cells(s.s5b.id)).toEqual([`1:1:${meera.id}:`]);
    expect(await cells(s.s6a.id)).toEqual([`1:1:${kiran.id}:`]);
    expect(vikram.id).toBeTruthy();

    expect(await run((tx) => undoImport(tx, c, batchId))).toMatchObject({ archived: 1, putBack: 4 });
    // The draft is the copy of the published Time Table again.
    const copy = (rows: { sectionId: string; dayOfWeek: number; periodNo: number; staffId: string | null; subjectId: string | null }[]) => rows.map((p) => `${p.sectionId}:${p.dayOfWeek}:${p.periodNo}:${p.staffId}:${p.subjectId}`).sort();
    expect(copy(await run((tx) => tx.timetablePeriod.findMany({ where: { versionId: draft.id, archivedAt: null } })))).toEqual(copy(before));

    // A draft published since cannot be changed by Undo.
    // Asha is in 5 B, period 2 on Tuesday, and 5 B is not in this file: that row is not saved, with the reason.
    const [again] = await upload("Class,Section,Day,Period,Subject,Teacher\n5,A,Wed,5,Science,Meera Pillai\n5,A,Tue,2,Maths,Asha Rao\n", "again.csv", "academic-timetable");
    expect((await checkOf(again)).ready).toHaveLength(2);
    const second = await bringIn(again);
    const kept = await run((tx) => tx.importBatch.findUniqueOrThrow({ where: { id: second } }));
    expect(kept).toMatchObject({ skipped: 1 });
    expect(JSON.stringify(kept.errorReport)).toMatch(/Asha Rao is already in Class 5 B, period 2 on Tuesday\. That is in the draft Time Table, in a class this file does not change/);
    const { publishVersion } = await import("@/lib/academic/timetable");
    const { todayIn, addDays } = await import("@/lib/academic/common");
    await run((tx) => publishVersion(tx, c, draft.id, addDays(todayIn(), 1), todayIn()));
    await expect(run((tx) => undoImport(tx, c, second))).rejects.toThrow(/is published, so this import cannot be undone/);
  });
});

describe("Syllabus from Excel (G44)", () => {
  it("full Academic Management only", async () => {
    const principal = await s.currentFor(s.principal.id);
    const teacher = await s.currentFor(s.teacherUser.id);
    await run((tx) => tx.role.updateMany({ where: { schoolId: s.school.id, key: "office-staff" }, data: { isEnabled: true } }));
    const office = await s.currentFor((await makeUser({ schools: [{ id: s.school.id, roleKeys: ["office-staff"] }] })).id);
    expect(await placeRefusal(principal, PLACES.academic, "academic-syllabus", "create")).toBeNull();
    expect(await placeRefusal(principal, PLACES.settings, "academic-syllabus", "archive")).toBeNull();
    for (const p of [teacher, office]) {
      expect(await placeRefusal(p, PLACES.academic, "academic-syllabus", "create")).toMatch(/full Academic Management/);
      expect(await placeRefusal(p, PLACES.settings, "academic-syllabus", "create")).not.toBeNull();
    }
  });

  it("reads the planned month or week inside the school year", async () => {
    const { plannedIn } = await import("@/lib/academic/syllabus-import");
    const year = { name: "2026-27", startDate: d("2026-04-01"), endDate: d("2027-03-31") };
    expect(plannedIn("Jan", year)).toEqual({ from: d("2027-01-01"), to: d("2027-01-31") });
    expect(plannedIn("July 2026", year)).toEqual({ from: d("2026-07-01"), to: d("2026-07-31") });
    expect(plannedIn("Week 1", year)).toEqual({ from: d("2026-04-01"), to: d("2026-04-07") });
    expect(plannedIn("Week 5 of August", year)).toEqual({ from: d("2026-08-29"), to: d("2026-08-31") });
    expect(plannedIn("Sept week 2", year)).toEqual({ from: d("2026-09-08"), to: d("2026-09-14") });
    expect(plannedIn("15-11-2026", year)).toEqual({ from: null, to: d("2026-11-15") });
    expect(plannedIn("", year)).toBeNull();
    expect(plannedIn("May 2027", year)).toMatch(/is not inside 2026-27/);
    expect(plannedIn("Juny", year)).toMatch(/Write the planned month or week/);
  });

  it("builds one tree per class and subject, explains each row, never adds a second copy, and Undo archives what came in", async () => {
    await run((tx) => tx.syllabusItem.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, classId: s.c6.id, subjectId: s.subjects.SCI, kind: "CHAPTER", title: "Plants", sortOrder: 1 } }));
    const csv = [
      "Class,Subject,Unit,Lesson,Topic,Sl No,Month",
      "Class 5,Maths,Numbers,Fractions,,2,July",
      "Class 5,Maths,Numbers,Fractions,Adding fractions,,Week 2 of July",
      "Class 5,Maths,Numbers,Large numbers,,1,June 2026",
      "5,MAT,,Geometry,,,Week 20",
      "Class 5,Maths,Numbers,Fractions,,,",
      "Class 7,Maths,,Algebra,,,",
      "Class 5,Hindi,,Varnamala,,,",
      "Class 5,Science,,Plants,,,Juny",
      "Class 6,English,,Poems,,,May 2027",
      "Class 6,English,,Prose,,abc,",
      "Class 6,Science,,plants,,,",
    ].join("\n");
    const [id] = await upload(csv, "syllabus.csv", "academic-syllabus");
    const w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ class: [0], subject: [1], unit: [2], chapter: [3], topic: [4], order: [5], planned: [6] });
    const checked = w.checked!;
    expect(checked.ready.map((r) => r.line)).toEqual([2, 3, 4, 5]);
    const problem = (line: number) => problemOf(checked, line)?.problems.join(" ") ?? "";
    expect(problem(6)).toMatch(/Fractions is twice in the file for Class 5, Mathematics/);
    expect(problem(7)).toMatch(/Class 7 is not set up this year/);
    expect(problem(8)).toMatch(/Subject "Hindi" is not in Subjects/);
    expect(problem(9)).toMatch(/Write the planned month or week/);
    expect(problem(10)).toMatch(/is not inside 2026-27/);
    expect(problem(11)).toMatch(/Order must be a whole number/);
    expect(problem(12)).toMatch(/plants is already in the syllabus of Class 6, Science/);

    const batchId = await bringIn(id);
    expect(await run((tx) => tx.importBatch.findUniqueOrThrow({ where: { id: batchId } }))).toMatchObject({ added: 4, updated: 0 });
    const items = await run((tx) => tx.syllabusItem.findMany({ where: { classId: s.c5.id, subjectId: s.subjects.MAT, archivedAt: null } }));
    const by = (title: string) => items.find((i) => i.title === title)!;
    expect(items).toHaveLength(5);
    expect(by("Numbers")).toMatchObject({ kind: "UNIT", parentId: null });
    expect(by("Fractions")).toMatchObject({ kind: "CHAPTER", parentId: by("Numbers").id, sortOrder: 2, plannedFrom: d("2026-07-01"), plannedTo: d("2026-07-31") });
    expect(by("Adding fractions")).toMatchObject({ kind: "TOPIC", parentId: by("Fractions").id, plannedFrom: d("2026-07-08"), plannedTo: d("2026-07-14") });
    expect(by("Large numbers")).toMatchObject({ parentId: by("Numbers").id, sortOrder: 1, plannedTo: d("2026-06-30") });
    expect(by("Geometry")).toMatchObject({ kind: "CHAPTER", parentId: null, plannedFrom: d("2026-08-12"), plannedTo: d("2026-08-18") });
    expect(await run((tx) => tx.auditLogEntry.count({ where: { recordType: "Syllabus Item", action: "created", recordId: { in: items.map((i) => i.id) } } }))).toBe(5);

    expect(await run((tx) => undoImport(tx, c, batchId))).toMatchObject({ archived: 4 });
    expect(await run((tx) => tx.syllabusItem.count({ where: { classId: s.c5.id, subjectId: s.subjects.MAT, archivedAt: null } }))).toBe(0);
    // What was there before stays.
    expect(await run((tx) => tx.syllabusItem.count({ where: { classId: s.c6.id, subjectId: s.subjects.SCI, archivedAt: null } }))).toBe(1);
  });
});
