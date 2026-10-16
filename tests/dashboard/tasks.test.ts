// My Tasks and the setup checklist (01-dashboard.md §2, §7, Done when 7).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { addTask, editTask, isOverdue, sendTaskReminders, setTaskStatus, taskAccess, taskReport, taskWhere, TaskProblem } from "@/lib/dashboard/tasks";
import { markStep, setupProgress, setupSteps, SetupProblem, unmarkStep } from "@/lib/dashboard/setup";
import type { Current } from "@/lib/current";
import { academicSchool } from "../academic/fixture";
import { makeUser } from "../helpers";

let f: Awaited<ReturnType<typeof academicSchool>>;
let principal: Current, teacher: Current;
const who = (c: Current) => ({ ctx: c.ctx, access: taskAccess(c) });

beforeAll(async () => {
  f = await academicSchool();
  // The Principal needs a staff record with a login to be given tasks.
  await f.run((tx) => tx.staff.update({ where: { id: f.staff[1].id }, data: { userLoginId: f.principal.id } }));
  [principal, teacher] = await Promise.all([f.currentFor(f.principal.id), f.currentFor(f.teacherUser.id)]);
}, 120_000);

describe("task access", () => {
  it("full Dashboard access is a full task manager; others manage their own tasks", () => {
    expect(taskAccess(principal)).toBe("full");
    expect(taskAccess(teacher)).toBe("own");
  });

  it("only the Principal, School Admin, Vice Principal and Academic Head give tasks to others (owner's rules, 12 Oct)", async () => {
    await f.run((tx) => tx.role.updateMany({ where: { key: { in: ["academic-head", "vice-principal", "hr", "exam-in-charge"] } }, data: { isEnabled: true } }));
    const people = await Promise.all(["academic-head", "vice-principal", "hr", "exam-in-charge"].map(async (key) => {
      const u = await makeUser({ schools: [{ id: f.school.id, roleKeys: [key] }] });
      return [key, await f.currentFor(u.id)] as const;
    }));
    const of = Object.fromEntries(people);
    expect(taskAccess(of["academic-head"])).toBe("full");
    expect(taskAccess(of["vice-principal"])).toBe("full");
    expect(taskAccess(of.hr)).toBe("own");
    expect(taskAccess(of["exam-in-charge"])).toBe("own");
    const head = of["academic-head"];
    const given = await withSchool(head.ctx, (tx) => addTask(tx, who(head), { title: "Check the Class 5 syllabus", assignedToId: f.teacherUser.id, dueAt: null, details: null, remind: false }));
    expect(given.assignedToId).toBe(f.teacherUser.id);
    const hr = of.hr;
    await expect(withSchool(hr.ctx, (tx) => addTask(tx, who(hr), { title: "Collect forms", assignedToId: f.teacherUser.id, dueAt: null, details: null, remind: false })))
      .rejects.toThrow(/only to yourself/);
  });

  it("a teacher can give tasks only to themselves", async () => {
    await expect(withSchool(teacher.ctx, (tx) => addTask(tx, who(teacher), { title: "Mark the register", assignedToId: f.principal.id, dueAt: null, details: null, remind: false })))
      .rejects.toThrow(/only to yourself/);
    const own = await withSchool(teacher.ctx, (tx) => addTask(tx, who(teacher), { title: "Mark the register", assignedToId: null, dueAt: null, details: null, remind: true }));
    expect(own.assignedToId).toBe(f.teacherUser.id);
    expect(own.remind).toBe(false); // no due date, so no reminder
  });

  it("asks before saving a due date in the past", async () => {
    const past = new Date(Date.now() - 86_400_000);
    await expect(withSchool(principal.ctx, (tx) => addTask(tx, who(principal), { title: "Late one", assignedToId: f.teacherUser.id, dueAt: past, details: null, remind: true })))
      .rejects.toBeInstanceOf(TaskProblem);
    const saved = await withSchool(principal.ctx, (tx) => addTask(tx, who(principal), { title: "Late one", assignedToId: f.teacherUser.id, dueAt: past, details: null, remind: true, confirmPast: true }));
    expect(isOverdue(saved)).toBe(true);
  });

  it("the Principal gives a task; the teacher sees it, changes its status, and cannot edit or see others' tasks", async () => {
    const t = await withSchool(principal.ctx, (tx) => addTask(tx, who(principal), { title: "Collect consent forms", assignedToId: f.teacherUser.id, dueAt: new Date(Date.now() + 3 * 86_400_000), details: null, remind: true }));
    const note = await withSchool(teacher.ctx, (tx) => tx.notification.findFirst({ where: { userLoginId: f.teacherUser.id, type: "task-assigned" } }));
    expect(note?.text).toMatch(/Collect consent forms|new tasks given to you/);

    const before = await withSchool(teacher.ctx, (tx) => setTaskStatus(tx, who(teacher), t.id, "DONE"));
    expect(before).toBe("TODO");
    await expect(withSchool(teacher.ctx, (tx) => editTask(tx, who(teacher), t.id, { title: "Changed", assignedToId: null, dueAt: null, details: null, remind: false })))
      .rejects.toThrow(/Only the person who gave/);
    // Undo puts the status back.
    await withSchool(teacher.ctx, (tx) => setTaskStatus(tx, who(teacher), t.id, before));

    const secret = await withSchool(principal.ctx, (tx) => addTask(tx, who(principal), { title: "Principal only", assignedToId: null, dueAt: null, details: null, remind: false }));
    const seen = await withSchool(teacher.ctx, (tx) => tx.task.findMany({ where: taskWhere(who(teacher), "all") }));
    expect(seen.map((x) => x.id)).not.toContain(secret.id);
    await expect(withSchool(teacher.ctx, (tx) => setTaskStatus(tx, who(teacher), secret.id, "DONE"))).rejects.toThrow(/not found/);
  });

  it("sends each reminder once: the day before and on the due morning", async () => {
    const now = new Date("2026-10-12T04:00:00Z"); // 9:30 AM India
    const due = new Date("2026-10-13T06:30:00Z"); // tomorrow 12:00 PM India
    const t = await withSchool(principal.ctx, (tx) => addTask(tx, who(principal), { title: "Reminder test", assignedToId: f.teacherUser.id, dueAt: due, details: null, remind: true }, { now }));
    // Too early for this task (other tests' tasks may fall due near the real date, so check this one).
    await withSchool(principal.ctx, (tx) => sendTaskReminders(tx, principal.ctx, new Date("2026-10-12T03:00:00Z")));
    expect((await withSchool(principal.ctx, (tx) => tx.task.findUniqueOrThrow({ where: { id: t.id } }))).remindersSent).toEqual([]);
    await withSchool(principal.ctx, (tx) => sendTaskReminders(tx, principal.ctx, new Date("2026-10-12T07:00:00Z")));
    await withSchool(principal.ctx, (tx) => sendTaskReminders(tx, principal.ctx, new Date("2026-10-12T08:00:00Z")));
    let row = await withSchool(principal.ctx, (tx) => tx.task.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row.remindersSent).toEqual(["day-before"]);
    await withSchool(principal.ctx, (tx) => sendTaskReminders(tx, principal.ctx, new Date("2026-10-13T03:00:00Z"))); // 8:30 AM on the day
    row = await withSchool(principal.ctx, (tx) => tx.task.findUniqueOrThrow({ where: { id: t.id } }));
    expect(row.remindersSent).toEqual(["day-before", "due-morning"]);
    const notes = await withSchool(teacher.ctx, (tx) => tx.notification.count({ where: { userLoginId: f.teacherUser.id, type: "task-due" } }));
    expect(notes).toBeGreaterThanOrEqual(1);
  });

  it("reports tasks by person with overdue counts", async () => {
    const r = await withSchool(principal.ctx, (tx) => taskReport(tx, taskWhere(who(principal), "all")));
    const t = r.people.find((p) => p.id === f.teacherUser.id);
    expect(t?.overdue).toBeGreaterThanOrEqual(1);
    expect(r.totals.total).toBeGreaterThanOrEqual(4);
  });
});

describe("setup checklist", () => {
  it("works out steps from the records, and only optional steps can be skipped", async () => {
    const steps = await f.run((tx) => setupSteps(tx, principal.ctx, principal));
    expect(steps.find((s) => s.key === "classes")?.done).toBe(true);
    // Fee Management is built: the step shows, and is not done until a fee structure is published.
    expect(steps.find((s) => s.key === "fees")?.done).toBe(false);
    await expect(f.run((tx) => markStep(tx, principal.ctx, "messaging", "SKIPPED"))).rejects.toBeInstanceOf(SetupProblem);
    const before = setupProgress(steps).done;
    const row = await f.run((tx) => markStep(tx, principal.ctx, "messaging", "DONE"));
    expect(setupProgress(await f.run((tx) => setupSteps(tx, principal.ctx, principal))).done).toBe(before + 1);
    await f.run((tx) => unmarkStep(tx, principal.ctx, row.id));
    expect(setupProgress(await f.run((tx) => setupSteps(tx, principal.ctx, principal))).done).toBe(before);
  });
});
