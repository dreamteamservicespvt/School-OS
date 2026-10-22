// One import engine everywhere (gap list G16): the Import page of each module
// brings its file in on the Switching to School OS engine, with the same
// heading matching, tidy-ups, row-by-row check, rows left out, background
// import, Undo and Audit Log as Settings, and keeps its own module's rules.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { undoImport } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { addUpload, importFile, leaveOut, settleImports, workOn } from "@/lib/move-in/service";
import { placeRefusal } from "@/lib/imports/place-access";
import { fileHref, PLACES } from "@/lib/imports/places";
import "@/lib/import-registry";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";
import { makeHostelSchool, type HostelFixture } from "../hostel/fixture";
import { studentSchool } from "../students/fixtures";
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

describe("Fee Management, Finance Management and the School Calendar (G15, G16)", () => {
  it("each page keeps its own module's rules", async () => {
    const acc = await who(f.accountant.id);
    expect(await placeRefusal(acc, PLACES.fees, "fee-old-dues", "create")).toBeNull();
    expect(await placeRefusal(acc, PLACES.fees, "fee-past-receipts", "archive")).toBeNull();
    expect(await placeRefusal(acc, PLACES.finance, "finance-past-expenses", "create")).toBeNull();
    // A page brings in only its own kinds.
    expect(await placeRefusal(acc, PLACES.fees, "students", "create")).not.toBeNull();
    // The School Calendar is View for the Accountant (05-roles.md).
    expect(await placeRefusal(acc, PLACES.events, "calendar-holidays", "create")).not.toBeNull();
    expect(await placeRefusal(await who(f.principal.id), PLACES.events, "calendar-holidays", "create")).toBeNull();
    const teacher = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }] });
    expect(await placeRefusal(await who(teacher.id), PLACES.fees, "fee-old-dues", "create")).not.toBeNull();
  });

  it("old dues: headings written another way, amounts tidied, each row's problem shown, left out, imported in the background, undone", async () => {
    const c = f.ctx; // the Accountant, without Settings
    const csv = `Admision No,Fee Head,Balance,Due Date,Remarks\n${f.ravi.admissionNo},,"Rs. 3,500/-",31-03-2026,From 2025-26\nNOPE-1,,100,31-03-2026,\n`;
    const [id] = await upload(c, csv, "old-dues.csv", "fee-old-dues");
    let w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ admissionNo: [0], amount: [2], dueDate: [3] });
    expect(w.checked!.ready).toHaveLength(1);
    expect(w.checked!.problems[0].problems.join(" ")).toMatch(/No student with admission number "NOPE-1"/);
    await run(c, (tx) => leaveOut(tx, id, [3], true));
    w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    expect(w.checked!.problems).toHaveLength(0);
    expect(w.prepared.passed.leftOut).toBe(1);

    await run(c, (tx) => importFile(tx, c, id, { link: fileHref(PLACES.fees, id) }));
    await drain(c);
    const file = await run(c, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }));
    expect(file.status).toBe("imported");
    const batch = await run(c, (tx) => tx.importBatch.findUniqueOrThrow({ where: { id: file.batchId! } }));
    expect(batch).toMatchObject({ kind: "fee-old-dues", added: 1, skipped: 0, importedById: f.accountant.id });
    expect(await run(c, (tx) => tx.studentFeeDue.count({ where: { studentId: f.ravi.id, kind: "OLD_DUES", state: "OPEN", amountPaise: 350000n } }))).toBe(1);
    // The notification brings the Accountant back to Fee Management, not to Settings.
    const note = await run(c, (tx) => tx.notification.findFirst({ where: { userLoginId: f.accountant.id, type: "import" }, orderBy: { createdAt: "desc" } }));
    expect(note?.link).toBe(`/fee-management/ledger/import/review/${id}`);
    expect(await run(c, (tx) => tx.auditLogEntry.count({ where: { action: "imported", recordType: "Import", recordId: batch.id } }))).toBe(1);

    await run(c, (tx) => undoImport(tx, c, batch.id));
    expect(await run(c, (tx) => tx.studentFeeDue.count({ where: { studentId: f.ravi.id, kind: "OLD_DUES", state: "OPEN" } }))).toBe(0);
  });
});

describe("Staff & HR, Admission Management, Library, Inventory and Hostel Import pages (G16)", () => {
  it("each page keeps its own module's rules", async () => {
    const admin = await who(f.principal.id);
    const acc = await who(f.accountant.id);
    // Staff: HR's work (Staff & HR full); the Accountant cannot.
    expect(await placeRefusal(admin, PLACES.staff, "staff", "create")).toBeNull();
    expect(await placeRefusal(acc, PLACES.staff, "staff", "create")).toMatch(/Only HR, the School Admin or the Principal/);
    // Optional modules switched off for this school: their pages say so.
    expect(await placeRefusal(admin, PLACES.library, "library-catalogue", "create")).toMatch(/switched off/);
    expect(await placeRefusal(admin, PLACES["inventory-items"], "inventory-items", "create")).toMatch(/switched off/);
    // A page brings in only its own kinds.
    expect(await placeRefusal(admin, PLACES["inventory-items"], "inventory-assets", "create")).not.toBeNull();
  });
});

describe("a warden brings rooms into their own hostel only, wherever the file comes in", () => {
  let h: HostelFixture;
  beforeAll(async () => {
    h = await makeHostelSchool("One Engine Hostel School");
  }, 120_000);

  it("rows for another hostel show a problem; the rest come in on the engine; another hostel's import is not the warden's to undo", async () => {
    const w: SchoolContext = { schoolId: h.school.id, userId: h.warden.id };
    const csv = "Hostel,Floor,Room no,Beds\nBoys' Hostel,First,B-21,2\nGirls' Hostel,First,G-21,2\n";
    const [id] = await upload(w, csv, "rooms.csv", "hostel-rooms");
    const checked = (await run(w, (tx) => workOn(tx, w, id, { check: true }))).checked!;
    expect(checked.ready.map((r) => r.values.room)).toEqual(["B-21"]);
    expect(checked.problems[0].problems).toContain("You work in your own hostel only, not in Girls' Hostel.");
    await run(w, (tx) => importFile(tx, w, id));
    await drain(w);
    expect(await run(w, (tx) => tx.hostelRoom.count({ where: { roomNo: "B-21", archivedAt: null } }))).toBe(1);

    // The School Admin brings in a room in the girls' hostel; the boys' warden cannot undo it.
    const a: SchoolContext = { schoolId: h.school.id, userId: h.admin.id };
    const [other] = await upload(a, "Hostel,Floor,Room no\nGirls' Hostel,First,G-22\n", "girls.csv", "hostel-rooms");
    await run(a, (tx) => importFile(tx, a, other));
    await drain(a);
    const batchId = (await run(a, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id: other } }))).batchId!;
    await expect(run(w, (tx) => undoImport(tx, w, batchId))).rejects.toThrow("This import added rooms in another hostel. Ask the Principal or School Admin to undo it.");
    await run(a, (tx) => undoImport(tx, a, batchId));
  });
});

describe("Student Management, Import students (G16)", () => {
  let st: Awaited<ReturnType<typeof studentSchool>>;
  beforeAll(async () => {
    st = await studentSchool();
  }, 120_000);

  it("keeps the section for rows with no class and the fee plan choice with the file, and the import job uses them", async () => {
    const c = st.ctx;
    const csv = "Student Name,Date of Birth,Gender,Father's Name,Mobile Number\nKAVYA REDDY,14/03/2016,2-Female,SURESH REDDY,9876512345\n";
    const [id] = await upload(c, csv, "udise.csv", "students");
    await run(c, (tx) => tx.moveInFile.update({ where: { id }, data: { options: { sectionId: st.s5b, applyFeePlan: false } } }));
    const w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    // A UDISE+ download is read by the Students import: its headings are known, its codes and capitals tidied.
    expect(w.checked!.problems).toEqual([]);
    expect(w.checked!.ready[0].values).toMatchObject({ fullName: "Kavya Reddy", guardianName: "Suresh Reddy" });
    await run(c, (tx) => importFile(tx, c, id, { link: fileHref(PLACES.students, id) }));
    await drain(c);
    const kavya = await run(c, (tx) => tx.student.findFirstOrThrow({ where: { fullName: "Kavya Reddy" }, include: { enrolments: true } }));
    expect(kavya.enrolments[0].sectionId).toBe(st.s5b);
  });

  it("brings in changes to students already here on the same engine, and only on Student Management", async () => {
    const admin = await who(st.admin.id, st.school.id);
    expect(await placeRefusal(admin, PLACES.students, "students-update", "create")).toBeNull();
    expect(await placeRefusal(admin, PLACES.settings, "students-update", "create")).not.toBeNull();
    const teacher = await who(st.teacherUser.id, st.school.id);
    expect(await placeRefusal(teacher, PLACES.students, "students", "create")).not.toBeNull();
    const c = st.ctx;
    const kavya = await run(c, (tx) => tx.student.findFirstOrThrow({ where: { fullName: "Kavya Reddy" } }));
    const [id] = await upload(c, `Admission number,Address\n${kavya.admissionNo},"4-2 Kukatpally, Hyderabad"\n`, "changes.csv", "students-update");
    const w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    expect(w.checked!.ready).toHaveLength(1);
    await run(c, (tx) => importFile(tx, c, id));
    await drain(c);
    expect((await run(c, (tx) => tx.student.findUniqueOrThrow({ where: { id: kavya.id } }))).address).toBe("4-2 Kukatpally, Hyderabad");
    const batchId = (await run(c, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }))).batchId!;
    await run(c, (tx) => undoImport(tx, c, batchId));
    expect((await run(c, (tx) => tx.student.findUniqueOrThrow({ where: { id: kavya.id } }))).address).toBeNull();
    // Undo opens the file again, to fix and bring in again.
    expect((await run(c, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }))).status).toBe("open");
  });
});
