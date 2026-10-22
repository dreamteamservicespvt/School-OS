// Old dues from a sheet that lists every student (workflow 15, follow-up C):
// a row with an empty, "-", "nil" or zero amount is simply left out and
// counted as "No old dues" in the check and the result, never shown as a
// problem row to fix. Through Fee Management's Import page, as the Accountant,
// with a real session, on the one import engine (Switching to School OS, G16).
import { beforeAll, describe, expect, it, vi } from "vitest";

let token: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "sos_session" && token ? { name, value: token } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
  unstable_rethrow: () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createSession } from "@/lib/auth/sessions";
import { withSchool } from "@/lib/db";
import { noOldDues } from "@/lib/fees/import";
import { runDueJobs } from "@/lib/jobs";
import { settleImports, workOn } from "@/lib/move-in/service";
import { importAction, uploadAction } from "@/app/(school)/_imports/file-actions";
import { makeFeeSchool, type FeeSchool } from "./fixture";

let f: FeeSchool;
const signIn = async (userId: string) => { token = (await createSession(userId, f.school.id, { userAgent: "test" })).token; };

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("rows with no old dues are left out, not problems (follow-up C)", () => {
  it("reads an empty, dash, nil or zero amount as no old dues, and a real amount or a wrong one as a row to check", () => {
    for (const v of ["", "  ", "-", "0", "0.00", "₹0", "Rs. 0/-", "nil", "NIL", "None"]) expect(noOldDues({ amount: v }), v).toBe("No old dues");
    for (const v of ["3500", "Rs. 12,500/-", "0.50", "abc"]) expect(noOldDues({ amount: v }), v).toBeNull();
  });

  it("checks and imports a sheet of every student: only the dues come in, the rest are counted as no old dues", async () => {
    await signIn(f.accountant.id);
    const csv = [
      "Admission number,Fee head,Amount,Due date",
      `${f.ravi.admissionNo},,3500,31-03-2026`,
      `${f.sita.admissionNo},,,31-03-2026`,
      `${f.anil.admissionNo},,0,31-03-2026`,
      "NO-DUES-1,,-,31-03-2026",
      "NOPE-1,,100,31-03-2026",
    ].join("\n");
    const up = new FormData();
    up.set("place", "fees");
    up.set("kind", "fee-old-dues");
    up.set("file", new File([csv], "every-student.csv", { type: "text/csv" }));
    // Uploading opens the file's own page on Fee Management.
    const sent = await uploadAction(null, up).then((r) => r?.message ?? "Not uploaded", (e: Error) => e.message);
    const id = /^REDIRECT \/fee-management\/ledger\/import\/review\/([0-9a-f-]{36})$/.exec(sent)?.[1];
    if (!id) throw new Error(sent);

    const checked = (await withSchool(f.ctx, (tx) => workOn(tx, f.ctx, id, { check: true }), { timeout: 120_000 })).checked!;
    expect(checked.ready).toHaveLength(1);
    expect(checked.problems.map((b) => b.line)).toEqual([6]);
    expect(checked.problems[0].problems.join(" ")).toMatch(/No student with admission number "NOPE-1"/);
    expect(checked.left).toEqual([{ reason: "No old dues", count: 3 }]);

    expect(await importAction("fees", id)).toBeUndefined();
    for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: f.school.id })) === 0) break;
    const batch = await withSchool(f.ctx, async (tx) => {
      await settleImports(tx);
      const file = await tx.moveInFile.findUniqueOrThrow({ where: { id } });
      return tx.importBatch.findUniqueOrThrow({ where: { id: file.batchId! } });
    });
    expect(batch).toMatchObject({ added: 1, skipped: 0, importedById: f.accountant.id });
    expect(batch.leftOut).toEqual([{ reason: "No old dues", count: 3 }]);
    // The row with a problem was not brought in: it stays with the file, counted, to fix and bring in (QA IMPORT-01).
    const after = await withSchool(f.ctx, (tx) => workOn(tx, f.ctx, id, { check: true }), { timeout: 120_000 });
    expect(after.file).toMatchObject({ status: "open", waiting: 1 });
    expect(after.prepared.passed.broughtIn).toBe(1);
    expect(after.checked!.problems.map((b) => b.line)).toEqual([6]);
    expect(after.checked!.ready).toEqual([]);
    const old = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findMany({ where: { kind: "OLD_DUES", state: "OPEN" } }));
    expect(old.map((d) => [d.studentId, d.amountPaise])).toEqual([[f.ravi.id, BigInt(350000)]]);
  });
});
