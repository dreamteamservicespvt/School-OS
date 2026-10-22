// QA IMPORT-01: after the ready rows of a file are brought in, the rows with
// problems and the rows the person left out stay with the file, counted, to
// fix and bring in as a further import of the same file. Each import has its
// own Undo, and the go-live check counts a file part brought in plainly.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { undoImport } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import { addUpload, blockers, chooseSheet, fixRow, goLiveSummary, importFile, leaveOut, removeFile, settleImports, warnings, workOn } from "@/lib/move-in/service";
import { count, stayWords } from "@/lib/imports/words";
import "@/lib/import-registry";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
let c: SchoolContext;

beforeAll(async () => {
  f = await makeFeeSchool();
  c = { schoolId: f.school.id, userId: f.principal.id };
}, 120_000);

const run = <T,>(fn: (tx: Tx) => Promise<T>) => withSchool(c, fn, { timeout: 120_000 });

async function upload(text: string, name: string, kind: string) {
  const a = (await accessIn(c.userId!, c.schoolId))!;
  return run(async (tx) => {
    const saved = await saveFile(tx, c, { file: new File([text], name), purpose: "move-in", allowed: SHEET_TYPES });
    return addUpload(tx, c, a.permissions, { fileId: saved.id, fileName: name, kind }, a.modulesOn);
  });
}

/** Runs this school's jobs (other test files share the queue) and settles its files. */
async function drain() {
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: c.schoolId })) === 0) break;
  await run((tx) => settleImports(tx));
}

const file = (id: string) => run((tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }));
const onCalendar = (title: string) => run((tx) => tx.calendarEntry.count({ where: { title, archivedAt: null } }));

describe("rows not brought in stay with the file (IMPORT-01)", () => {
  let id: string;
  let first: string;
  let second: string;

  it("brings in the ready row; the row with problems and the row left out stay, counted", async () => {
    const csv = "Holiday,Date\nRepublic Day,26-01-2027\nFounders Day,31-02-2027\nSports Day,15-02-2027\n";
    [id] = await upload(csv, "holidays.csv", "calendar-holidays");
    let w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.checked!.ready.map((r) => r.line)).toEqual([2, 4]);
    expect(w.checked!.problems.map((p) => p.line)).toEqual([3]);
    await run((tx) => leaveOut(tx, id, [4], true));

    expect(await run((tx) => importFile(tx, c, id))).toEqual({ rows: 1, problems: 1, leftOut: 1 });
    await drain();
    const after = await file(id);
    first = after.batchIds[0];
    expect(after).toMatchObject({ status: "open", batchId: first, batchIds: [first], broughtIn: { "2": first }, waiting: 2 });
    expect(await onCalendar("Republic Day")).toBe(1);

    // The file is not finished: the brought-in row is counted apart and not checked again.
    w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.prepared.passed).toMatchObject({ broughtIn: 1, leftOut: 1 });
    expect(w.checked!.ready).toEqual([]);
    expect(w.checked!.problems.map((p) => p.line)).toEqual([3]);
    // Rows are known by their row in this sheet: the heading row cannot change now.
    const perms = (await accessIn(c.userId!, c.schoolId))!.permissions;
    await expect(run((tx) => chooseSheet(tx, c, id, { sheetIndex: 0, headerRow: 2, kind: "calendar-holidays" }, perms))).rejects.toThrow(/Part of this file is already brought in/);
  });

  it("the go-live check warns about a file part brought in, and does not stop going live for it", async () => {
    const s = await run((tx) => goLiveSummary(tx, c));
    expect(s.checks).toMatchObject({ openFiles: 0, partFiles: 1, waitingRows: 2 });
    expect(blockers(s).join(" ")).not.toMatch(/not imported yet/);
    expect(warnings(s).join(" ")).toMatch(/1 file is part brought in: 2 rows with problems or left out are not brought in yet/);
  });

  it("the row fixed and the row brought back come in as a further import of the same file", async () => {
    await run((tx) => fixRow(tx, id, 3, { from: "28-02-2027" }));
    await run((tx) => leaveOut(tx, id, [4], false));
    const w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.checked!.ready.map((r) => r.line)).toEqual([3, 4]);
    expect(await run((tx) => importFile(tx, c, id))).toEqual({ rows: 2, problems: 0, leftOut: 0 });
    await drain();
    const after = await file(id);
    second = after.batchId!;
    expect(second).not.toBe(first);
    expect(after).toMatchObject({ status: "imported", batchIds: [first, second], broughtIn: { "2": first, "3": second, "4": second }, waiting: 0 });
    expect(await onCalendar("Founders Day")).toBe(1);
    expect(await onCalendar("Sports Day")).toBe(1);
    // Each import is its own Import Batch, with what it added.
    const batches = await run((tx) => tx.importBatch.findMany({ where: { id: { in: [first, second] } }, orderBy: { createdAt: "asc" } }));
    expect(batches.map((b) => b.added)).toEqual([1, 2]);
    const s = await run((tx) => goLiveSummary(tx, c));
    expect(s.checks).toMatchObject({ openFiles: 0, partFiles: 0 });
  });

  it("undoes each import on its own: its rows go back to the file", async () => {
    await run((tx) => undoImport(tx, c, second));
    let after = await file(id);
    expect(after).toMatchObject({ status: "open", batchId: first, batchIds: [first], broughtIn: { "2": first }, waiting: 2 });
    expect(await onCalendar("Founders Day")).toBe(0);
    expect(await onCalendar("Republic Day")).toBe(1);
    let w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.checked!.ready.map((r) => r.line)).toEqual([3, 4]);

    await run((tx) => undoImport(tx, c, first));
    after = await file(id);
    expect(after).toMatchObject({ status: "open", batchId: null, batchIds: [], broughtIn: {} });
    expect(await onCalendar("Republic Day")).toBe(0);
    w = await run((tx) => workOn(tx, c, id, { check: true }));
    expect(w.checked!.ready.map((r) => r.line)).toEqual([2, 3, 4]);
    // Nothing brought in any more: the file is not imported yet, and that stops going live.
    const s = await run((tx) => goLiveSummary(tx, c));
    expect(s.checks).toMatchObject({ openFiles: 1, partFiles: 0 });
    expect(blockers(s).join(" ")).toMatch(/1 file is not imported yet/);
    await run((tx) => removeFile(tx, c, id));
    expect((await file(id)).status).toBe("cancelled");
  });

  it("a file imported before rows were kept with it still settles and undoes as before", async () => {
    const [old] = await upload("Holiday,Date\nHoli,14-03-2027\n", "old.csv", "calendar-holidays");
    await run((tx) => importFile(tx, c, old));
    // As a file sent before this change: no rows marked as being brought in.
    await run((tx) => tx.moveInFile.update({ where: { id: old }, data: { broughtIn: {}, waiting: 0 } }));
    await drain();
    const after = await file(old);
    expect(after.status).toBe("imported");
    expect(after.batchIds).toEqual([after.batchId]);
    await run((tx) => undoImport(tx, c, after.batchId!));
    expect(await file(old)).toMatchObject({ status: "open", batchId: null, batchIds: [] });
  });
});

describe("counts in plain words", () => {
  it("says one row is and two rows are", () => {
    expect(count(1, "holiday")).toBe("1 holiday");
    expect(count(2, "holiday")).toBe("2 holidays");
    expect(stayWords(1, 0)).toBe("The 1 row with problems stays here, counted with the file; fix it and bring it in after.");
    expect(stayWords(2, 0)).toBe("The 2 rows with problems stay here, counted with the file; fix them and bring them in after.");
    expect(stayWords(1, 1)).toBe("The 1 row with problems and the 1 row you left out stay here, counted with the file; fix them and bring them in after.");
    expect(stayWords(0, 0)).toBe("");
  });
});
