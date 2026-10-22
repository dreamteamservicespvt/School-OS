// The one student search (src/lib/students/find.ts) stays quick for a school
// of 2,000 students, also on a shared server whose statistics were worked out
// before this school's students were added. In a file of its own, so the
// statistics count only the schools made here.
import { describe, expect, it, onTestFinished } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { findStudents } from "@/lib/students/find";
import { studentScope } from "@/lib/students/access";
import { studentSchool } from "./fixtures";

describe("speed with 2,000 students", () => {
  it("answers each search quickly (numbers logged; the bound only catches a runaway query)", async () => {
    const first = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna", "Ishaan", "Shaurya", "Ananya", "Diya", "Saanvi", "Aadhya", "Pari", "Lakshmi", "Priya", "Kavya", "Meera", "Sneha"];
    const last = ["Sharma", "Reddy", "Rao", "Kumar", "Naidu", "Patel", "Iyer", "Gupta", "Singh", "Varma"];
    const fill = (big: Awaited<ReturnType<typeof studentSchool>>, n: number) => withSchool({ schoolId: big.school.id, userId: null }, async (tx) => {
      const students = Array.from({ length: n }, (_, i) => ({ id: crypto.randomUUID(), schoolId: big.school.id, campusId: big.school.campus.id, admissionNo: `ADM/2026/${String(i + 1).padStart(4, "0")}`, firstName: first[i % 20], lastName: last[(i * 7) % 10], fullName: `${first[i % 20]} ${last[(i * 7) % 10]}` }));
      await tx.student.createMany({ data: students });
      await tx.enrolment.createMany({ data: students.map((st, i) => ({ schoolId: big.school.id, studentId: st.id, academicYearId: big.yearId, classId: big.c5, sectionId: [big.s5a, big.s5b][i % 2], rollNo: Math.floor(i / 2) + 1 })) });
      const guardians = students.map((st, i) => ({ id: crypto.randomUUID(), schoolId: big.school.id, name: `${first[(i + 7) % 20]} ${st.lastName}`, relationship: "Father", phone: `9${String(100000000 + i * 4111).slice(0, 9)}` }));
      await tx.guardian.createMany({ data: guardians });
      await tx.studentGuardian.createMany({ data: students.map((st, i) => ({ schoolId: big.school.id, studentId: st.id, guardianId: guardians[i].id, relationship: "Father", isPrimary: true })) });
    }, { timeout: 120_000 });
    // Statistics that count another school's students but not this school's,
    // as on a shared server when a new school imports its 2,000 students (too
    // few next to everyone else's for the statistics to be worked out again):
    // the planner then expects almost no rows here, and a query that pairs
    // rows runs away (36 s once). Autovacuum is held off meanwhile so the
    // statistics stay as they were.
    const TABLES = ["student", "guardian", "student_guardian", "enrolment", "section", "school_class"];
    const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
    await fill(await studentSchool(), 2000);
    await owner.$executeRawUnsafe(`ANALYZE ${TABLES.join(", ")}`);
    for (const t of TABLES) await owner.$executeRawUnsafe(`ALTER TABLE "${t}" SET (autovacuum_enabled = false)`);
    onTestFinished(async () => {
      for (const t of TABLES) await owner.$executeRawUnsafe(`ALTER TABLE "${t}" RESET (autovacuum_enabled)`);
      await owner.$disconnect();
    });
    const big = await studentSchool();
    await fill(big, 2000);
    const ctx = { schoolId: big.school.id, userId: big.admin.id };
    const teacher = { schoolId: big.school.id, userId: big.teacherUser.id };
    const teacherScope = await withSchool(teacher, async (tx) => studentScope(tx, await big.who(big.teacherUser.id), big.yearId));
    // A loaded machine slows every query, so each search is weighed against a
    // plain one-row read timed at the same moment. A runaway query is many
    // times slower than that, whatever the load.
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const timed = async (fn: () => Promise<unknown>) => { const t0 = performance.now(); await fn(); return performance.now() - t0; };
    const times: Record<string, number> = {};
    const bounds: Record<string, number> = {};
    for (const [label, q, c, scope] of [
      ["name", "Priya Sharma", ctx, {}], ["typo", "Shrama", ctx, {}], ["initial", "P Sharma", ctx, {}], ["admission", "ADM/2026/0999", ctx, {}],
      ["phone", "4111", ctx, {}], ["roll", "5 A 40", ctx, {}], ["one letter", "a", ctx, {}], ["class teacher", "Kavya", teacher, teacherScope],
    ] as const) {
      const search = () => withSchool(c, (tx) => findStudents(tx, q, { scope, yearId: big.yearId }), { timeout: 120_000 });
      const plain = () => withSchool(c, (tx) => tx.student.findFirst({ where: { admissionNo: "ADM/2026/0001" }, select: { id: true } }));
      const runs: number[] = [];
      const base: number[] = [];
      for (let i = 0; i < 3; i++) {
        runs.push(await timed(search));
        base.push(await timed(plain));
      }
      times[label] = Math.round(median(runs));
      bounds[label] = Math.round(Math.max(5000, 40 * median(base)));
    }
    console.log("student search ms (2,000 students, incl. transaction):", JSON.stringify(times), "bounds:", JSON.stringify(bounds));
    for (const [label, ms] of Object.entries(times)) expect(ms, label).toBeLessThan(bounds[label]);
    const [hit] = await withSchool(ctx, (tx) => findStudents(tx, "ADM/2026/0999", { scope: {}, yearId: big.yearId }));
    expect(hit.admissionNo).toBe("ADM/2026/0999");
    expect(hit.classSection).toBe("Class 5 A");
    // Found by a parent's name: the parent and the class come with each student.
    const byParent = await withSchool(ctx, (tx) => findStudents(tx, "Krishna Sharma", { scope: {}, yearId: big.yearId }));
    expect(byParent.length).toBeGreaterThan(0);
    expect(byParent.every((h) => h.name === "Aarav Sharma" && h.parent === "Krishna Sharma" && h.classSection?.startsWith("Class 5"))).toBe(true);
  }, 600_000);
});
