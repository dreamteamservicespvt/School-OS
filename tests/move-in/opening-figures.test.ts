// Mid-year opening figures (gap list G19): a school that starts on School OS
// part way through the year brings in attendance so far, leave balances,
// staff pay details and salary to date, each on the one import engine with
// its module's own rules, row problems, Undo and Audit Log.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { saveFile, SHEET_TYPES } from "@/lib/files";
import { runDueJobs } from "@/lib/jobs";
import { undoImport } from "@/lib/importer";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { addUpload, importFile, settleImports, workOn } from "@/lib/move-in/service";
import { placeRefusal } from "@/lib/imports/place-access";
import { fileHref, PLACES } from "@/lib/imports/places";
import { attendanceSummary } from "@/lib/attendance/summary";
import { statusList } from "@/lib/attendance/settings";
import "@/lib/import-registry";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";
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
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

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

/** Checks a file, brings in the ready rows and returns the import's batch id. */
async function bringIn(c: SchoolContext, id: string, place: (typeof PLACES)[keyof typeof PLACES]) {
  await run(c, (tx) => importFile(tx, c, id, { link: fileHref(place, id) }));
  await drain(c);
  return (await run(c, (tx) => tx.moveInFile.findUniqueOrThrow({ where: { id } }))).batchId!;
}

describe("Attendance so far (G19)", () => {
  it("full Attendance Management only, on its own page and in Switching to School OS", async () => {
    const principal = await who(f.principal.id);
    const acc = await who(f.accountant.id);
    const teacher = await who((await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }] })).id);
    expect(await placeRefusal(principal, PLACES.attendance, "attendance-so-far", "create")).toBeNull();
    expect(await placeRefusal(principal, PLACES.settings, "attendance-so-far", "create")).toBeNull();
    expect(await placeRefusal(principal, PLACES.attendance, "attendance-so-far", "archive")).toBeNull();
    for (const p of [acc, teacher]) {
      expect(await placeRefusal(p, PLACES.attendance, "attendance-so-far", "create")).toMatch(/Only the Principal, the Vice Principal or the School Admin/);
      expect(await placeRefusal(p, PLACES.settings, "attendance-so-far", "create")).not.toBeNull();
    }
  });

  it("brings in one opening total per student, counted in the year's % and not in a month after it; Undo takes it back", async () => {
    const c = f.pctx;
    const csv = [
      "Adm No,Total Working Days,Present Days,As on",
      `${f.ravi.admissionNo},92,87.5,30-09-2026`,
      `${f.sita.admissionNo},,,`,
      `${f.anil.admissionNo},10,12,30-09-2026`,
      "NOPE-1,10,9,30-09-2026",
      `${f.ravi.admissionNo},50,40,30-09-2026`,
      `${f.sita.admissionNo},200,100,31-03-2026`,
    ].join("\n");
    const [id] = await upload(c, csv, "attendance.csv", "attendance-so-far");
    const w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ admissionNo: [0], daysMet: [1], daysPresent: [2], upToDate: [3] });
    const checked = w.checked!;
    expect(checked.ready.map((r) => r.line)).toEqual([2]);
    const problem = (line: number) => checked.problems.find((p) => p.line === line)?.problems.join(" ") ?? "";
    expect(problem(4)).toMatch(/Days present \(12\) cannot be more than the days the school met \(10\)/);
    expect(problem(5)).toMatch(/No student with admission number "NOPE-1"/);
    expect(problem(6)).toMatch(/twice in the file/);
    expect(problem(7)).toMatch(/Up to must be in 2026-27/);
    // An empty row in a sheet of every student is left out, not a problem.
    expect(checked.problems.some((p) => p.line === 3)).toBe(false);

    const batchId = await bringIn(c, id, PLACES.attendance);
    const row = await run(c, (tx) => tx.openingAttendance.findFirstOrThrow({ where: { studentId: f.ravi.id, archivedAt: null } }));
    expect(row).toMatchObject({ academicYearId: f.year.id, fromDate: day("2026-04-01"), upTo: day("2026-09-30") });
    expect(Number(row.daysMet)).toBe(92);
    expect(await run(c, (tx) => tx.auditLogEntry.count({ where: { action: "brought-in", recordType: "Opening Attendance", recordId: row.id } }))).toBe(1);

    // One absent day in School OS after go-live, and a stray mark inside the brought-in weeks (not counted twice).
    await run(c, async (tx) => {
      await statusList(tx, c);
      await tx.attendanceMark.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, studentId: f.ravi.id, sectionId: f.a.id, date: day("2026-10-01"), statusKey: "absent" } });
      await tx.attendanceMark.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, studentId: f.ravi.id, sectionId: f.a.id, date: day("2026-09-15"), statusKey: "absent" } });
    });
    const year = await run(c, (tx) => attendanceSummary(tx, c, { studentIds: [f.ravi.id], from: f.year.startDate, to: day("2026-10-01") }));
    const p = year.people.get(f.ravi.id)!;
    expect(p).toMatchObject({ countedDays: 93, present: 87.5, absent: 5.5, percent: 94.1 });
    expect(p.broughtIn).toMatchObject({ met: 92, present: 87.5 });
    // A section's register over the year counts it too.
    const section = await run(c, (tx) => attendanceSummary(tx, c, { sectionId: f.a.id, from: f.year.startDate, to: day("2026-10-01") }));
    expect(section.people.get(f.ravi.id)?.percent).toBe(94.1);
    // October alone does not hold the brought-in weeks.
    const october = await run(c, (tx) => attendanceSummary(tx, c, { studentIds: [f.ravi.id], from: day("2026-10-01"), to: day("2026-10-01") }));
    expect(october.people.get(f.ravi.id)).toMatchObject({ countedDays: 1, percent: 0 });

    // Brought in twice: the second file says so.
    const [again] = await upload(c, `Admission number,Days the school met,Days present,Up to\n${f.ravi.admissionNo},92,87,30-09-2026\n`, "again.csv", "attendance-so-far");
    const second = (await run(c, (tx) => workOn(tx, c, again, { check: true }))).checked!;
    expect(second.problems[0].problems.join(" ")).toMatch(/already brought in \(87.5 of 92 days up to 30-09-2026\)/);

    await run(c, (tx) => undoImport(tx, c, batchId));
    expect((await run(c, (tx) => tx.openingAttendance.findUniqueOrThrow({ where: { id: row.id } }))).archivedAt).not.toBeNull();
    const after = await run(c, (tx) => attendanceSummary(tx, c, { studentIds: [f.ravi.id], from: f.year.startDate, to: day("2026-10-01") }));
    expect(after.people.get(f.ravi.id)).toMatchObject({ countedDays: 2, percent: 0 });
    expect(after.people.get(f.ravi.id)?.broughtIn).toBeUndefined();
  });
});

describe("Leave balances at go-live (G19)", () => {
  it("HR's work, as on Staff Leave; each row moves one balance and Undo takes it back", async () => {
    const principal = await who(f.principal.id);
    const acc = await who(f.accountant.id);
    expect(await placeRefusal(principal, PLACES.staff, "staff-leave-balances", "create")).toBeNull();
    expect(await placeRefusal(principal, PLACES.settings, "staff-leave-balances", "create")).toBeNull();
    expect(await placeRefusal(acc, PLACES.staff, "staff-leave-balances", "create")).not.toBeNull();
    expect(await placeRefusal(acc, PLACES.settings, "staff-leave-balances", "create")).not.toBeNull();

    const c = f.pctx;
    const { asha } = await run(c, async (tx) => {
      const base = { schoolId: f.school.id, campusId: f.school.campus.id, designation: "Teacher", joiningDate: day("2020-06-01") };
      const asha = await tx.staff.create({ data: { ...base, staffCode: "LB-1", firstName: "Asha", fullName: "Asha Rao", phone: "9876500911" } });
      await tx.staff.create({ data: { ...base, staffCode: "LB-2", firstName: "Bala", fullName: "Bala Iyer", phone: "9876500912" } });
      for (const [name, code, days, paid] of [["Casual Leave", "CL", 12, true], ["Earned Leave", "EL", 15, true], ["Leave Without Pay", "LWP", 0, false]] as const) {
        await tx.leaveType.create({ data: { schoolId: f.school.id, forWhom: "staff", name, code, daysPerYear: days, paid } });
      }
      return { asha };
    });
    const csv = "Emp Code,Leave Type,Balance,Leave Taken\nLB-1,CL,8,\nLB-1,el,,4\nLB-2,LWP,3,\nLB-2,CL,2,2\nLB-9,CL,1,\nLB-2,EL,,\n";
    const [id] = await upload(c, csv, "leave.csv", "staff-leave-balances");
    const w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ staffId: [0], leaveType: [1], daysLeft: [2], daysTaken: [3] });
    const checked = w.checked!;
    expect(checked.ready.map((r) => r.line)).toEqual([2, 3]);
    const problem = (line: number) => checked.problems.find((p) => p.line === line)?.problems.join(" ") ?? "";
    expect(problem(4)).toMatch(/Leave Without Pay is unpaid and has no balance/);
    expect(problem(5)).toMatch(/Fill Days left or Days taken, not both/);
    expect(problem(6)).toMatch(/No staff member has the staff ID LB-9/);
    expect(checked.problems.some((p) => p.line === 7)).toBe(false);

    const batchId = await bringIn(c, id, PLACES.staff);
    const left = async () => {
      const rows = await run(c, async (tx) => {
        const { balancesFor } = await import("@/lib/staff/leave");
        return (await balancesFor(tx, c, [asha.id], f.year.id)).get(asha.id)!;
      });
      return Object.fromEntries(rows.filter((r) => r.limited).map((r) => [r.type.code, r.left]));
    };
    expect(await left()).toEqual({ CL: 8, EL: 11 });
    const batch = await run(c, (tx) => tx.importBatch.findUniqueOrThrow({ where: { id: batchId } }));
    expect(batch).toMatchObject({ added: 0, updated: 2 });
    expect(await run(c, (tx) => tx.auditLogEntry.count({ where: { action: "leave-balance-adjusted", recordType: "Leave Balance", after: { path: ["kind"], equals: "brought-in" } } }))).toBe(2);

    // Brought in twice: the second file says so.
    const [again] = await upload(c, "Staff ID,Leave type,Days left\nLB-1,Casual Leave,9\n", "again.csv", "staff-leave-balances");
    expect((await run(c, (tx) => workOn(tx, c, again, { check: true }))).checked!.problems[0].problems.join(" ")).toMatch(/already brought in \(8 days left at go-live\)/);

    expect(await run(c, (tx) => undoImport(tx, c, batchId))).toMatchObject({ archived: 0, putBack: 2 });
    expect(await left()).toEqual({ CL: 12, EL: 15 });
    // After Undo the same file can come in again.
    expect((await run(c, (tx) => workOn(tx, c, again, { check: true }))).checked!.ready).toHaveLength(1);
  });
});

describe("Staff pay details (G19)", () => {
  it("restricted: HR, the Principal and the School Admin only; never in plain words in the Audit Log; Undo puts the old values back", async () => {
    const principal = await who(f.principal.id);
    // Role templates start switched off; HR is switched on here.
    await run(f.pctx, (tx) => tx.role.updateMany({ where: { key: "hr" }, data: { isEnabled: true } }));
    const hr = await who((await makeUser({ schools: [{ id: f.school.id, roleKeys: ["hr"] }] })).id);
    const acc = await who(f.accountant.id);
    for (const p of [principal, hr]) {
      expect(await placeRefusal(p, PLACES.staff, "staff-pay-details", "create")).toBeNull();
      expect(await placeRefusal(p, PLACES.settings, "staff-pay-details", "create")).toBeNull();
    }
    expect(await placeRefusal(acc, PLACES.staff, "staff-pay-details", "create")).not.toBeNull();
    expect(await placeRefusal(acc, PLACES.settings, "staff-pay-details", "archive")).not.toBeNull();

    const c = f.pctx;
    const pd1 = await run(c, async (tx) => {
      const base = { schoolId: f.school.id, campusId: f.school.campus.id, designation: "Teacher", joiningDate: day("2020-06-01") };
      await tx.staff.create({ data: { ...base, staffCode: "PD-2", firstName: "Gita", fullName: "Gita Nair", phone: "9876500922" } });
      return tx.staff.create({ data: { ...base, staffCode: "PD-1", firstName: "Hari", fullName: "Hari Prasad", phone: "9876500921", uan: "100000000001" } });
    });
    const csv = [
      "Emp Code,Bank,A/c No,IFSC Code,PAN No,UAN No,ESIC No",
      "PD-1,State Bank of India,3001 2345 678,sbin0001234,abcde1234f,1009 8765 4321,3112345678",
      "PD-2,,12345,,,,",
      "PD-3,,,,ABCDE1234F,,",
      "PD-2,,,,,,",
    ].join("\n");
    const [id] = await upload(c, csv, "pay.csv", "staff-pay-details");
    const w = await run(c, (tx) => workOn(tx, c, id, { check: true }));
    expect(w.choices.columnMatch).toMatchObject({ staffId: [0], bankName: [1], bankAccount: [2], bankIfsc: [3], pan: [4], uan: [5], esiNo: [6] });
    const checked = w.checked!;
    expect(checked.ready.map((r) => r.line)).toEqual([2]);
    const problem = (line: number) => checked.problems.find((p) => p.line === line)?.problems.join(" ") ?? "";
    expect(problem(3)).toMatch(/9 to 18 digits.*IFSC is needed with the bank account/);
    expect(problem(4)).toMatch(/No staff member has the staff ID PD-3/);
    expect(checked.problems.some((p) => p.line === 5)).toBe(false);

    const batchId = await bringIn(c, id, PLACES.staff);
    const { decryptField } = await import("@/lib/crypto");
    const after = await run(c, (tx) => tx.staff.findUniqueOrThrow({ where: { id: pd1.id } }));
    expect(decryptField(after.panEnc!)).toBe("ABCDE1234F");
    expect(decryptField(after.bankAccountEnc!)).toBe("30012345678");
    expect(after).toMatchObject({ bankIfsc: "SBIN0001234", bankName: "State Bank of India", uan: "100987654321", esiNo: "3112345678" });
    // Only masked values in the Audit Log, and never the plain numbers with the import for Undo.
    const audit = await run(c, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Staff", recordId: pd1.id } }));
    expect(audit.map((a) => a.action)).toContain("changed-restricted");
    const words = JSON.stringify(audit);
    expect(words).not.toMatch(/30012345678|ABCDE1234F/);
    expect(words).toMatch(/PAN ••••••234F/);
    const batch = await run(c, (tx) => tx.importBatch.findUniqueOrThrow({ where: { id: batchId } }));
    expect(batch).toMatchObject({ added: 0, updated: 1 });
    expect(JSON.stringify(batch.updatedRows)).not.toMatch(/30012345678|ABCDE1234F/);

    // The same details again: nothing to change.
    const [again] = await upload(c, "Staff ID,PAN\nPD-1,ABCDE1234F\n", "again.csv", "staff-pay-details");
    expect((await run(c, (tx) => workOn(tx, c, again, { check: true }))).checked!.problems[0].problems.join(" ")).toMatch(/already on Hari Prasad's record/);

    // Changed by hand since: kept. The rest goes back to what was on record.
    await run(c, (tx) => tx.staff.update({ where: { id: pd1.id }, data: { esiNo: "3199999999" } }));
    expect(await run(c, (tx) => undoImport(tx, c, batchId))).toMatchObject({ putBack: 1 });
    expect(await run(c, (tx) => tx.staff.findUniqueOrThrow({ where: { id: pd1.id } }))).toMatchObject({ panEnc: null, bankAccountEnc: null, bankIfsc: null, bankName: null, uan: "100000000001", esiNo: "3199999999" });
  });
});
