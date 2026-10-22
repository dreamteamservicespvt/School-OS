// QA PLATFORM-17: a record page whose record is not there answered HTTP 200, because
// the module's loading.tsx had already started the page streaming. The school layout
// now asks src/lib/record-gate.ts on a full page load and calls notFound() before
// anything streams. This proves which paths it decides and that another school's
// record counts as missing (row-level security), while this school's does not.
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { RULE_PATHS, recordMissing, recordsIn } from "@/lib/record-gate";
import { makeSchool } from "../helpers";

const id = "0b6f1d3e-9c1a-4c55-9b0e-6d2f6c1d2a11";

describe("which paths open a record", () => {
  it("finds the record of a record page and of the pages under it", () => {
    expect(recordsIn(`/student-management/students/${id}`)).toHaveLength(1);
    expect(recordsIn(`/student-management/students/${id}/edit/personal`)).toHaveLength(1);
    expect(recordsIn(`/student-management/students/${id}/parents/${id}`)).toHaveLength(2);
    expect(recordsIn(`/fee-management/payments/${id}?print=1`)[0].ids).toEqual([id]);
    // An applicant's application fee at Collect Fee: the application, not a student called "application".
    expect(recordsIn(`/fee-management/collect/application/${id}`)).toEqual([expect.objectContaining({ ids: [id], notAnId: false })]);
    expect(recordsIn(`/fee-management/collect/application/${id}`)[0].rule.path).toBe("fee-management/collect/application/:applicationId");
  });

  it("leaves fixed pages, other shapes and unknown paths to the page", () => {
    // A fixed page beside the record pages is not an id.
    expect(recordsIn("/student-management/leaving/alumni")).toHaveLength(0);
    expect(recordsIn("/inventory-management/items/audits")).toHaveLength(0);
    expect(recordsIn("/staff-hr-management/exit")).toHaveLength(0);
    expect(recordsIn("/dashboard")).toHaveLength(0);
    expect(recordsIn(`/no-such-module/${id}`)).toHaveLength(0);
  });

  it("knows a bad id where an id belongs", () => {
    expect(recordsIn("/student-management/students/not-an-id")).toEqual([expect.objectContaining({ notAnId: true })]);
    expect(recordsIn("/student-management/leaving/not-an-id")).toEqual([expect.objectContaining({ notAnId: true })]);
    // The fixed folders beside the record folder are left to the page.
    expect(recordsIn("/inventory-management/items/movements")).toHaveLength(0);
    expect(recordsIn(`/fee-management/payments/${id}`)[0].notAnId).toBe(false);
  });

  it("matches the record pages in src/app, with every fixed folder beside them", () => {
    const app = path.resolve(import.meta.dirname, "../../src/app/(school)");
    for (const { path: rule, beside } of RULE_PATHS) {
      let dir = app;
      for (const seg of rule.split("/")) {
        const param = seg[0] === ":";
        if (param) {
          // A fixed page beside the record folder must never be taken for a bad id. A route group here would hide pages.
          const fixed = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !/^[[_]/.test(d.name)).map((d) => d.name);
          expect({ rule, missing: fixed.filter((f) => !beside.includes(f)) }).toEqual({ rule, missing: [] });
        }
        dir = path.join(dir, param ? `[${seg.slice(1)}]` : seg);
        expect(existsSync(dir), `${rule}: ${dir}`).toBe(true);
      }
    }
  });
});

describe("a missing record", () => {
  it("is this school's record not there, or another school's record", async () => {
    const a = await makeSchool("Gate School A");
    const b = await makeSchool("Gate School B");
    const inB = await withSchool({ schoolId: b.id, userId: null }, async (tx) => {
      const student = await tx.student.create({ data: { schoolId: b.id, campusId: b.campus.id, admissionNo: "G/0001", firstName: "Only", fullName: "Only In B" } });
      const guardian = await tx.guardian.create({ data: { schoolId: b.id, name: "Parent In B", relationship: "Father", phone: "9876512341" } });
      const link = await tx.studentGuardian.create({ data: { schoolId: b.id, studentId: student.id, guardianId: guardian.id, relationship: "Father", isPrimary: true } });
      return { student: student.id, guardian: guardian.id, link: link.id };
    });

    // School B opens its own records.
    await withSchool({ schoolId: b.id, userId: null }, async (tx) => {
      expect(await recordMissing(tx, `/student-management/students/${inB.student}`)).toBe(false);
      expect(await recordMissing(tx, `/student-management/students/${inB.student}/parents/${inB.link}`)).toBe(false);
      expect(await recordMissing(tx, `/student-management/guardians/${inB.guardian}`)).toBe(false);
      expect(await recordMissing(tx, `/student-management/students/${inB.student}/parents/${randomUUID()}`)).toBe(true);
      expect(await recordMissing(tx, `/fee-management/ledger/${randomUUID()}`)).toBe(true);
      expect(await recordMissing(tx, "/student-management/students/not-an-id")).toBe(true);
      expect(await recordMissing(tx, "/student-management/leaving/alumni")).toBe(false);
    });

    // School A cannot see them: the page answers 404, as for a record that never existed.
    await withSchool({ schoolId: a.id, userId: null }, async (tx) => {
      expect(await recordMissing(tx, `/student-management/students/${inB.student}`)).toBe(true);
      expect(await recordMissing(tx, `/fee-management/collect/${inB.student}`)).toBe(true);
      expect(await recordMissing(tx, `/student-management/guardians/${inB.guardian}/edit`)).toBe(true);
      // Pages that are not record pages are never refused here.
      expect(await recordMissing(tx, "/student-management")).toBe(false);
      expect(await recordMissing(tx, null)).toBe(false);
    });
  });
});
