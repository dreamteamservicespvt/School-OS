// Switching to School OS against the real database: a messy workbook from old
// software goes in, is matched, fixed and imported through the shared
// importer, can be undone, and never shows to another school.
import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { prisma, withSchool, type SchoolContext } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { undoImport } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import {
  addMissingClasses, addMissingOptions, addUpload, canBring, chooseSheet, fixRow, goLive, goLiveSummary, blockers, importFile, leaveOut,
  moveInKinds, saveExpected, setColumns, setValues, settleImports, warnings, workOn, MoveInProblem,
} from "@/lib/move-in/service";
import { templateWorkbook } from "@/lib/move-in/template";
import { importKind } from "@/lib/importer";
import { readWorkbook } from "@/lib/move-in/read";
import { studentSchool } from "../students/fixtures";
import { makeSchool, makeUser } from "../helpers";

let s: Awaited<ReturnType<typeof studentSchool>>;
let ctx: SchoolContext;
let perms: import("@/lib/permissions").PermissionMap;

async function workbook(sheets: Record<string, (string | number | Date)[][]>) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) { const ws = wb.addWorksheet(name); for (const r of rows) ws.addRow(r); }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(buf: Buffer, name: string, kind?: string) {
  return withSchool(ctx, async (tx) => {
    const saved = await saveFile(tx, ctx, { file: new File([new Uint8Array(buf)], name), purpose: "move-in", allowed: SHEET_TYPES });
    return addUpload(tx, ctx, perms, { fileId: saved.id, fileName: name, kind });
  });
}

async function drainJobs() {
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50)) === 0) break;
  await withSchool(ctx, (tx) => settleImports(tx));
}

beforeAll(async () => {
  s = await studentSchool();
  ctx = s.ctx;
  perms = (await accessIn(s.admin.id, s.school.id))!.permissions;
});

describe("bringing in an old software's workbook", () => {
  let studentsFile = "";
  let staffFile = "";

  it("makes one file per sheet that holds records, and works out what each holds", async () => {
    const buf = await workbook({
      "Student List": [
        ["SUNRISE PUBLIC SCHOOL"], ["Class strength report 2026-27"],
        ["S.No", "Adm No", "First Name", "Last Name", "Class & Sec", "D.O.B", "Sex", "Father Name", "Father Mob"],
        [1, "OLD-101", "ARJUN", "RAO", "5th A", new Date(Date.UTC(2016, 2, 14)), "M", "SRINIVAS RAO", "+91 98765 11111"],
        [2, "OLD-102", "priya", "sharma", "V-B", "02/11/2015", "F", "ramesh sharma", "098765 22222"],
        [3, "OLD-103", "Kiran", "Das", "7 A", "30/02/2015", "M", "Mohan Das", "9876533333"],
        [4, "OLD-104", "Meera", "Iyer", "VI A", "12-06-2015", "girl", "Ravi Iyer", "12345"],
        ["", "", "", "", "", "", "", "", ""],
        ["Total", 4],
      ],
      Staff: [["Employee Name", "Mobile No", "Designation", "DOJ"], ["Anita Rao", "9876544444", "PGT", "01-06-2019"], ["Ramu", "9876555555", "Peon", "01/07/2020"], ["Sita Devi", "9876566666", "Librarian", "1 Aug 2021"]],
      Notes: [["just a note"]],
    });
    const ids = await upload(buf, "old-software-export.xlsx");
    expect(ids).toHaveLength(2);
    const files = await withSchool(ctx, (tx) => tx.moveInFile.findMany({ where: { id: { in: ids } } }));
    studentsFile = files.find((f) => f.kind === "students")!.id;
    staffFile = files.find((f) => f.kind === "staff")!.id;
    expect(files.find((f) => f.kind === "students")!.headerRow).toBe(3);
  });

  it("matches the columns and tidies every row, listing what it could not place", async () => {
    const w = await withSchool(ctx, (tx) => workOn(tx, ctx, studentsFile, { check: true }));
    expect(w.prepared.passed).toMatchObject({ empty: 1, totals: 1 });
    expect(w.prepared.rows).toHaveLength(4);
    expect(w.prepared.rows[0].values).toMatchObject({ fullName: "Arjun Rao", className: "Class 5", sectionName: "A", dateOfBirth: "14-03-2016", gender: "Male", guardianPhone: "9876511111", admissionNo: "OLD-101" });
    expect(w.prepared.unmatched.map((u) => u.label)).toEqual(["7 A"]);
    expect(w.checked!.ready.map((r) => r.line)).toEqual([4, 5]);
    const problems = Object.fromEntries(w.checked!.problems.map((p) => [p.line, p.problems.join(" ")]));
    expect(problems[6]).toMatch(/Date of birth 30\/02\/2015 is not a real date/);
    expect(problems[6]).toMatch(/Class 7 A is not set up/);
    expect(problems[7]).toMatch(/Parent's phone/);
  });

  it("adds a missing class through Academic Management's rules and matches the rows to it", async () => {
    const before = await withSchool(ctx, (tx) => workOn(tx, ctx, studentsFile, { check: false }));
    const words = before.prepared.unmatched.filter((u) => u.column === "class").map((u) => u.value);
    expect(await withSchool(ctx, (tx) => addMissingClasses(tx, ctx, studentsFile, words))).toBe(1);
    const cls = await withSchool(ctx, (tx) => tx.schoolClass.findFirst({ where: { name: "Class 7" } }));
    expect(cls).not.toBeNull();
    const after = await withSchool(ctx, (tx) => workOn(tx, ctx, studentsFile, { check: false }));
    expect(after.prepared.unmatched).toHaveLength(0);
    expect(after.prepared.rows[2].values).toMatchObject({ className: "Class 7", sectionName: "A" });
  });

  it("refuses words that are not classes", async () => {
    await expect(withSchool(ctx, (tx) => addMissingClasses(tx, ctx, studentsFile, ["Rose|A"]))).rejects.toThrow(MoveInProblem);
  });

  it("keeps fixes typed on screen and rows left out", async () => {
    await withSchool(ctx, (tx) => fixRow(tx, studentsFile, 6, { dateOfBirth: "28/02/2015" }));
    await withSchool(ctx, (tx) => leaveOut(tx, studentsFile, [7], true));
    const w = await withSchool(ctx, (tx) => workOn(tx, ctx, studentsFile, { check: true }));
    expect(w.checked!.ready.map((r) => r.line)).toEqual([4, 5, 6]);
    expect(w.checked!.problems).toHaveLength(0);
    expect(w.prepared.passed.leftOut).toBe(1);
  });

  it("imports the ready rows through the shared importer, as a background job", async () => {
    const r = await withSchool(ctx, (tx) => importFile(tx, ctx, studentsFile));
    expect(r).toEqual({ rows: 3, problems: 0 });
    await expect(withSchool(ctx, (tx) => fixRow(tx, studentsFile, 6, {}))).rejects.toThrow(/being imported/);
    await drainJobs();
    const f = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: studentsFile } }));
    expect(f.status).toBe("imported");
    const batch = await withSchool(ctx, (tx) => tx.importBatch.findUniqueOrThrow({ where: { id: f.batchId! } }));
    expect(batch).toMatchObject({ kind: "students", added: 3, skipped: 0 });
    const arjun = await withSchool(ctx, (tx) => tx.student.findFirst({ where: { admissionNo: "OLD-101" }, include: { enrolments: true, guardians: { include: { guardian: true } } } }));
    expect(arjun?.fullName).toBe("Arjun Rao");
    expect(arjun?.enrolments[0].sectionId).toBe(s.s5a);
    expect(arjun?.guardians[0].guardian).toMatchObject({ name: "Srinivas Rao", phone: "9876511111" });
  });

  it("the go-live check counts what came in and compares with the old software", async () => {
    await withSchool(ctx, (tx) => saveExpected(tx, ctx, { oldSoftware: "Old ERP", expected: { students: 4, staff: null, guardians: null }, goLiveDate: null }));
    const sum = await withSchool(ctx, (tx) => goLiveSummary(tx, ctx));
    expect(sum.students).toBe(3);
    expect(blockers(sum).join(" ")).toMatch(/1 file is not imported/);
    expect(warnings(sum).join(" ")).toMatch(/old software says 4 students; School OS has 3 \(-1\)/);
  });

  it("matches staff designations by the words schools use, and adds new ones to HR Settings", async () => {
    const w = await withSchool(ctx, (tx) => workOn(tx, ctx, staffFile, { check: false }));
    expect(w.prepared.rows.map((r) => r.values.designation)).toEqual(["Teacher", "Support Staff", "Librarian"]);
    expect(w.prepared.unmatched.map((u) => u.value)).toEqual(["Librarian"]);
    await withSchool(ctx, (tx) => addMissingOptions(tx, ctx, staffFile, "designation", ["Librarian"]));
    const c = await withSchool(ctx, (tx) => workOn(tx, ctx, staffFile, { check: true }));
    expect(c.prepared.unmatched).toHaveLength(0);
    expect(c.checked!.problems).toEqual([]);
    expect(c.checked!.ready).toHaveLength(3);
    await withSchool(ctx, (tx) => importFile(tx, ctx, staffFile));
    await drainJobs();
    expect(await withSchool(ctx, (tx) => tx.staff.count({ where: { phone: { in: ["9876544444", "9876555555", "9876566666"] } } }))).toBe(3);
  });

  it("goes live once nothing stops it, and keeps the summary", async () => {
    const sum = await withSchool(ctx, (tx) => goLiveSummary(tx, ctx));
    expect(blockers(sum)).toEqual([]);
    await withSchool(ctx, (tx) => goLive(tx, ctx));
    const plan = await withSchool(ctx, (tx) => tx.moveInPlan.findUniqueOrThrow({ where: { schoolId: s.school.id } }));
    expect(plan.wentLiveAt).not.toBeNull();
    expect(plan.liveSummary).toMatchObject({ students: 3 });
    await expect(withSchool(ctx, (tx) => goLive(tx, ctx))).rejects.toThrow(/already live/);
  });

  it("an undone import archives what it added", async () => {
    const f = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: studentsFile } }));
    await withSchool(ctx, (tx) => undoImport(tx, ctx, f.batchId!));
    expect(await withSchool(ctx, (tx) => tx.student.count({ where: { admissionNo: { startsWith: "OLD-" }, archivedAt: null } }))).toBe(0);
  });
});

describe("choices on screen", () => {
  it("a different heading row re-matches the columns and drops old choices", async () => {
    const buf = Buffer.from("Title row\nName,DOB,Gender,Father name,Mobile,Class\nRavi,1/1/2016,M,Rao,9876500001,5 A\n");
    const [id] = await upload(buf, "plain.csv", "students");
    const first = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }));
    expect(first.headerRow).toBe(2);
    await withSchool(ctx, (tx) => setValues(tx, id, "class", { "x|": "" }));
    await withSchool(ctx, (tx) => chooseSheet(tx, ctx, id, { sheetIndex: 0, headerRow: 1, kind: "students" }, perms));
    const f = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }));
    expect(f.valueMatch).toEqual({});
    await withSchool(ctx, (tx) => setColumns(tx, id, { fullName: [0, 99], gender: [-1] }));
    const g = await withSchool(ctx, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }));
    expect(g.columnMatch).toEqual({ fullName: [0] });
  });

  it("sees a section added after the first check", async () => {
    const [id] = await upload(Buffer.from("Name,DOB,Gender,Father name,Mobile,Class,Section\nNew Kid,1/1/2016,M,Rao,9876500091,Class 6,C\n"), "late.csv", "students");
    const first = await withSchool(ctx, (tx) => workOn(tx, ctx, id, { check: true }));
    expect(first.checked!.problems[0].problems.join(" ")).toMatch(/Class 6 C is not set up/);
    await withSchool(ctx, (tx) => tx.section.create({ data: { schoolId: s.school.id, classId: s.c6, academicYearId: s.yearId, name: "C", seats: 40 } }));
    const again = await withSchool(ctx, (tx) => workOn(tx, ctx, id, { check: true }));
    expect(again.checked!.problems).toEqual([]);
  });

  it("explains files it cannot read", async () => {
    await expect(upload(Buffer.from("only one line\n"), "empty.csv")).rejects.toThrow(/no rows to bring in/);
  });
});

describe("roles", () => {
  it("only offers what a role can add", async () => {
    const acc = (await accessIn(s.accountantUser.id, s.school.id))!.permissions;
    expect(canBring(acc, "students")).toBe(false);
    expect(canBring(perms, "students")).toBe(true);
    expect(moveInKinds().map((k) => k.key)).toEqual(expect.arrayContaining(["departments", "staff", "students"]));
    expect(moveInKinds().map((k) => k.key)).not.toContain("students-udise");
  });
  it("refuses an upload when the role can add nothing", async () => {
    const acc = (await accessIn(s.accountantUser.id, s.school.id))!.permissions;
    const accCtx = { schoolId: s.school.id, userId: s.accountantUser.id };
    await expect(withSchool(accCtx, async (tx) => {
      const saved = await saveFile(tx, accCtx, { file: new File(["Name,Phone\nA,9876500001\nB,9876500002\n"], "x.csv"), purpose: "move-in", allowed: SHEET_TYPES });
      return addUpload(tx, accCtx, acc, { fileId: saved.id, fileName: "x.csv", kind: "students" });
    })).rejects.toThrow(/cannot add/);
  });
});

describe("school walls", () => {
  it("one school never sees another school's move-in files or plan", async () => {
    const other = await makeSchool("Other School");
    await makeUser({ schools: [{ id: other.id, roleKeys: ["school-admin"] }] });
    await withSchool({ schoolId: other.id, userId: null }, async (tx) => {
      expect(await tx.moveInFile.count()).toBe(0);
      expect(await tx.moveInPlan.findMany()).toEqual([]);
      await expect(tx.moveInFile.create({ data: { schoolId: s.school.id, fileId: s.school.id, fileName: "x", kind: "students" } })).rejects.toThrow();
    });
    expect(await prisma.moveInFile.count().catch(() => 0)).toBe(0);
  });
});

describe("the ready Excel sheet", () => {
  it("has the school's own classes in a drop-down and reads back cleanly", async () => {
    const lookups = { sections: [{ id: "1", className: "Class 5", sectionName: "A", key: "5" }], designations: ["Teacher"], departments: [] };
    const buf = await templateWorkbook(importKind("students")!, lookups, "Test School");
    const sheets = await readWorkbook(buf, "t.xlsx");
    expect(sheets[0].rows[0][0]).toBe("Full name *");
    expect(sheets.map((x) => x.name)).toContain("How to fill");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.getWorksheet("Lists")?.getCell("A1").value).toBe("Class 5");
  });
});
