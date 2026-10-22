// Consent from paper forms (gap list G42): consents parents signed on paper
// are brought in on the one import engine, or class by class, each kept as
// recorded from a paper form with who recorded it. Nothing on record is ever
// replaced, a refusal is kept, Undo archives, and the consent log counts them.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { undoImport } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import { addUpload, importFile, settleImports, workOn } from "@/lib/move-in/service";
import { fileHref, PLACES } from "@/lib/imports/places";
import { consentRows, consentState } from "@/lib/students/consent";
import { consentLog } from "@/lib/students/consent-log";
import { markPaperFormsReceived, paperFormSheet } from "@/lib/students/paper-consent";
import "@/lib/import-registry";
import { makeCommSchool } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const texts: Record<string, string> = {};

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, async (tx) => {
    for (const [type, title] of [["data-processing", "Use of my child's data"], ["photo", "Photos of my child"], ["apaar", "APAAR ID"]]) {
      const t = await tx.consentText.create({ data: { schoolId: s.school.id, consentType: type, title, version: 1, text: { en: `${title}: I agree to this, as written by the school.` } } });
      texts[type] = t.id;
    }
    // Sita's father already agreed to photos in Parent Link.
    await tx.consentRecord.create({ data: { schoolId: s.school.id, guardianId: s.father.id, studentId: s.sita.id, consentType: "photo", consentTextId: texts.photo, textVersion: 1, how: "parent-link", givenAt: new Date("2026-08-01T10:00:00Z") } });
  });
}, 120_000);

const run = <T,>(c: SchoolContext, fn: (tx: Tx) => Promise<T>) => withSchool(c, fn, { timeout: 120_000 });

async function upload(c: SchoolContext, text: string, name: string) {
  const a = (await accessIn(c.userId!, c.schoolId))!;
  return run(c, async (tx) => {
    const saved = await saveFile(tx, c, { file: new File([text], name), purpose: "move-in", allowed: SHEET_TYPES });
    return addUpload(tx, c, a.permissions, { fileId: saved.id, fileName: name, kind: "consent-paper-forms" }, a.modulesOn);
  });
}

async function bringIn(c: SchoolContext, id: string) {
  await run(c, (tx) => importFile(tx, c, id, { link: fileHref(PLACES.students, id) }));
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: c.schoolId })) === 0) break;
  await run(c, (tx) => settleImports(tx));
  return (await run(c, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }))).batchId!;
}

describe("Consent from paper forms (G42)", () => {
  let batchId = "";

  it("checks each row, records the good ones as paper forms with the recorder, and never replaces a consent on record", async () => {
    const c = s.ctx;
    const csv = [
      "Adm No,Signed by,Consent type,Answer,Date signed,Version",
      `${s.ravi.admissionNo},Father,Data consent,Given,12-06-2026,`,
      `${s.ravi.admissionNo},,Photo,Given,12-06-2026,`,
      `${s.priya.admissionNo},,APAAR consent,Yes,01-07-2026,1`,
      `${s.anil.admissionNo},,Photo,Refused,01-07-2026,`,
      `${s.kiran.admissionNo},,Data,Maybe,01-07-2026,`,
      `${s.priya.admissionNo},,Photo,Given,01-01-2099,`,
      `${s.sita.admissionNo},Lakshmi Kumar,Fees,Given,01-07-2026,`,
      `${s.ravi.admissionNo},Father,Data,Given,12-06-2026,`,
      `${s.sita.admissionNo},${s.father.phone},Photo,Refused,01-07-2026,`,
      `${s.kiran.admissionNo},,APAAR,Given,01-07-2026,7`,
    ].join("\n");
    const [id] = await upload(c, csv, "paper-consents.csv");
    const w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    const checked = w.checked!;
    expect(checked.ready.map((r) => r.line).sort((a, b) => a - b)).toEqual([2, 4, 5]);
    const problem = (line: number) => checked.problems.find((p) => p.line === line)?.problems.join(" ") ?? "";
    expect(problem(3)).toMatch(/has 2 parents on record. Choose who signed/);
    expect(checked.problems.find((p) => p.line === 3)?.choices?.length).toBe(2);
    expect(problem(6)).toMatch(/Answer must be Given or Refused/);
    expect(problem(7)).toMatch(/cannot be after today/);
    expect(problem(8)).toMatch(/"Fees" is not one of your consents/);
    expect(problem(9)).toMatch(/twice in the file/);
    expect(problem(10)).toMatch(/already given photo consent for Sita Kumar .*does not take it back/);
    expect(problem(11)).toMatch(/no version 7 of the APAAR consent text/);

    batchId = await bringIn(c, id);
    const recs = await run(c, (tx) => tx.consentRecord.findMany({ where: { how: "paper-form" }, orderBy: { givenAt: "asc" } }));
    expect(recs).toHaveLength(3);
    for (const r of recs) expect(r.createdById).toBe(s.principal.id);
    const ravi = recs.find((r) => r.studentId === s.ravi.id)!;
    expect(ravi).toMatchObject({ guardianId: s.father.id, consentType: "data-processing", textVersion: 1, refused: false, withdrawnAt: null, givenAt: new Date("2026-06-12T00:00:00Z") });
    const anil = recs.find((r) => r.studentId === s.anil.id)!;
    expect(anil).toMatchObject({ refused: true, guardianId: s.optFather.id });
    expect(anil.withdrawnAt).not.toBeNull();
    expect(await run(c, (tx) => tx.auditLogEntry.count({ where: { recordType: "Consent Record", action: { in: ["consent-recorded-from-paper", "consent-refused-on-paper"] } } }))).toBe(3);

    // The parent's page reads them: given from paper, and a refusal that is not a consent.
    const rows = await run(c, (tx) => consentRows(tx, c, { guardianIds: [s.father.id, s.optFather.id] }));
    expect(consentState(rows.filter((r) => r.guardianId === s.optFather.id), "photo")).toBe("REFUSED");
    expect(rows.find((r) => r.studentId === s.ravi.id && r.consentType === "data-processing")).toMatchObject({ status: "GIVEN", method: "paper-form", recordedById: s.principal.id });
    // Sita's Parent Link consent is still there, untouched.
    expect(rows.find((r) => r.studentId === s.sita.id && r.consentType === "photo")).toMatchObject({ status: "GIVEN", method: "parent-link" });
  });

  it("an older paper form never overwrites a newer answer; a later one is added and the refusal stays in the history", async () => {
    const c = s.ctx;
    const csv = ["Admission number,Consent,Answer,Date on the form", `${s.anil.admissionNo},Photo,Given,01-06-2026`].join("\n");
    const [id] = await upload(c, csv, "older.csv");
    const older = (await run(c, (tx) => workOn(tx, c, id, { check: true }))).checked!;
    expect(older.problems[0].problems.join(" ")).toMatch(/A newer answer from Opted Out Father is on record \(refused on a paper form dated 01-07-2026\)/);
  });

  it("the consent log counts given, from paper, refused and not asked by consent and class", async () => {
    const log = await run(s.ctx, (tx) => consentLog(tx, s.ctx));
    const by = (t: string) => log.find((x) => x.consentType === t)!;
    expect(by("data-processing").totals).toMatchObject({ total: 5, given: 1, fromPaper: 1, notAsked: 4 });
    expect(by("apaar").totals).toMatchObject({ given: 1, fromPaper: 1 });
    expect(by("photo").totals).toMatchObject({ given: 1, fromPaper: 0, refused: 1 });
  });

  it("Undo archives the paper records: they no longer count as consent, and the import can be brought in again", async () => {
    const c = s.ctx;
    await run(c, (tx) => undoImport(tx, c, batchId));
    const recs = await run(c, (tx) => tx.consentRecord.findMany({ where: { how: "paper-form" } }));
    expect(recs).toHaveLength(3);
    for (const r of recs) {
      expect(r.archivedAt).not.toBeNull();
      expect(r.withdrawnAt).not.toBeNull();
    }
    const rows = await run(c, (tx) => consentRows(tx, c, { studentIds: [s.ravi.id, s.anil.id, s.priya.id] }));
    expect(rows.filter((r) => r.method === "paper-form")).toHaveLength(0);
    const log = await run(c, (tx) => consentLog(tx, c));
    expect(log.find((x) => x.consentType === "data-processing")!.totals.given).toBe(0);
  });

  it("paper forms received for a class: recorded for the first parent, as one import with Undo; answers on record are left as they are", async () => {
    const c = s.ctx;
    const r = await run(c, (tx) => markPaperFormsReceived(tx, c, { sectionId: s.a.id, sectionLabel: "Class 5 A", consentType: "photo", formDate: new Date("2026-07-15T00:00:00Z"), studentIds: [s.ravi.id, s.anil.id, s.priya.id] }));
    expect(r).toMatchObject({ recorded: 3, skipped: 0 });
    const sheet = await run(c, (tx) => paperFormSheet(tx, c, { sectionId: s.a.id, consentType: "photo" }));
    expect(sheet.find((x) => x.studentId === s.ravi.id)).toMatchObject({ state: "given", how: "paper-form", parent: { id: s.father.id } });
    const again = await run(c, (tx) => markPaperFormsReceived(tx, c, { sectionId: s.a.id, sectionLabel: "Class 5 A", consentType: "photo", formDate: new Date("2026-07-16T00:00:00Z"), studentIds: [s.ravi.id] }));
    expect(again).toMatchObject({ recorded: 0, skipped: 1 });
    expect(again.reasons[0]).toMatch(/already given photo consent for Ravi Kumar/);
    const batch = await run(c, (tx) => tx.importBatch.findUniqueOrThrow({ where: { id: r.batchId } }));
    expect(batch).toMatchObject({ kind: "consent-paper-forms", added: 3 });
    await expect(run(c, (tx) => markPaperFormsReceived(tx, c, { sectionId: s.a.id, sectionLabel: "Class 5 A", consentType: "photo", formDate: new Date("2099-01-01T00:00:00Z"), studentIds: [s.ravi.id] }))).rejects.toThrow(/cannot be after today/);
  });
});
