// Salary Management on the Dashboard: the person's own latest salary slip
// (staff home, from the approved prototype's "Salary slip · Ready to
// download"), and for people with full Salary Management: the month's salary
// still to prepare, approve or pay, staff left out for lack of a structure,
// and advances approved but not paid. Salary amounts never show here; HR's
// View and the Vice Principal get none of these cards.
import "server-only";

import { salaryLevel } from "../../salary/access";
import { addMonths, firstOfMonth, monthName } from "../../salary/words";
import { myStaff, n, plural } from "../common";
import type { Viewer, Widget } from "../types";

const BASE = "/salary-management";
const full = (v: Viewer) => salaryLevel(v.permissions) === "full";
const DONE = ["APPROVED", "PAID", "LOCKED"] as const;
const MONTH = (d: Date) => monthName(d).split(" ")[0];
/** One campus: that campus's payroll and staff only. */
const campus = (v: Viewer) => (v.campusId ? { campusId: v.campusId } : {});

/** "Salary slip · Sep 2026 · Ready to download" on the person's own home. */
const mySlip: Widget<"band"> = {
  id: "salary.my-slip",
  module: "salary-management",
  kind: "band",
  homes: ["staff"],
  async load(c) {
    const me = await myStaff(c);
    if (!me) return null;
    // Own reach: only this person's slips, at the query.
    const slip = await c.tx.payslip.findFirst({ where: { staffId: me.id, run: { status: { in: [...DONE] } } }, orderBy: { month: "desc" }, select: { month: true, status: true } });
    if (!slip) return null;
    const short = `${monthName(slip.month).slice(0, 3)} ${slip.month.getUTCFullYear()}`;
    return { id: "salary.my-slip", label: "Salary slip", big: short, foot: slip.status === "DOWNLOADED" ? "Downloaded" : "Ready to download", href: `${BASE}/slips?mine=1` };
  },
};

/** The month's salary: not opened, not sent, waiting, or approved and not paid. */
const monthToDo: Widget<"attention"> = {
  id: "salary.month",
  module: "salary-management",
  kind: "attention",
  homes: ["accountant", "leader"],
  allowed: full,
  async load(c) {
    const now = firstOfMonth(c.today);
    const prev = addMonths(now, -1);
    const runs = await c.tx.payrollRun.findMany({ where: { month: { in: [prev, now] }, ...campus(c.viewer) }, select: { id: true, month: true, status: true, staffCount: true } });
    const last = runs.filter((r) => r.month.getTime() === prev.getTime());
    const unpaid = last.filter((r) => r.status === "APPROVED");
    if (unpaid.length) {
      return { id: `salary.unpaid:${prev.toISOString().slice(0, 7)}`, tone: "warn", icon: "CreditCard", title: `${MONTH(prev)} salary is approved, not paid`, detail: "Mark it paid when the bank transfer is done; it then goes in the Day Book.", action: "Mark paid", href: `${BASE}/generate?run=${unpaid[0].id}`, value: String(unpaid.length) };
    }
    const lastOpen = last.filter((r) => !DONE.includes(r.status as (typeof DONE)[number]));
    if (lastOpen.length) {
      const waiting = lastOpen.every((r) => r.status === "WAITING");
      return { id: `salary.late:${prev.toISOString().slice(0, 7)}`, tone: "warn", icon: "Clock", title: waiting ? `${MONTH(prev)} salary is waiting for approval` : `${MONTH(prev)} salary is not sent for approval`, detail: waiting ? "Slips are made the moment it is approved." : "Check the rows and send it to the Principal.", action: "Open", href: `${BASE}/generate?run=${lastOpen[0].id}`, value: lastOpen[0].status };
    }
    const cur = runs.filter((r) => r.month.getTime() === now.getTime());
    // From the 20th, the month's salary should be in hand.
    if (c.today.getUTCDate() < 20) return null;
    if (!cur.length) return { id: `salary.open:${now.toISOString().slice(0, 7)}`, tone: "info", icon: "ListChecks", title: `Generate ${MONTH(now)} salary`, detail: "Attendance and leave come in as the month goes.", action: "Salary", href: `${BASE}/generate`, value: "none" };
    const todo = cur.find((r) => r.status === "OPEN" || r.status === "CALCULATED");
    if (!todo) return null;
    return { id: `salary.send:${now.toISOString().slice(0, 7)}`, tone: "info", icon: "ListChecks", title: `${MONTH(now)} salary is ready to check`, detail: `${plural(todo.staffCount, "staff member")} · send it for approval before pay day.`, action: "Open", href: `${BASE}/generate?run=${todo.id}`, value: todo.status };
  },
};

/** Staff with no salary structure are left out of the month's salary. */
const noStructure: Widget<"attention"> = {
  id: "salary.no-structure",
  module: "salary-management",
  kind: "attention",
  homes: ["accountant"],
  allowed: full,
  async load(c) {
    const staff = await c.tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, ...campus(c.viewer) }, select: { id: true, fullName: true } });
    const have = new Set((await c.tx.salaryStructure.findMany({ where: { archivedAt: null }, select: { staffId: true }, distinct: ["staffId"] })).map((s) => s.staffId));
    const missing = staff.filter((s) => !have.has(s.id));
    if (!missing.length) return null;
    return { id: "salary.no-structure", tone: "warn", icon: "FileWarning", title: `${plural(missing.length, "staff member")} ${missing.length === 1 ? "has" : "have"} no salary structure`, detail: `${missing.slice(0, 2).map((s) => s.fullName).join(", ")}${missing.length > 2 ? ` and ${n(missing.length - 2)} more` : ""}: left out of the salary until one is added.`, action: "Add", href: `${BASE}/structures`, value: String(missing.length) };
  },
};

/** Advances the Principal approved that are not paid out yet. */
const advancesToPay: Widget<"attention"> = {
  id: "salary.advances-to-pay",
  module: "salary-management",
  kind: "attention",
  homes: ["accountant"],
  allowed: full,
  async load(c) {
    const onCampus = c.viewer.campusId ? (await c.tx.staff.findMany({ where: { campusId: c.viewer.campusId }, select: { id: true } })).map((s) => s.id) : null;
    const count = await c.tx.salaryAdvance.count({ where: { status: "APPROVED", ...(onCampus ? { staffId: { in: onCampus } } : {}) } });
    if (!count) return null;
    return { id: "salary.advances-to-pay", tone: "info", icon: "CreditCard", title: `${plural(count, "advance")} approved, not paid yet`, detail: "Pay it and mark it paid; it goes in the Day Book on that date.", action: "Advances", href: `${BASE}/advances`, value: String(count) };
  },
};

export const SALARY_WIDGETS: Widget[] = [mySlip, monthToDo, noStructure, advancesToPay] as Widget[];
