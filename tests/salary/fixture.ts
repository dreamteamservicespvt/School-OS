// A small school for Salary tests: the Attendance test school (five staff,
// a principal, HR, class teachers) plus an accountant, a Vice Principal,
// Finance defaults (Cash in hand, a main bank account, the Salaries head) and
// Salary defaults.
import { withSchool, type SchoolContext } from "@/lib/db";
import { ensureFinanceDefaults } from "@/lib/finance/settings";
import { ensureSalaryDefaults } from "@/lib/salary/settings";
import type { StructureLine } from "@/lib/salary/calc";
import { makeAttendanceSchool, d } from "../attendance/fixture";
import { makeUser } from "../helpers";

export { d };
export const R = (rupees: number) => BigInt(Math.round(rupees * 100));

export const lines = (basic: number, special = 0, extra: StructureLine[] = []): StructureLine[] => [
  { name: "Basic pay", kind: "EARNING", calc: "FIXED", amountPaise: R(basic), systemKey: "basic" },
  ...(special ? [{ name: "Special allowance", kind: "EARNING" as const, calc: "FIXED" as const, amountPaise: R(special) }] : []),
  ...extra,
];

export async function makeSalarySchool(name = "Salary Test School") {
  const f = await makeAttendanceSchool(name);
  const accountant = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["accountant"] }], name: "Accountant Person" });
  const vp = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["vice-principal"] }], name: "Vice Principal" });
  await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => {
    await tx.role.updateMany({ where: { key: { in: ["accountant", "vice-principal"] } }, data: { isEnabled: true } });
    await ensureFinanceDefaults(tx, { schoolId: f.school.id, userId: null });
    await ensureSalaryDefaults(tx, { schoolId: f.school.id, userId: null });
  });
  return { ...f, accountant, vp };
}

export type SalaryFixture = Awaited<ReturnType<typeof makeSalarySchool>>;
export const as = (f: SalaryFixture, userId: string | null): SchoolContext => ({ schoolId: f.school.id, userId });
