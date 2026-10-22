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
    expect(note?.link).toBe(`/fee-management/ledger/import/file/${id}`);
    expect(await run(c, (tx) => tx.auditLogEntry.count({ where: { action: "imported", recordType: "Import", recordId: batch.id } }))).toBe(1);

    await run(c, (tx) => undoImport(tx, c, batch.id));
    expect(await run(c, (tx) => tx.studentFeeDue.count({ where: { studentId: f.ravi.id, kind: "OLD_DUES", state: "OPEN" } }))).toBe(0);
  });
});

