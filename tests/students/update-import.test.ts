// Correcting students already on record from a sheet (P10 "updated"): found by
// admission number, empty cells leave values alone, the preview lists each
// change, and Undo puts the old values back unless someone changed them since.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { previewImport, runImport, undoImport } from "@/lib/importer";
import { studentUpdateImport, type StudentUpdate } from "@/lib/students/update-import";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";

let f: FeeSchool;
let other: FeeSchool;
const COLS = { admissionNo: 0, guardianPhone: 1, address: 2, dateOfBirth: 3, fullName: 4 };

beforeAll(async () => {
  [f, other] = await Promise.all([makeFeeSchool(), makeFeeSchool()]);
}, 120_000);

const preview = (s: FeeSchool, rows: string[][]) => withSchool(s.ctx, (tx) => previewImport(tx, s.ctx, studentUpdateImport, rows, COLS));

describe("changes to students already here", () => {
  it("lists only what changes, and refuses unknown, repeated and unchanged rows", async () => {
    const p = await preview(f, [
      [f.ravi.admissionNo, "+91 97000 11111", "4-2 Kukatpally, Hyderabad", "", ""],
      [f.sita.admissionNo, "", "", "", "Sita Rao"],
      ["NO-SUCH-1", "9700011112", "", "", ""],
      [f.ravi.admissionNo, "9700011113", "", "", ""],
      [f.anil.admissionNo, "123", "", "31-02-2015", ""],
    ]);
    expect(p.good.map((g) => (g.value as StudentUpdate).studentId)).toEqual([f.ravi.id]);
    expect((p.good[0].value as StudentUpdate).changes.map((c) => `${c.label}: ${c.from} → ${c.to}`)).toEqual([
      "Address: empty → 4-2 Kukatpally, Hyderabad",
      `Parent's phone: ${f.ravi.guardian.phone} → 9700011111`,
    ]);
    const problems = p.bad.map((b) => b.problems.join(" "));
    expect(problems[0]).toMatch(/Nothing to change for Sita Rao/);
    expect(problems[1]).toMatch(/No student has admission number NO-SUCH-1/);
    expect(problems[2]).toMatch(/appears twice in this file/);
    expect(problems[3]).toMatch(/Date of birth 31-02-2015 is not a real date/);
    expect(problems[3]).toMatch(/Parent's phone/);
  });

  it("never finds another school's student by the same admission number", async () => {
    const p = await preview(other, [[f.ravi.admissionNo, "9700011111", "", "", ""]]);
    expect(p.good).toHaveLength(0);
  });

  it("saves the changes with the audit, and Undo puts back only what nobody changed since", async () => {
    const p = await preview(f, [[f.ravi.admissionNo, "9700011111", "4-2 Kukatpally, Hyderabad", "", ""]]);
    const batch = await withSchool(f.ctx, (tx) => runImport(tx, f.ctx, studentUpdateImport, "fix.csv", p));
    expect(batch).toMatchObject({ added: 0, updated: 1 });
    const after = await withSchool(f.ctx, (tx) => tx.student.findUniqueOrThrow({ where: { id: f.ravi.id } }));
    expect(after.address).toBe("4-2 Kukatpally, Hyderabad");
    expect((await withSchool(f.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: f.ravi.guardian.id } }))).phone).toBe("9700011111");
    expect(await withSchool(f.ctx, (tx) => tx.auditLogEntry.count({ where: { recordId: f.ravi.id, recordType: "Student", action: "changed" } }))).toBe(1);

    // The office corrects the address again by hand before the import is undone.
    await withSchool(f.ctx, (tx) => tx.student.update({ where: { id: f.ravi.id }, data: { address: "Hand-typed address" } }));
    const undone = await withSchool(f.ctx, (tx) => undoImport(tx, f.ctx, batch.id));
    expect(undone.putBack).toBe(1);
    const back = await withSchool(f.ctx, (tx) => tx.student.findUniqueOrThrow({ where: { id: f.ravi.id } }));
    expect(back.address).toBe("Hand-typed address");
    expect((await withSchool(f.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: f.ravi.guardian.id } }))).phone).toBe(f.ravi.guardian.phone);
  });
});
