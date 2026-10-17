// Switching to School OS (workflow 15): old dues and past receipts brought in
// from the old software, and undoing an import of students safely.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { importKind, previewImport, runImport, undoImport } from "@/lib/importer";
import "@/lib/fees/import";
import { undoStudents } from "@/lib/students/import";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const RECEIPT_COLS = { admissionNo: 0, oldReceiptNo: 1, date: 2, amount: 3, mode: 4, feeHead: 5 };
const DUES_COLS = { admissionNo: 0, feeHead: 1, amount: 2, dueDate: 3, note: 4 };

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

async function bringIn(key: string, rows: string[][], match: Record<string, number>) {
  const kind = importKind(key)!;
  return withSchool(f.ctx, async (tx) => {
    const preview = await previewImport(tx, f.ctx, kind, rows, match);
    const batch = preview.good.length ? await runImport(tx, f.ctx, kind, "old.csv", preview) : null;
    return { preview, batch };
  });
}

describe("past receipts from the old software", () => {
  it("reduce the dues they paid, oldest first; what is over is held as advance; never in the Day Book", async () => {
    const r = await bringIn("fee-past-receipts", [
      [f.ravi.admissionNo, "OLD-11", "15-07-2026", "Rs. 7,000/-", "Cash", ""],
      [f.sita.admissionNo, "OLD-12", "20-07-2026", "30000", "UPI", "Tuition fee"],
    ], RECEIPT_COLS);
    expect(r.preview.bad).toEqual([]);
    const ravi = await dues(f.ctx, f.ravi.id);
    expect(ravi.map((d) => Number(d.balancePaise) / 100)).toEqual([0, 5000, 6000, 6000]);
    const sita = await dues(f.ctx, f.sita.id);
    expect(sita.every((d) => d.balancePaise === BigInt(0))).toBe(true);
    const sitaPay = await withSchool(f.ctx, (tx) => tx.payment.findFirstOrThrow({ where: { studentId: f.sita.id, broughtIn: true } }));
    expect(sitaPay.advancePaise).toBe(R(6000));
    const posted = await withSchool(f.ctx, (tx) => tx.dayBookEntry.count({ where: { sourceType: "payment", sourceId: sitaPay.id } }));
    expect(posted).toBe(0);

    // Undo puts the dues back as they were.
    await withSchool(f.ctx, (tx) => undoImport(tx, f.ctx, r.batch!.id));
    const back = await dues(f.ctx, f.ravi.id);
    expect(back.map((d) => Number(d.balancePaise) / 100)).toEqual([6000, 6000, 6000, 6000]);
    expect((await dues(f.ctx, f.sita.id)).every((d) => d.balancePaise === R(6000))).toBe(true);
  });
});

describe("old dues from the old software", () => {
  it("are brought in once per student and fee head; a second time is refused with the amount already there", async () => {
    const first = await bringIn("fee-old-dues", [[f.anil.admissionNo, "", "₹ 2,500", "31-03-2026", "From 2025-26"]], DUES_COLS);
    expect(first.preview.bad).toEqual([]);
    const again = await bringIn("fee-old-dues", [[f.anil.admissionNo, "", "2500", "31-03-2026", ""]], DUES_COLS);
    expect(again.batch).toBeNull();
    expect(again.preview.bad[0].problems.join(" ")).toMatch(/already brought in: ₹2,500\./);
    // The same student twice in one file.
    const twice = await bringIn("fee-old-dues", [[f.ravi.admissionNo, "", "100", "31-03-2026", ""], [f.ravi.admissionNo, "Old dues", "200", "31-03-2026", ""]], DUES_COLS);
    expect(twice.preview.good).toHaveLength(1);
    expect(twice.preview.bad[0].problems.join(" ")).toMatch(/on another row of the file/);
  });
});

describe("undoing an import of students", () => {
  it("is refused once a student has a fee payment made in School OS", async () => {
    const open = await dues(f.ctx, f.anil.id);
    await collect(f.ctx, { studentId: f.anil.id, dueIds: [open[0].id], amountPaise: R(1000) });
    await expect(withSchool(f.ctx, (tx) => undoStudents(tx, f.ctx, [f.anil.id, f.sita.id]))).rejects.toThrow(/cannot be undone: 1 of its students already has .*Anil Das/);
    // Nothing was archived.
    expect(await withSchool(f.ctx, (tx) => tx.student.count({ where: { id: { in: [f.anil.id, f.sita.id] }, archivedAt: { not: null } } }))).toBe(0);
  });

  it("archives a student with no School OS records and takes their unpaid fee rows off", async () => {
    await withSchool(f.ctx, (tx) => undoStudents(tx, f.ctx, [f.sita.id]));
    const s = await withSchool(f.ctx, (tx) => tx.student.findUniqueOrThrow({ where: { id: f.sita.id } }));
    expect(s.archivedAt).not.toBeNull();
    expect(await withSchool(f.ctx, (tx) => tx.studentFeeDue.count({ where: { studentId: f.sita.id, state: "OPEN" } }))).toBe(0);
  });
});
