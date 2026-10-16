// A student added to a class gets the class fee plan when "Apply the class fee
// plan" is on (03 §1, 06 "Linked modules", A2 and A13). Before QA PEOPLE-24
// nothing in Fee Management listened, so new and admitted students owed nothing.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { createStudent } from "@/lib/students/students";
import { makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
beforeAll(async () => {
  f = await makeFeeSchool();
});

const add = (name: string, phone: string, applyFeePlan: boolean) =>
  withSchool(f.pctx, (tx) => createStudent(tx, f.pctx, {
    fullName: name, sectionId: f.a.id, dateOfBirth: new Date("2015-05-01"), gender: "Female",
    guardianName: `${name} Parent`, guardianPhone: phone, admissionDate: new Date("2026-10-16"), applyFeePlan,
  }));

describe("class fee plan for a new student (QA PEOPLE-24)", () => {
  it("adds the class plan's installments when the choice is on", async () => {
    const { student } = await add("Demo Plan On", "9876511001", true);
    const rows = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findMany({ where: { studentId: student.id, kind: "FEE" } }));
    expect(rows.length).toBe(4);
    expect(rows.reduce((t, r) => t + r.amountPaise, BigInt(0))).toBe(R(24000));
    expect(rows.every((r) => r.structureId === f.structureId)).toBe(true);
  });

  it("adds nothing when the choice is off", async () => {
    const { student } = await add("Demo Plan Off", "9876511002", false);
    expect(await withSchool(f.ctx, (tx) => tx.studentFeeDue.count({ where: { studentId: student.id } }))).toBe(0);
  });
});
