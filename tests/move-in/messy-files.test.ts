// Moving in with real school files (workflow 15, gap list G12, G13, G15, G17):
// father and mother on one mobile, roll numbers used twice, the Principal on
// the old staff list, a row that cannot be saved, Undo then the same file
// again, the Accountant bringing in old dues from Fee Management, and rows
// that may already be on record waiting for a person's choice.
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { autoMatch, importKind, previewImport, RowProblem, runImport, undoImport, type Decisions, type ImportKind } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import { findLogin } from "@/lib/auth/sign-in";
import { addUpload, canBring, chooseRow, importFile, mayImport, moveInKinds, phonesOfDifferentFamilies, settleImports, workOn } from "@/lib/move-in/service";
import { studentImport, STUDENT_IMPORT } from "@/lib/students/import";
import { saveStudentSettings } from "@/lib/students/settings";
import { moduleImportRefusal, runModuleFile, checkModuleFile, undoModuleImport, uploadModuleFile } from "@/lib/imports/module-import";
import { templateWorkbook } from "@/lib/move-in/template";
import ExcelJS from "exceljs";
import "@/lib/fees/import";
import "@/lib/import-registry";
import { addStudent, studentSchool } from "../students/fixtures";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";
import { makeSchool, makeUser } from "../helpers";

let s: Awaited<ReturnType<typeof studentSchool>>;
let ctx: SchoolContext;

const HEAD = ["Full name", "Class", "Section", "Date of birth", "Gender", "Father's or guardian's name", "Parent's phone", "Mother's name", "Mother's phone", "Admission number", "Roll number", "Address"];
type Row = [name: string, cls: string, sec: string, dob: string, gender: string, father: string, phone: string, mother: string, motherPhone: string, adm: string, roll: string, address: string];
const kind = () => studentImport(STUDENT_IMPORT, { sectionId: null, applyFeePlan: false });
const match = () => autoMatch(kind().columns, HEAD);
const check = (rows: Row[], decisions: Decisions = {}, c: SchoolContext = ctx) => withSchool(c, (tx) => previewImport(tx, c, kind(), rows, match(), decisions));
async function bring(rows: Row[], decisions: Decisions = {}, c: SchoolContext = ctx) {
  return withSchool(c, async (tx) => {
    const k = kind();
    const p = await previewImport(tx, c, k, rows, match(), decisions);
    return { p, batch: await runImport(tx, c, k, "old-software.csv", p) };
  }, { timeout: 120_000 });
}
const undo = (batchId: string, c: SchoolContext = ctx) => withSchool(c, (tx) => undoImport(tx, c, batchId), { timeout: 120_000 });
const run = <T,>(fn: (tx: Tx) => Promise<T>, c: SchoolContext = ctx) => withSchool(c, fn);
let n = 0;
/** A fresh mobile number for each family in these tests. */
const phone = () => `97${String(10000000 + (n++) * 7907 + Math.floor(Math.random() * 1000)).slice(0, 8)}`;
const adm = (p: string) => `${p}-${randomUUID().slice(0, 5)}`;

beforeAll(async () => {
  s = await studentSchool();
  ctx = s.ctx;
}, 120_000);

describe("one bad row never sinks the whole file (G12)", () => {
  it("father and mother on one mobile: both parents are linked once, and a brother shares them", async () => {
    const p = phone();
    const { p: preview, batch } = await bring([
      ["Asha Reddy", "5", "A", "10-01-2016", "F", "Venkat Reddy", p, "Padma Reddy", p, adm("SH"), "", ""],
      ["Kiran Reddy", "6", "A", "12-02-2014", "M", "Venkat Reddy", p, "Padma Reddy", "", adm("SH"), "", ""],
    ]);
    expect(preview.bad).toEqual([]);
    expect(batch).toMatchObject({ added: 2, skipped: 0 });
    const parents = await run((tx) => tx.guardian.findMany({ where: { phone: p }, include: { students: { include: { student: { select: { fullName: true } } } } } }));
    expect(parents.map((g) => g.name).sort()).toEqual(["Padma Reddy", "Venkat Reddy"]);
    for (const g of parents) expect(g.students.map((l) => l.student.fullName).sort()).toEqual(["Asha Reddy", "Kiran Reddy"]);
  });

  it("a roll number already used in the section, or twice in the file, is shown in the preview", async () => {
    await addStudent(ctx, s.s5b, { rollNo: 7 });
    const preview = await check([
      ["Roll Clash", "5", "B", "01-01-2016", "M", "Some Father", phone(), "", "", "", "7", ""],
      ["Roll Once", "5", "B", "02-01-2016", "M", "Other Father", phone(), "", "", "", "9", ""],
      ["Roll Twice", "5", "B", "03-01-2016", "F", "Third Father", phone(), "", "", "", "9", ""],
    ]);
    expect(preview.good.map((g) => g.line)).toEqual([3]);
    expect(preview.bad.find((b) => b.line === 2)!.problems.join(" ")).toMatch(/Roll number 7 is already used in Class 5 B\. The next free number is \d+/);
    expect(preview.bad.find((b) => b.line === 4)!.problems.join(" ")).toMatch(/Roll number 9 is on another row of this file/);
  });

  it("fields this school makes required (Student Settings) are checked in the preview", async () => {
    await run((tx) => saveStudentSettings(tx, ctx, { requiredFields: ["address"] }, "Form"));
    try {
      const preview = await check([["No Address", "5", "A", "04-01-2016", "M", "A Father", phone(), "", "", "", "", ""]]);
      expect(preview.bad[0].problems).toContain("Address is required in this school (Student Settings).");
    } finally {
      await run((tx) => saveStudentSettings(tx, ctx, { requiredFields: [] }, "Form"));
    }
  });

  it("a row that cannot be saved is listed with a plain reason and everything it wrote is taken back; the other rows go in", async () => {
    const stub: ImportKind<{ n: number }> = {
      key: "stub-rows", label: "Stub", columns: [{ key: "n", label: "N" }],
      check: async (_tx, _ctx, row) => ({ ok: true, value: { n: Number(row.n) } }),
      save: async (tx, c, v) => {
        const d = await tx.department.create({ data: { schoolId: c.schoolId, name: `Stub dept ${v.n}-${randomUUID().slice(0, 4)}` } });
        if (v.n === 2) throw new RowProblem("Row two cannot be saved.");
        if (v.n === 3) {
          const key = `stub-${randomUUID()}`;
          await tx.numberSequence.create({ data: { schoolId: c.schoolId, key, nextValue: 1 } });
          await tx.numberSequence.create({ data: { schoolId: c.schoolId, key, nextValue: 1 } }); // the same key twice: the database refuses it
        }
        return { id: d.id, created: true };
      },
      undo: async () => {},
    };
    const batch = await run(async (tx) => {
      const p = await previewImport(tx, ctx, stub, [["1"], ["2"], ["3"], ["4"]], { n: 0 });
      return runImport(tx, ctx, stub, "stub.csv", p);
    });
    expect(batch).toMatchObject({ added: 2, skipped: 2 });
    const report = batch.errorReport as { line: number; problems: string[] }[];
    expect(report.map((r) => r.line)).toEqual([3, 4]);
    expect(report[0].problems).toEqual(["Row two cannot be saved."]);
    expect(report[1].problems[0]).toMatch(/^Another record already has the same number or name/);
    expect(await run((tx) => tx.department.count({ where: { name: { startsWith: "Stub dept 2-" } } }))).toBe(0);
    expect(await run((tx) => tx.department.count({ where: { name: { startsWith: "Stub dept 3-" } } }))).toBe(0);
    // Any other error is a real fault: nothing is saved.
    const broken = { ...stub, save: async () => { throw new Error("The database is down"); } };
    await expect(run(async (tx) => runImport(tx, ctx, broken, "x.csv", await previewImport(tx, ctx, broken, [["1"]], { n: 0 })))).rejects.toThrow("The database is down");
  });

  it("the Principal on the old staff list becomes a staff record on their own login; a duplicate email is shown", async () => {
    const principalPhone = phone();
    await prisma.userLogin.update({ where: { id: s.principal.id }, data: { phone: principalPhone, displayName: "Lata Menon" } });
    const staff = importKind("staff")!;
    const headers = ["Full name", "Phone", "Designation", "Joining date", "Email", "Create login"];
    const sm = autoMatch(staff.columns, headers);
    const rows = [
      ["Lata Menon", principalPhone, "Teacher", "01-06-2019", "", "Yes"],
      ["Gita One", phone(), "Teacher", "01-06-2020", "same@school.in", ""],
      ["Gita Two", phone(), "Teacher", "01-06-2021", "SAME@school.in", ""],
    ];
    const { p, batch } = await run(async (tx) => {
      const p = await previewImport(tx, ctx, staff, rows, sm);
      return { p, batch: await runImport(tx, ctx, staff, "staff.csv", p) };
    });
    expect(p.bad.map((b) => [b.line, b.problems.join(" ")])).toEqual([[4, "This email is on another row of the file."]]);
    expect(batch).toMatchObject({ added: 2, skipped: 1 });
    const lata = await run((tx) => tx.staff.findFirstOrThrow({ where: { fullName: "Lata Menon" } }));
    expect(lata.userLoginId).toBe(s.principal.id);
    expect(await prisma.userLogin.count({ where: { phone: principalPhone } })).toBe(1);

    // The same phone under another person's name is not joined on a guess.
    const other = await run((tx) => previewImport(tx, ctx, staff, [["Gopal Varma", principalPhone, "Teacher", "01-06-2019", "", ""]], sm));
    expect(other.bad[0].problems.join(" ")).toMatch(/This phone belongs to (Lata Menon|the login of Lata Menon)/);

    // Undo keeps the Principal's own login signing in.
    await undo(batch.id);
    const access = await run((tx) => tx.schoolAccess.findFirst({ where: { userLoginId: s.principal.id, archivedAt: null } }));
    expect(access).not.toBeNull();
    expect((await run((tx) => tx.staff.findUniqueOrThrow({ where: { id: lata.id } }))).userLoginId).toBeNull();
  });
});

describe("Undo, fix the file and import it again (G13)", () => {
  it("frees the typed admission numbers of an undone import, so the same file comes in again", async () => {
    const a1 = adm("RE");
    const a2 = adm("RE");
    const rows: Row[] = [
      ["Undo One", "5", "A", "05-05-2016", "M", "Undo Father", phone(), "", "", a1, "", ""],
      ["Undo Two", "5", "A", "06-05-2016", "F", "Undo Mother", phone(), "", "", a2, "", ""],
    ];
    const first = await bring(rows);
    expect(first.batch.added).toBe(2);
    await undo(first.batch.id);
    const again = await check(rows);
    expect(again.bad).toEqual([]);
    const second = await bring(rows);
    expect(second.batch).toMatchObject({ added: 2, skipped: 0 });
    const all = await run((tx) => tx.student.findMany({ where: { admissionNo: a1 }, orderBy: { createdAt: "asc" } }));
    expect(all).toHaveLength(2);
    expect(all[0].archivedAt).not.toBeNull();
    expect(all[0].releasedAt).not.toBeNull();
    expect(all[1].archivedAt).toBeNull();
    // The database itself still keeps one live student per number.
    await expect(run((tx) => tx.student.update({ where: { id: all[0].id }, data: { releasedAt: null } }))).rejects.toThrow();
  });

  it("a number held by a student archived any other way stays taken", async () => {
    const a = adm("KEEP");
    const kept = await addStudent(ctx, s.s5a, { admissionNo: a });
    await run((tx) => tx.student.update({ where: { id: kept.student.id }, data: { archivedAt: new Date() } }));
    const preview = await check([["Someone New", "5", "A", "07-05-2016", "M", "New Father", phone(), "", "", a, "", ""]]);
    expect(preview.bad[0].problems.join(" ")).toMatch(new RegExp(`Admission number ${a} already belongs to .* \\(archived\\)\\.`));
    expect(preview.bad[0].choices ?? []).toEqual([]);
  });

  it("the staff import comes in again after Undo, and the phone signs in to one login", async () => {
    const staff = importKind("staff")!;
    const headers = ["Full name", "Phone", "Designation", "Joining date", "Create login"];
    const p = phone();
    const rows = [["Ramu Login", p, "Teacher", "01-06-2020", "Yes"]];
    const once = await run(async (tx) => runImport(tx, ctx, staff, "staff.csv", await previewImport(tx, ctx, staff, rows, autoMatch(staff.columns, headers))));
    expect(once.added).toBe(1);
    await undo(once.id);
    const twice = await run(async (tx) => runImport(tx, ctx, staff, "staff.csv", await previewImport(tx, ctx, staff, rows, autoMatch(staff.columns, headers))));
    expect(twice).toMatchObject({ added: 1, skipped: 0 });
    const login = await findLogin(p);
    expect(login).not.toBeNull();
  });
});

describe("rows that may already be on record wait for a person's choice (G17)", () => {
  it("a phone on record under another name is never linked on a guess; 'a different family' makes a new parent", async () => {
    const p = phone();
    const ravi = await addStudent(ctx, s.s5a, { fullName: "Ravi Rao Junior", guardianName: "Ravi Rao", guardianPhone: p });
    const raviParent = (await run((tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: ravi.student.id } }))).guardianId;
    const rows: Row[] = [["Mohan Child", "5", "A", "08-05-2016", "M", "Mohan Das", p, "", "", "", "", ""]];
    const first = await check(rows);
    expect(first.bad[0].problems.join(" ")).toMatch(new RegExp(`Parent's phone ${p} is already on record for Ravi Rao, not Mohan Das`));
    expect(first.bad[0].choices!.map((c) => c.value)).toEqual([`family:${raviParent}`, "new"]);
    const { batch } = await bring(rows, { 2: "new" });
    expect(batch.added).toBe(1);
    const parents = await run((tx) => tx.guardian.findMany({ where: { phone: p }, orderBy: { createdAt: "asc" } }));
    expect(parents.map((g) => g.name)).toEqual(["Ravi Rao", "Mohan Das"]);
  });

  it("'same family' links the parent on record; the same name in another spelling links without asking", async () => {
    const p = phone();
    await addStudent(ctx, s.s5a, { fullName: "Older Sister Rao", guardianName: "Srinivas Rao", guardianPhone: p });
    const parent = await run((tx) => tx.guardian.findFirstOrThrow({ where: { phone: p } }));
    const close = await check([["Younger Rao", "5", "A", "09-05-2017", "M", "Shrinivas Rao", p, "", "", "", "", ""]]);
    expect(close.bad).toEqual([]);
    const { batch } = await bring([
      ["Younger Rao", "5", "A", "09-05-2017", "M", "Shrinivas Rao", p, "", "", "", "", ""],
      ["Cousin Rao", "6", "A", "10-05-2014", "F", "Uncle Venu", p, "", "", "", "", ""],
    ], { 3: `family:${parent.id}` });
    expect(batch).toMatchObject({ added: 2, skipped: 0 });
    expect(await run((tx) => tx.guardian.count({ where: { phone: p } }))).toBe(1);
    expect(await run((tx) => tx.studentGuardian.count({ where: { guardianId: parent.id } }))).toBe(3);
  });

  it("a child written another way with the same date of birth is flagged; 'same student: update' changes the record and Undo puts it back", async () => {
    const p = phone();
    const dob = new Date("2015-05-05T00:00:00Z");
    const irfan = await addStudent(ctx, s.s5a, { fullName: "Mohammed Irfan", dateOfBirth: dob, guardianName: "Abdul Irfan", guardianPhone: p });
    const rows: Row[] = [["MOHD IRFAN", "5", "A", "05-05-2015", "M", "Abdul Irfan", p, "", "", "", "", "12-4 Old City, Hyderabad"]];
    const flagged = await check(rows);
    expect(flagged.bad[0].problems.join(" ")).toMatch(/May already be on record: Mohammed Irfan, .*5 A \(similar name and same date of birth\)/);
    expect(flagged.bad[0].choices!.map((c) => c.value)).toEqual(expect.arrayContaining([`update:${irfan.student.id}`, "new"]));
    const { batch } = await bring(rows, { 2: `update:${irfan.student.id}` });
    expect(batch).toMatchObject({ added: 0, updated: 1, skipped: 0 });
    expect((await run((tx) => tx.student.findUniqueOrThrow({ where: { id: irfan.student.id } }))).address).toBe("12-4 Old City, Hyderabad");
    await undo(batch.id);
    expect((await run((tx) => tx.student.findUniqueOrThrow({ where: { id: irfan.student.id } }))).address).toBeNull();
  });

  it("twins with one father and one birthday are two children", async () => {
    const p = phone();
    const { p: preview, batch } = await bring([
      ["Lava Kumar", "5", "A", "11-05-2016", "M", "Rama Kumar", p, "", "", "", "", ""],
      ["Kusha Kumar", "5", "A", "11-05-2016", "M", "Rama Kumar", p, "", "", "", "", ""],
    ]);
    expect(preview.bad).toEqual([]);
    expect(batch.added).toBe(2);
    expect(await run((tx) => tx.guardian.count({ where: { phone: p } }))).toBe(1);
  });

  it("two families on one new phone in the same file are kept apart unless the person says they are one family", async () => {
    const p = phone();
    const rows: Row[] = [
      ["Gupta Child", "6", "A", "12-05-2014", "F", "Ramesh Gupta", p, "", "", "", "", ""],
      ["Nair Child", "6", "A", "13-05-2014", "M", "Suresh Nair", p, "", "", "", "", ""],
    ];
    const flagged = await check(rows);
    expect(flagged.bad.map((b) => b.line)).toEqual([3]);
    expect(flagged.bad[0].problems.join(" ")).toMatch(/Row 2 has this phone with another parent's name \(Ramesh Gupta\)/);
    expect(flagged.bad[0].choices!.map((c) => c.value)).toEqual(["family-row:2", "new"]);
    const { batch } = await bring(rows, { 3: "new" });
    expect(batch.added).toBe(2);
    expect(await run((tx) => tx.guardian.count({ where: { phone: p } }))).toBe(2);
  });

  it("another school's parent with the same phone is never seen", async () => {
    const other = await makeSchool("Other Phone School");
    const p = phone();
    await withSchool({ schoolId: other.id, userId: null }, (tx) => tx.guardian.create({ data: { schoolId: other.id, name: "Other School Parent", relationship: "Father", phone: p } }));
    const preview = await check([["Walled Child", "5", "A", "14-05-2016", "M", "Our Parent", p, "", "", "", "", ""]]);
    expect(preview.bad).toEqual([]);
  });

  it("works through Switching to School OS: the choice is kept with the file and used by the import job", async () => {
    const p = phone();
    await addStudent(ctx, s.s5a, { fullName: "Switch Older", guardianName: "Prakash Jain", guardianPhone: p });
    const perms = (await accessIn(s.admin.id, s.school.id))!.permissions;
    const csv = `Title row\nName,DOB,Gender,Father name,Mobile,Class\nSwitch Younger,1/1/2016,M,Anil Shah,${p},5 A\nSwitch Other,2/1/2016,F,Kavita Iyer,${phone()},5 A\n`;
    const [id] = await run(async (tx) => {
      const saved = await saveFile(tx, ctx, { file: new File([csv], "switch.csv"), purpose: "move-in", allowed: SHEET_TYPES });
      return addUpload(tx, ctx, perms, { fileId: saved.id, fileName: "switch.csv", kind: "students" });
    });
    const before = await run((tx) => workOn(tx, ctx, id, { check: true }));
    expect(before.checked!.problems.map((x) => x.line)).toEqual([3]);
    expect(before.checked!.problems[0].choices.map((c) => c.value)).toContain("new");
    await run((tx) => chooseRow(tx, ctx, id, 3, "new"));
    const after = await run((tx) => workOn(tx, ctx, id, { check: true }));
    expect(after.checked!.problems).toEqual([]);
    expect(after.checked!.decided.map((d) => d.line)).toEqual([3]);
    await run((tx) => importFile(tx, ctx, id));
    for (let i = 0; i < 10; i++) if ((await runDueJobs(50)) === 0) break;
    await run((tx) => settleImports(tx));
    const f = await run((tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }));
    expect(f.status).toBe("imported");
    expect(await run((tx) => tx.importBatch.findUniqueOrThrow({ where: { id: f.batchId! } }))).toMatchObject({ added: 2, skipped: 0 });
    expect(await run((tx) => tx.guardian.count({ where: { phone: p } }))).toBe(2);
    await expect(run((tx) => chooseRow(tx, ctx, id, 3, "merge-everything"))).rejects.toThrow();
  });

  it("the go-live check counts phones shared by different families, not by a father and mother", () => {
    const kids = (...ids: string[]) => ids.map((studentId) => ({ studentId }));
    expect(phonesOfDifferentFamilies([
      { name: "Venkat Reddy", phone: "9000000001", students: kids("a", "b") },
      { name: "Padma Reddy", phone: "9000000001", students: kids("a", "b") },
    ])).toBe(0);
    expect(phonesOfDifferentFamilies([
      { name: "Ravi Rao", phone: "9000000002", students: kids("c") },
      { name: "Mohan Das", phone: "9000000002", students: kids("d") },
      { name: "Lone Parent", phone: "9000000003", students: kids("e") },
    ])).toBe(1);
  });
});

describe("the Accountant brings in old dues, receipts and expenses from their own module (G15)", () => {
  let f: FeeSchool;
  beforeAll(async () => {
    f = await makeFeeSchool();
  }, 120_000);
  const who = async (userId: string) => {
    const a = (await accessIn(userId, f.school.id))!;
    return { permissions: a.permissions, roles: a.roles, modulesOn: a.modulesOn, user: { id: userId } };
  };

  it("may bring in the money records in Fee and Finance Management, and nothing else", async () => {
    const acc = await who(f.accountant.id);
    expect(canBring(acc.permissions, "fee-old-dues", acc.modulesOn)).toBe(true);
    expect(canBring(acc.permissions, "fee-past-receipts", acc.modulesOn)).toBe(true);
    expect(canBring(acc.permissions, "finance-past-expenses", acc.modulesOn)).toBe(true);
    expect(canBring(acc.permissions, "students", acc.modulesOn)).toBe(false);
    expect(canBring(acc.permissions, "departments", acc.modulesOn)).toBe(false);
    expect(mayImport(acc.permissions, "fee-old-dues", "archive", acc.modulesOn)).toBe(true);
    expect(moduleImportRefusal(acc, "fee-old-dues", "create")).toBeNull();
    expect(moduleImportRefusal(acc, "finance-past-expenses", "create")).toBeNull();
    // The School Calendar is View for the Accountant (05-roles.md).
    expect(moduleImportRefusal(acc, "calendar-holidays", "create")).not.toBeNull();
    const principal = await who(f.principal.id);
    expect(moduleImportRefusal(principal, "calendar-holidays", "create")).toBeNull();
    const teacher = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }] });
    expect(moduleImportRefusal(await who(teacher.id), "fee-old-dues", "create")).not.toBeNull();
  });

  it("lists the steps in workflow 15 order, and only for modules the school has on", async () => {
    const keys = moveInKinds(new Set()).map((k) => k.key);
    expect(keys.indexOf("students")).toBeLessThan(keys.indexOf("fee-old-dues"));
    expect(keys.indexOf("fee-old-dues")).toBeLessThan(keys.indexOf("fee-past-receipts"));
    expect(keys.indexOf("fee-past-receipts")).toBeLessThan(keys.indexOf("finance-past-expenses"));
    expect(keys).not.toContain("library-catalogue");
    expect(keys).not.toContain("students-udise");
    expect(moveInKinds(new Set(["library-management"])).map((k) => k.key)).toContain("library-catalogue");
  });

  it("uploads, checks, imports and undoes old dues as the Accountant, without Settings", async () => {
    const actx = f.ctx; // the Accountant
    const csv = `Adm No,Fee Head,Balance,Due Date,Remarks\n${f.ravi.admissionNo},,"Rs. 3,500/-",31-03-2026,From 2025-26\nNOPE-1,,100,31-03-2026,\n`;
    const up = await run((tx) => uploadModuleFile(tx, actx, "fee-old-dues", new File([csv], "old-dues.csv")), actx);
    expect(up.match).toMatchObject({ admissionNo: 0, amount: 2, dueDate: 3 });
    const fd = new FormData();
    for (const [k, v] of Object.entries(up.match)) fd.set(`col:${k}`, String(v));
    const seen = await run((tx) => checkModuleFile(tx, actx, "fee-old-dues", up.fileId, fd), actx);
    expect(seen.good).toBe(1);
    expect(seen.bad[0].problems.join(" ")).toMatch(/No student with admission number "NOPE-1"/);
    const batch = await run((tx) => runModuleFile(tx, actx, "fee-old-dues", up.fileId, fd), actx);
    expect(batch).toMatchObject({ added: 1, skipped: 1, kind: "fee-old-dues", importedById: f.accountant.id });
    await run((tx) => undoModuleImport(tx, actx, "fee-old-dues", batch.id), actx);
    expect(await run((tx) => tx.studentFeeDue.count({ where: { studentId: f.ravi.id, kind: "OLD_DUES", state: "OPEN" } }), actx)).toBe(0);
  });

  it("a students import with old dues brought in is undone only after the old dues import", async () => {
    const a = adm("OD");
    const k = studentImport(STUDENT_IMPORT, { sectionId: null, applyFeePlan: true });
    const students = await run(async (tx) => runImport(tx, f.pctx, k, "students.csv", await previewImport(tx, f.pctx, k, [["Dues Child", "5", "A", "01-02-2016", "F", "Dues Father", phone(), "", "", a, "", ""]], autoMatch(k.columns, HEAD))), f.pctx);
    expect(students.added).toBe(1);
    const od = importKind("fee-old-dues")!;
    const dues = await run(async (tx) => runImport(tx, f.ctx, od, "dues.csv", await previewImport(tx, f.ctx, od, [[a, "", "2500", "31-03-2026", ""]], { admissionNo: 0, feeHead: 1, amount: 2, dueDate: 3, note: 4 })), f.ctx);
    expect(dues.added).toBe(1);
    await expect(undo(students.id, f.pctx)).rejects.toThrow(/Undo the old dues import first/);
    await undo(dues.id, f.ctx);
    await undo(students.id, f.pctx);
    const childId = (students.createdIds as string[])[0];
    const ob = await run((tx) => tx.openingBalance.findMany({ where: { studentId: childId } }), f.ctx);
    expect(ob).toHaveLength(1);
    expect(ob[0].archivedAt).not.toBeNull();
    expect((await run((tx) => tx.student.findUniqueOrThrow({ where: { id: childId } }), f.ctx)).releasedAt).not.toBeNull();
  });

  it("the ready sheet for past receipts has the school's fee heads and the payment modes in drop-downs", async () => {
    const buf = await templateWorkbook(importKind("fee-past-receipts")!, { sections: [], designations: [], departments: [], feeHeads: ["Old dues", "Tuition fee"] }, "Fee School");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const lists = wb.getWorksheet("Lists")!;
    const values = new Set<string>();
    lists.eachRow((row) => row.eachCell((c) => values.add(String(c.value))));
    expect([...values]).toEqual(expect.arrayContaining(["Cash", "UPI", "Tuition fee"]));
    const help = wb.getWorksheet("How to fill")!;
    const text: string[] = [];
    help.eachRow((r) => r.eachCell((c) => text.push(String(c.value))));
    expect(text.join(" ")).toMatch(/Fee Management, Student Fee Ledger, Import/);
  });
});
