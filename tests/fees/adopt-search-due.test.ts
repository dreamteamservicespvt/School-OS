// Adopt item 8 (docs/research/inkwelly-2026-11-15.md): the due amount beside
// each student in the top search and the student picker, only for roles that
// may see fees (seesStudentFees and the fee reach). A teacher never gets it.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import type { Current } from "@/lib/current";
import { todayIn } from "@/lib/staff/dates";
import { dueChipOf, dueChipsFor } from "@/lib/fees/due-chips";
import { makeUser } from "../helpers";
import { makeFeeSchool, type FeeSchool } from "./fixture";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", () => ({ getCurrent: async () => who.current }));
const search = await import("@/app/api/v1/search/route");

type Hit = { id: string; name: string; due?: { text: string; tone: string } };
const find = async (q: string) => (await search.GET(new Request(`http://localhost/api/v1/search?q=${encodeURIComponent(q)}`))).json() as Promise<{ students: Hit[] }>;
const currentFor = async (schoolId: string, userId: string): Promise<Current> => {
  const access = await accessIn(userId, schoolId);
  return { ...access!, ctx: { schoolId, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
};

let f: FeeSchool;
let teacherId: string;

beforeAll(async () => {
  f = await makeFeeSchool();
  // A class teacher of Class 5 A, who sees Ravi on Students but has no fee access (05-roles.md).
  const teacher = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["class-teacher"] }], name: "Class Teacher" });
  teacherId = teacher.id;
  await withSchool(f.ctx, async (tx) => {
    const staff = await tx.staff.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, staffCode: `T${randomUUID().slice(0, 6)}`, firstName: "Class", fullName: "Class Teacher", phone: "9876512345", designation: "TGT", joiningDate: new Date("2020-06-01"), userLoginId: teacher.id } });
    await tx.section.update({ where: { id: f.a.id }, data: { classTeacherId: staff.id } });
  });
}, 120_000);

describe("due chip words", () => {
  it("says overdue in red, due in amber and no dues in green", () => {
    expect(dueChipOf(BigInt(1755000), true)).toEqual({ text: "₹17,550 overdue", tone: "bad" });
    expect(dueChipOf(BigInt(820000), false)).toEqual({ text: "₹8,200 due", tone: "warn" });
    expect(dueChipOf(BigInt(0), false)).toEqual({ text: "No dues", tone: "ok" });
  });
});

describe("due beside each student in search", () => {
  it("the accountant sees what Ravi owes now", async () => {
    who.current = await currentFor(f.school.id, f.accountant.id);
    const ravi = (await find("Ravi")).students.find((s) => s.id === f.ravi.id);
    expect(ravi?.due).toBeDefined();
    expect(ravi!.due!.text).toMatch(/^(₹[\d,]+ (overdue|due)|No dues)$/);
  });

  it("is hidden for a teacher: the student is found, the money is not sent", async () => {
    who.current = await currentFor(f.school.id, teacherId);
    const body = await find("Ravi");
    const ravi = body.students.find((s) => s.id === f.ravi.id);
    expect(ravi).toBeDefined();
    expect(ravi).not.toHaveProperty("due");
    expect(JSON.stringify(body)).not.toMatch(/₹/);
  });

  it("the picker's helper gives a teacher nothing and the accountant every student", async () => {
    const ids = [f.ravi.id, f.sita.id];
    const today = todayIn("Asia/Kolkata");
    const teacher = await currentFor(f.school.id, teacherId);
    expect((await withSchool(teacher.ctx, (tx) => dueChipsFor(tx, teacher.ctx, teacher, ids, today))).size).toBe(0);
    const accountant = await currentFor(f.school.id, f.accountant.id);
    expect([...(await withSchool(accountant.ctx, (tx) => dueChipsFor(tx, accountant.ctx, accountant, ids, today))).keys()].sort()).toEqual([...ids].sort());
  });
});
