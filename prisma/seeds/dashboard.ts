// Dashboard demo: My Tasks for the Principal, the School Admin and a few
// staff, with one overdue, one done today and a comment, so every home shows
// real tasks. Due times are set from the day the demo is seeded.
import { withSchool } from "../../src/lib/db";
import type { SeedSchool } from "./types";

const HOUR = 3_600_000;

export async function seedDashboard(school: SeedSchool) {
  const { schoolId, users } = school;
  if (!school.full) return;
  const now = Date.now();
  // Today 17:00 in India (UTC+5:30), and whole days from it.
  const today5pm = new Date(new Date(new Date(now + 5.5 * HOUR).toISOString().slice(0, 10) + "T17:00:00+05:30").getTime());
  const at = (days: number, hour = 17) => new Date(today5pm.getTime() + days * 24 * HOUR + (hour - 17) * HOUR);
  const p = users.principal, a = users.admin, t = users.teacher, acc = users.accountant, lib = users.librarian;
  const tasks: { title: string; to: string | undefined; by: string | undefined; due: Date | null; status?: "TODO" | "IN_PROGRESS" | "DONE"; details?: string }[] = [
    { title: "Review the half-yearly datesheet before it goes to parents", to: p, by: p, due: at(0, 16) },
    { title: "Sign the transfer certificates waiting in the office", to: p, by: a, due: at(-1, 18), details: "Three certificates are ready for signature." },
    { title: "Plan the PTM slots for Saturday", to: p, by: p, due: at(4, 10), status: "IN_PROGRESS" },
    { title: "Call the bus vendor about the new route", to: p, by: p, due: at(0, 11), status: "DONE" },
    { title: "Send the September staff attendance summary", to: a, by: p, due: at(1, 12) },
    { title: "Collect photo consent forms in 5 A", to: t, by: p, due: at(3, 15) },
    { title: "Lesson plan for Chapter 6, Class 5 Mathematics", to: t, by: t, due: at(2, 17) },
    { title: "September fee report for the Principal", to: acc, by: p, due: at(0, 16) },
    { title: "Stock check of the reference section", to: lib, by: a, due: at(6, 13) },
  ];
  await withSchool({ schoolId, userId: null }, async (tx) => {
    if (await tx.task.count()) return;
    for (const x of tasks) {
      if (!x.to || !x.by) continue;
      const status = x.status ?? "TODO";
      const task = await tx.task.create({
        data: { schoolId, title: x.title, details: x.details ?? null, assignedToId: x.to, givenById: x.by, dueAt: x.due, status, doneAt: status === "DONE" ? new Date(now - HOUR) : null, statusAt: new Date(now - HOUR) },
      });
      if (x.status === "IN_PROGRESS") {
        await tx.taskComment.create({ data: { schoolId, taskId: task.id, authorId: x.to, text: "Asked the class teachers for their free hours. Two have replied." } });
      }
    }
  });
}
