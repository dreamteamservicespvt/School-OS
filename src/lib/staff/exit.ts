// Staff Exit (09 §2 Staff Exit): resignation, retirement or termination,
// handover of classes and duties, clearance checks, final settlement, and
// the login switched off on the last working day.
import "server-only";

import type { ExitType, StaffStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { requestApproval } from "../approvals";
import { nextNumber, formatNumber } from "../sequences";
import { formatDate } from "../format";
import { currentYear } from "../academic/years";
import { hrPeople } from "./access";
import { loginsForCampus } from "./campus-logins";

export class ExitProblem extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ExitProblem";
  }
}

export const EXIT_TYPES: { value: ExitType; label: string; status: StaffStatus }[] = [
  { value: "RESIGNATION", label: "Resignation", status: "RESIGNED" },
  { value: "RETIREMENT", label: "Retirement", status: "RETIRED" },
  { value: "TERMINATION", label: "Termination", status: "TERMINATED" },
];
export const exitTypeLabel = (t: string) => EXIT_TYPES.find((x) => x.value === t)?.label ?? t;

/** The clearance check list across modules (inferred). Checks for modules a school has switched off are not needed. */
export const CLEARANCE_CHECKS = [
  { key: "assets", label: "Assets and stock items returned", module: "inventory-management" },
  { key: "library", label: "Library books returned", module: "library-management" },
  { key: "hostel", label: "Hostel warden duties handed over", module: "hostel-management" },
  { key: "advances", label: "Advances and loans recovered", module: "salary-management" },
  { key: "id-card", label: "ID card returned", module: null },
  { key: "documents", label: "School documents and keys returned", module: null },
] as const;

export type NewExit = { staffId: string; type: ExitType; receivedOn: Date; lastWorkingDay: Date; reason: string; letterFileId: string | null };

/** Records a resignation, or starts a retirement or termination (with approval). Builds the handover and clearance lists. */
export async function startExit(tx: Tx, ctx: SchoolContext, input: NewExit) {
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!staff) throw new ExitProblem("Choose the staff member who is leaving.", "staffId");
  if (["RESIGNED", "RETIRED", "TERMINATED"].includes(staff.status)) throw new ExitProblem(`${staff.fullName} has already left the school.`, "staffId");
  const open = await tx.exitCase.findFirst({ where: { staffId: staff.id, status: { in: ["WAITING_APPROVAL", "IN_PROGRESS"] } } });
  if (open) throw new ExitProblem(`${staff.fullName} already has an exit in progress. Open it to continue.`, "staffId");
  if (input.lastWorkingDay < input.receivedOn) throw new ExitProblem("Last working day is before the date received. Check the dates.", "lastWorkingDay");
  if (input.reason.trim().length < 3) throw new ExitProblem("Reason is needed.", "reason");

  const needsApproval = input.type !== "RESIGNATION";
  const exit = await tx.exitCase.create({
    data: {
      schoolId: ctx.schoolId, staffId: staff.id, type: input.type, receivedOn: input.receivedOn, lastWorkingDay: input.lastWorkingDay,
      reason: input.reason.trim(), letterFileId: input.letterFileId, status: needsApproval ? "WAITING_APPROVAL" : "IN_PROGRESS", createdById: ctx.userId,
    },
  });
  const handover = await buildHandover(tx, ctx, exit.id, staff.id, staff.campusId);
  const modulesOn = new Set((await tx.schoolModule.findMany({ where: { schoolId: ctx.schoolId, isOn: true } })).map((m) => m.moduleKey));
  const optional = new Set(["inventory-management", "library-management", "hostel-management"]);
  // Hostel: only a staff member who is a hostel warden has duties to hand over.
  const warden = await tx.hostelWarden.count({ where: { staffId: staff.id, archivedAt: null } });
  await tx.clearanceCheck.createMany({
    data: CLEARANCE_CHECKS.map((c) => {
      const off = Boolean(c.module && optional.has(c.module) && !modulesOn.has(c.module));
      const notWarden = c.key === "hostel" && !off && warden === 0;
      return {
        schoolId: ctx.schoolId, exitCaseId: exit.id, key: c.key, label: c.label,
        status: off || notWarden ? "NOT_NEEDED" : "PENDING",
        note: off ? "Module switched off" : notWarden ? "Not a hostel warden" : null,
      };
    }),
  });
  if (needsApproval) {
    const approval = await requestApproval(tx, ctx, {
      type: "staff-exit", recordType: "Exit Case", recordId: exit.id,
      summary: `${exitTypeLabel(input.type)}: ${staff.fullName} (${staff.designation}), last working day ${formatDate(input.lastWorkingDay)}`,
      reason: input.reason.trim(),
      aboutUserIds: [staff.userLoginId],
    });
    await tx.exitCase.update({ where: { id: exit.id }, data: { approvalId: approval.id } });
  }
  await writeAudit(tx, ctx, {
    action: "created", recordType: "Exit Case", recordId: exit.id,
    after: { staff: staff.fullName, type: input.type, lastWorkingDay: input.lastWorkingDay.toISOString().slice(0, 10), handover: handover },
  });
  return exit;
}

/** Classes and subjects (Teacher Allocation) and class-teacher duties to hand over, in the current year of the leaving staff member's campus. */
async function buildHandover(tx: Tx, ctx: SchoolContext, exitCaseId: string, staffId: string, campusId: string) {
  const year = await currentYear(tx, ctx, campusId);
  if (!year) return 0;
  const [allocs, sections] = await Promise.all([
    tx.teacherAllocation.findMany({ where: { staffId, academicYearId: year.id, archivedAt: null }, include: { section: { include: { schoolClass: true } }, subject: true } }),
    tx.section.findMany({ where: { classTeacherId: staffId, academicYearId: year.id, archivedAt: null }, include: { schoolClass: true } }),
  ]);
  const data = [
    ...sections.map((s) => ({ kind: "class-teacher", label: `Class teacher of ${s.schoolClass.name} ${s.name}`, refId: s.id })),
    ...allocs.map((a) => ({ kind: "allocation", label: `${a.section.schoolClass.name} ${a.section.name}: ${a.subject.name}`, refId: a.id })),
  ];
  if (data.length) await tx.handoverItem.createMany({ data: data.map((d) => ({ ...d, schoolId: ctx.schoolId, exitCaseId })) });
  return data.length;
}

/** Hands one item over: re-allocates the class and subject, or the class-teacher duty, to another teacher. */
export async function handOver(tx: Tx, ctx: SchoolContext, itemId: string, toStaffId: string | null) {
  const item = await tx.handoverItem.findFirst({ where: { id: itemId }, include: { exitCase: true } });
  if (!item) throw new ExitProblem("This handover item was not found.");
  if (item.doneAt) throw new ExitProblem("This item is already handed over.");
  if (!["IN_PROGRESS", "WAITING_APPROVAL"].includes(item.exitCase.status)) throw new ExitProblem("This exit is closed.");
  const to = toStaffId ? await tx.staff.findFirst({ where: { id: toStaffId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } }) : null;
  if ((item.kind === "allocation" || item.kind === "class-teacher") && !to) throw new ExitProblem("Choose who takes this over.", "toStaffId");
  if (to && to.id === item.exitCase.staffId) throw new ExitProblem("Choose someone other than the person leaving.", "toStaffId");

  if (item.kind === "allocation" && item.refId) {
    const a = await tx.teacherAllocation.findFirst({ where: { id: item.refId, archivedAt: null } });
    if (a) {
      await tx.teacherAllocation.update({ where: { id: a.id }, data: { toDate: item.exitCase.lastWorkingDay, archivedAt: new Date() } });
      const exists = await tx.teacherAllocation.findFirst({ where: { staffId: to!.id, sectionId: a.sectionId, subjectId: a.subjectId, academicYearId: a.academicYearId, archivedAt: null } });
      if (!exists) {
        await tx.teacherAllocation.create({ data: { schoolId: ctx.schoolId, academicYearId: a.academicYearId, staffId: to!.id, sectionId: a.sectionId, subjectId: a.subjectId, isMain: a.isMain, fromDate: item.exitCase.lastWorkingDay, createdById: ctx.userId } });
      }
      // Periods on the published Time Table move with the class.
      await tx.timetablePeriod.updateMany({ where: { staffId: a.staffId, sectionId: a.sectionId, subjectId: a.subjectId, archivedAt: null, version: { status: { in: ["PUBLISHED", "DRAFT"] } } }, data: { staffId: to!.id } });
      await writeAudit(tx, ctx, { action: "reallocated", recordType: "Teacher Allocation", recordId: a.id, before: { staffId: a.staffId }, after: { staffId: to!.id, reason: "Staff exit handover" } });
    }
  } else if (item.kind === "class-teacher" && item.refId) {
    const s = await tx.section.findFirst({ where: { id: item.refId } });
    if (s) {
      await tx.section.update({ where: { id: s.id }, data: { classTeacherId: to!.id, updatedById: ctx.userId } });
      await writeAudit(tx, ctx, { action: "changed", recordType: "Section", recordId: s.id, before: { classTeacherId: s.classTeacherId }, after: { classTeacherId: to!.id, reason: "Staff exit handover" } });
    }
  }
  await tx.handoverItem.update({ where: { id: item.id }, data: { toStaffId: to?.id ?? null, doneAt: new Date(), doneById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "handed-over", recordType: "Handover Item", recordId: item.id, after: { label: item.label, to: to?.fullName ?? null } });
  if (to?.userLoginId) {
    await notify(tx, ctx, { to: to.userLoginId, type: "handover", text: `You now have: ${item.label}`, link: `/staff-hr-management/${to.id}?tab=classes`, groupKey: "handover", mergedText: (n) => `${n} classes or duties were handed over to you` });
  }
}

export async function addHandoverItem(tx: Tx, ctx: SchoolContext, exitCaseId: string, kind: string, label: string) {
  if (!["asset", "book", "document", "other"].includes(kind)) throw new ExitProblem("Choose what kind of item it is.", "kind");
  if (label.trim().length < 2) throw new ExitProblem("Say what is to be handed over.", "label");
  const exit = await tx.exitCase.findFirst({ where: { id: exitCaseId, status: { in: ["WAITING_APPROVAL", "IN_PROGRESS"] } } });
  if (!exit) throw new ExitProblem("This exit is closed.");
  const item = await tx.handoverItem.create({ data: { schoolId: ctx.schoolId, exitCaseId, kind, label: label.trim() } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Handover Item", recordId: item.id, after: { kind, label } });
  return item;
}

export async function setClearance(tx: Tx, ctx: SchoolContext, checkId: string, status: "PENDING" | "CLEARED" | "NOT_NEEDED", note: string | null) {
  const check = await tx.clearanceCheck.findFirst({ where: { id: checkId }, include: { exitCase: true } });
  if (!check) throw new ExitProblem("This check was not found.");
  if (["COMPLETED", "CANCELLED"].includes(check.exitCase.status)) throw new ExitProblem("This exit is closed.");
  if (check.key === "library" && status === "CLEARED") {
    // Library Management (13 §4): books not returned hold the exit clearance.
    const out = await tx.bookIssue.count({ where: { staffId: check.exitCase.staffId, returnedAt: null } });
    if (out) throw new ExitProblem(`${out} library book${out === 1 ? "" : "s"} not returned. Return ${out === 1 ? "it" : "them"} at the library, or the librarian marks ${out === 1 ? "it" : "them"} lost and charges.`);
  }
  if (check.key === "hostel" && status === "CLEARED") {
    // Hostel Management (15 §6): a warden is replaced in Hostel Settings, Wardens, before leaving.
    const still = await tx.hostelWarden.findMany({ where: { staffId: check.exitCase.staffId, archivedAt: null }, select: { hostelId: true } });
    const names = still.length ? (await tx.hostel.findMany({ where: { id: { in: still.map((w) => w.hostelId) }, archivedAt: null }, select: { name: true } })).map((h) => h.name) : [];
    if (names.length) throw new ExitProblem(`Still a warden of ${names.join(" and ")}. Choose another warden in Hostel Settings first.`);
  }
  if (check.key === "assets" && status === "CLEARED") {
    // Inventory Management (14 §4): assets assigned to the person and returnable items not returned hold the clearance.
    const staffId = check.exitCase.staffId;
    const [assets, lines] = await Promise.all([
      tx.asset.count({ where: { staffId, status: { not: "DISPOSED" }, archivedAt: null } }),
      tx.stockIssueLine.findMany({ where: { issue: { staffId, returnable: true } }, select: { qty: true, returnedQty: true } }),
    ]);
    const items = lines.filter((l) => l.qty > l.returnedQty).length;
    if (assets || items) {
      const parts = [assets ? `${assets} asset${assets === 1 ? "" : "s"} still assigned` : "", items ? `${items} returnable item${items === 1 ? "" : "s"} not returned` : ""].filter(Boolean).join(" and ");
      throw new ExitProblem(`${parts}. The store keeper moves the assets and records the returns first.`);
    }
  }
  await tx.clearanceCheck.update({ where: { id: check.id }, data: { status, note, clearedById: status === "PENDING" ? null : ctx.userId, clearedAt: status === "PENDING" ? null : new Date() } });
  await writeAudit(tx, ctx, { action: "clearance-changed", recordType: "Clearance Check", recordId: check.id, before: { status: check.status }, after: { status, note, label: check.label } });
}

/** Final settlement is sent to Salary Management (last month's pay, leave encashment, recoveries). */
export async function sendSettlement(tx: Tx, ctx: SchoolContext, exitCaseId: string, note: string | null, done = false) {
  const exit = await tx.exitCase.findFirst({ where: { id: exitCaseId }, include: { handover: true } });
  if (!exit || exit.status === "CANCELLED") throw new ExitProblem("This exit was not found.");
  if (exit.status === "WAITING_APPROVAL") throw new ExitProblem("This exit is waiting for approval. The settlement can be sent once it is approved.");
  const status = done ? "DONE" : "SENT";
  await tx.exitCase.update({ where: { id: exit.id }, data: { settlementStatus: status, settlementNote: note } });
  await writeAudit(tx, ctx, { action: done ? "settlement-done" : "settlement-sent", recordType: "Exit Case", recordId: exit.id, before: { settlementStatus: exit.settlementStatus }, after: { settlementStatus: status, note } });
  if (!done) {
    const staff = await tx.staff.findUniqueOrThrow({ where: { id: exit.staffId } });
    const payroll = await tx.schoolAccess.findMany({
      where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: "accountant", isEnabled: true } } } },
      select: { userLoginId: true },
    });
    // One campus: salary staff limited to another campus are not told.
    for (const p of await loginsForCampus(tx, ctx, [...new Set(payroll.map((x) => x.userLoginId))], staff.campusId)) {
      await notify(tx, ctx, { to: p, type: "settlement", text: `Final settlement for ${staff.fullName}: last working day ${formatDate(exit.lastWorkingDay)}.`, link: `/staff-hr-management/exit/${exit.id}` });
    }
  }
}

/**
 * On the last working day the login stops working and the status changes
 * (09 §5, Done when 8). The school's access is closed; the login itself is
 * switched off when it opens no other school. Safe to run twice.
 */
export async function closeLoginsOnLastDay(tx: Tx, ctx: SchoolContext, today: Date) {
  const due = await tx.exitCase.findMany({ where: { schoolId: ctx.schoolId, status: "IN_PROGRESS", loginDisabledAt: null, lastWorkingDay: { lte: today } } });
  for (const exit of due) await finishLastDay(tx, ctx, exit.id);
  return due.length;
}

export async function finishLastDay(tx: Tx, ctx: SchoolContext, exitCaseId: string) {
  const exit = await tx.exitCase.findFirstOrThrow({ where: { id: exitCaseId } });
  if (exit.loginDisabledAt) return;
  const staff = await tx.staff.findUniqueOrThrow({ where: { id: exit.staffId } });
  const status = EXIT_TYPES.find((t) => t.value === exit.type)!.status;
  await tx.staff.update({ where: { id: staff.id }, data: { status, leavingDate: exit.lastWorkingDay, leavingReason: exit.reason, statusSince: exit.lastWorkingDay, statusReason: exitTypeLabel(exit.type) } });
  let loginClosed = false;
  if (staff.userLoginId) {
    await tx.schoolAccess.updateMany({ where: { schoolId: ctx.schoolId, userLoginId: staff.userLoginId, archivedAt: null }, data: { archivedAt: new Date() } });
    const elsewhere = await tx.schoolAccess.count({ where: { userLoginId: staff.userLoginId, archivedAt: null } });
    if (elsewhere === 0) {
      await tx.userLogin.update({ where: { id: staff.userLoginId }, data: { status: "DISABLED", inviteTokenHash: null, inviteExpiresAt: null } });
    }
    await tx.session.updateMany({ where: { userLoginId: staff.userLoginId, revokedAt: null, ...(elsewhere ? { schoolId: ctx.schoolId } : {}) }, data: { revokedAt: new Date(), revokedReason: "Left the school" } });
    loginClosed = true;
  }
  await tx.exitCase.update({ where: { id: exit.id }, data: { loginDisabledAt: new Date() } });
  await writeAudit(tx, ctx, {
    action: "left-school", recordType: "Staff", recordId: staff.id,
    before: { status: staff.status }, after: { status, lastWorkingDay: exit.lastWorkingDay.toISOString().slice(0, 10), loginClosed },
  });
  for (const p of await loginsForCampus(tx, ctx, await hrPeople(tx, ctx), staff.campusId)) {
    await notify(tx, ctx, { to: p, type: "staff-exit", text: `${staff.fullName}'s last working day was ${formatDate(exit.lastWorkingDay)}. Their login is now closed.`, link: `/staff-hr-management/exit/${exit.id}` });
  }
}

export async function onExitDecision(tx: Tx, ctx: SchoolContext, approval: { id: string; recordId: string }, decision: string, note: string | null) {
  const exit = await tx.exitCase.findFirst({ where: { id: approval.recordId, status: "WAITING_APPROVAL" } });
  if (!exit) return;
  const status = decision === "approve" ? "IN_PROGRESS" : "CANCELLED";
  await tx.exitCase.update({ where: { id: exit.id }, data: { status } });
  await writeAudit(tx, ctx, { action: `exit-${decision}`, recordType: "Exit Case", recordId: exit.id, before: { status: exit.status }, after: { status, note } });
}

export async function cancelExit(tx: Tx, ctx: SchoolContext, exitCaseId: string, reason: string) {
  const exit = await tx.exitCase.findFirst({ where: { id: exitCaseId } });
  if (!exit || !["WAITING_APPROVAL", "IN_PROGRESS"].includes(exit.status)) throw new ExitProblem("This exit is already closed.");
  if (exit.loginDisabledAt) throw new ExitProblem("The last working day has passed and the login is closed. To bring the person back, add them again.");
  if (reason.trim().length < 5) throw new ExitProblem("Give a reason of at least 5 characters.", "reason");
  if (exit.approvalId) {
    await tx.approval.updateMany({ where: { id: exit.approvalId, status: { in: ["WAITING", "ESCALATED"] } }, data: { status: "WITHDRAWN", decidedById: ctx.userId, decidedAt: new Date(), decisionReason: reason } });
    await tx.notification.updateMany({ where: { link: `/approvals/${exit.approvalId}`, doneAt: null }, data: { doneAt: new Date() } });
  }
  await tx.exitCase.update({ where: { id: exit.id }, data: { status: "CANCELLED" } });
  await writeAudit(tx, ctx, { action: "exit-cancelled", recordType: "Exit Case", recordId: exit.id, before: { status: exit.status }, after: { status: "CANCELLED", reason } });
}

/** Closes the case once the last day has passed, everything is handed over and cleared. */
export async function completeExit(tx: Tx, ctx: SchoolContext, exitCaseId: string) {
  const exit = await tx.exitCase.findFirst({ where: { id: exitCaseId }, include: { handover: true, clearance: true } });
  if (!exit || exit.status !== "IN_PROGRESS") throw new ExitProblem("Only an exit in progress can be completed.");
  if (!exit.loginDisabledAt) throw new ExitProblem(`The last working day (${formatDate(exit.lastWorkingDay)}) has not come yet.`);
  const open = exit.handover.filter((h) => !h.doneAt).length;
  if (open) throw new ExitProblem(`${open} handover item${open === 1 ? " is" : "s are"} not handed over yet.`);
  const pending = exit.clearance.filter((c) => c.status === "PENDING").length;
  if (pending) throw new ExitProblem(`${pending} clearance check${pending === 1 ? " is" : "s are"} still pending.`);
  await tx.exitCase.update({ where: { id: exit.id }, data: { status: "COMPLETED" } });
  await writeAudit(tx, ctx, { action: "exit-completed", recordType: "Exit Case", recordId: exit.id, before: { status: "IN_PROGRESS" }, after: { status: "COMPLETED" } });
}

/** The experience letter number (EXP/2026/0001), kept on the exit case so a reprint shows the same number. */
export async function issueExperienceLetter(tx: Tx, ctx: SchoolContext, exitCaseId: string) {
  const exit = await tx.exitCase.findFirst({ where: { id: exitCaseId } });
  if (!exit || exit.status === "CANCELLED") throw new ExitProblem("This exit was not found.");
  if (exit.status === "WAITING_APPROVAL") throw new ExitProblem("This exit is waiting for approval. The experience letter can be issued once it is approved.");
  if (exit.experienceLetterNo) return exit.experienceLetterNo;
  const n = await nextNumber(tx, ctx, "experience-letter");
  const no = formatNumber(`EXP/${exit.lastWorkingDay.getUTCFullYear()}/`, n, 4);
  await tx.exitCase.update({ where: { id: exit.id }, data: { experienceLetterNo: no, experienceLetterAt: new Date() } });
  await writeAudit(tx, ctx, { action: "experience-letter-issued", recordType: "Exit Case", recordId: exit.id, after: { number: no } });
  return no;
}

/** Switches a closed login back on, by an admin with a reason (09 §5 recovery). */
export async function reopenLogin(tx: Tx, ctx: SchoolContext, staffId: string, reason: string) {
  if (reason.trim().length < 5) throw new ExitProblem("Give a reason of at least 5 characters.", "reason");
  const staff = await tx.staff.findFirstOrThrow({ where: { id: staffId } });
  if (!staff.userLoginId) throw new ExitProblem(`${staff.fullName} has no login.`);
  const login = await tx.userLogin.findUniqueOrThrow({ where: { id: staff.userLoginId } });
  const access = await tx.schoolAccess.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: login.id }, orderBy: { createdAt: "desc" } });
  if (access?.archivedAt) await tx.schoolAccess.update({ where: { id: access.id }, data: { archivedAt: null } });
  await tx.userLogin.update({ where: { id: login.id }, data: { status: login.passwordHash ? "ACTIVE" : "INVITED" } });
  await writeAudit(tx, ctx, { action: "login-switched-on", recordType: "User Login", recordId: login.id, before: { status: login.status }, after: { status: login.passwordHash ? "ACTIVE" : "INVITED", reason } });
}

export async function switchOffLogin(tx: Tx, ctx: SchoolContext, staffId: string, reason: string) {
  if (reason.trim().length < 5) throw new ExitProblem("Give a reason of at least 5 characters.", "reason");
  const staff = await tx.staff.findFirstOrThrow({ where: { id: staffId } });
  if (!staff.userLoginId) throw new ExitProblem(`${staff.fullName} has no login.`);
  if (staff.userLoginId === ctx.userId) throw new ExitProblem("You cannot switch off your own login.");
  const login = await tx.userLogin.findUniqueOrThrow({ where: { id: staff.userLoginId } });
  await tx.schoolAccess.updateMany({ where: { schoolId: ctx.schoolId, userLoginId: login.id, archivedAt: null }, data: { archivedAt: new Date() } });
  const elsewhere = await tx.schoolAccess.count({ where: { userLoginId: login.id, archivedAt: null } });
  if (elsewhere === 0) await tx.userLogin.update({ where: { id: login.id }, data: { status: "DISABLED" } });
  await tx.session.updateMany({ where: { userLoginId: login.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "Login switched off" } });
  await writeAudit(tx, ctx, { action: "login-switched-off", recordType: "User Login", recordId: login.id, before: { status: login.status }, after: { reason } });
}
