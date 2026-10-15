// Outing and leave passes (15 §2 Outing & Visitors; decided 9 October 2026):
// each is a Gate Pass of kind Hostel Outing. The student goes with a named
// person (one of their guardians, or a name and phone typed in), and the pass
// waits in Approvals for the warden of the student's hostel. Nobody approves
// their own request: when the warden records the pass (for example on a
// parent's call) it goes to another warden of the hostel, else to the
// Principal. A pass is marked out only once approved, and back when the
// student returns; a student not back by the return time raises an alert.
// Out and back are written to the Front Office gate log too.
import "server-only";

import type { GatePass, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { checkIndianMobile, formatDate } from "../format";
import { formatNumber, nextNumber } from "../sequences";
import { requestApproval, type Decision } from "../approvals";
import { clockAt, localOf } from "../front-office/time";
import { activeBedOf, studentsInfo } from "./allocation";
import { alertStaff, messageParents } from "./messages";
import { HostelProblem } from "./problem";
import { hostelSettings, wardenLogins } from "./settings";
import { BASE, OUTING_TYPE, lateWords, type OutingType, type PassStatus } from "./words";

/** What a pass shows: LATE when out past the back-by time. */
export function shownStatus(p: Pick<GatePass, "status" | "toAt">, now: Date): PassStatus {
  if (p.status === "OUT" && p.toAt && p.toAt.getTime() < now.getTime()) return "LATE";
  return (["WAITING", "APPROVED", "OUT", "RETURNED", "REJECTED", "CANCELLED"].includes(p.status) ? p.status : "WAITING") as PassStatus;
}

export const minutesLate = (p: Pick<GatePass, "toAt" | "returnedAt">, now: Date) => {
  if (!p.toAt) return 0;
  const end = p.returnedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - p.toAt.getTime()) / 60_000));
};

export type PassInput = {
  studentId: string;
  outingType: OutingType;
  fromAt: Date;
  toAt: Date;
  /** One of the student's guardians, or null with a typed name, relation and phone. */
  guardianId: string | null;
  withName: string | null;
  withRelation: string | null;
  withPhone: string | null;
  reason: string;
};

export async function requestPass(tx: Tx, ctx: SchoolContext, input: PassInput, opts: { now: Date; tz: string; assertHostel: (hostelId: string | null) => void }) {
  const bed = await activeBedOf(tx, input.studentId);
  if (!bed) throw new HostelProblem("Choose a student who lives in the hostel.", "studentId");
  opts.assertHostel(bed.hostel.id);
  if (!bed.allocation.checkedInAt) throw new HostelProblem("This student has not checked in to the hostel yet.", "studentId");
  const info = (await studentsInfo(tx, ctx, [input.studentId])).get(input.studentId)!;
  if (input.toAt.getTime() <= input.fromAt.getTime()) throw new HostelProblem("The back-by time must be after the going-out time.", "toAt");
  if (input.fromAt.getTime() < opts.now.getTime() - 3 * 3600_000) throw new HostelProblem("The going-out time has passed. Choose a time from now.", "fromAt");
  const sameDay = localOf(input.fromAt, opts.tz).slice(0, 10) === localOf(input.toAt, opts.tz).slice(0, 10);
  if (input.outingType === "OUTING" && !sameDay) throw new HostelProblem("An outing is back the same day. Choose Leave for an overnight stay.", "toAt");
  if (input.toAt.getTime() - input.fromAt.getTime() > 31 * 86_400_000) throw new HostelProblem("A pass can be at most 31 days. For longer, check the student out of the hostel.", "toAt");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new HostelProblem("Write the reason, such as Dentist appointment.", "reason");

  // Going with: a named person (decided 9 October 2026).
  let collectorName: string;
  let collectorRelation: string;
  let collectorPhone: string;
  let guardianId: string | null = null;
  if (input.guardianId) {
    const link = await tx.studentGuardian.findFirst({ where: { studentId: input.studentId, guardianId: input.guardianId, archivedAt: null }, include: { guardian: true } });
    if (!link) throw new HostelProblem("Choose one of the student's guardians, or type the person's name.", "guardianId");
    if (link.restriction?.trim()) throw new HostelProblem(`${link.guardian.name} has a restriction on the student's record: ${link.restriction.trim()}. Choose someone else.`, "guardianId");
    guardianId = link.guardianId;
    collectorName = link.guardian.name;
    collectorRelation = link.relationship;
    collectorPhone = link.guardian.phone;
  } else {
    collectorName = (input.withName ?? "").trim().replace(/\s+/g, " ");
    collectorRelation = (input.withRelation ?? "").trim();
    collectorPhone = (input.withPhone ?? "").replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
    if (collectorName.length < 2) throw new HostelProblem("Write the name of the person the student goes with.", "withName");
    if (!collectorRelation) throw new HostelProblem("Choose how they are related to the student.", "withRelation");
    const bad = checkIndianMobile(collectorPhone);
    if (bad) throw new HostelProblem(bad, "withPhone");
  }

  const clash = await tx.gatePass.findFirst({
    where: { kind: "HOSTEL_OUTING", studentId: input.studentId, archivedAt: null, status: { in: ["WAITING", "APPROVED", "OUT"] }, fromAt: { lt: input.toAt }, toAt: { gt: input.fromAt } },
  });
  if (clash) throw new HostelProblem(`${info.first} already has pass ${clash.passNo} for these times.`, "fromAt", { href: `${BASE}/outings?pass=${clash.id}`, label: "Open the pass" });

  const year = localOf(input.fromAt, opts.tz).slice(0, 4);
  const passNo = formatNumber(`GP-${year}-`, await nextNumber(tx, ctx, `gate-pass-${year}`), 4);
  const pass = await tx.gatePass.create({
    data: {
      schoolId: ctx.schoolId, passNo, kind: "HOSTEL_OUTING", studentId: input.studentId, sectionLabel: info.classSection, reason, timeOut: input.fromAt,
      issuedById: ctx.userId, guardianId, collectorName, collectorRelation, collectorPhone, status: "WAITING",
      outingType: input.outingType, fromAt: input.fromAt, toAt: input.toAt, hostelId: bed.hostel.id,
    },
  });
  // The warden of the student's hostel decides; never the person who recorded it.
  const others = (await wardenLogins(tx, bed.hostel.id)).filter((u) => u !== ctx.userId);
  const when = passWhen(pass, opts.tz);
  const approval = await requestApproval(tx, ctx, {
    type: "outing", recordType: "Gate Pass", recordId: pass.id,
    summary: `${OUTING_TYPE[input.outingType].label} pass ${passNo}: ${info.name}${info.classSection ? ` (${info.classSection})` : ""}, ${bed.words}, ${when}, with ${collectorRelation.toLowerCase()} ${collectorName}`,
    reason, firstApproverId: others[0] ?? null,
  });
  await tx.gatePass.update({ where: { id: pass.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Gate Pass", recordId: pass.id, after: { passNo, kind: "Hostel Outing", type: OUTING_TYPE[input.outingType].label, student: info.name, with: `${collectorName} (${collectorRelation})`, from: input.fromAt.toISOString(), to: input.toAt.toISOString(), reason } });
  const approver = approval.currentApproverId
    ? (await tx.userLogin.findUnique({ where: { id: approval.currentApproverId }, select: { displayName: true } }))?.displayName ?? "the warden"
    : approval.currentApproverRole === "principal" ? "the Principal" : approval.currentApproverRole === "hostel-warden" ? "the warden" : "the approver";
  return { pass: { ...pass, approvalId: approval.id }, name: info.name, approver };
}

/** "Sat 10 Oct, 10:00 AM to 6:00 PM" or across days. */
export function passWhen(p: Pick<GatePass, "fromAt" | "toAt">, tz: string) {
  if (!p.fromAt || !p.toAt) return "";
  const d1 = localOf(p.fromAt, tz).slice(0, 10);
  const d2 = localOf(p.toAt, tz).slice(0, 10);
  const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00Z`), "UTC");
  return d1 === d2 ? `${day(d1)}, ${clockAt(p.fromAt, tz)} to ${clockAt(p.toAt, tz)}` : `${day(d1)} ${clockAt(p.fromAt, tz)} to ${day(d2)} ${clockAt(p.toAt, tz)}`;
}

async function passFor(tx: Tx, passId: string) {
  const p = await tx.gatePass.findFirst({ where: { id: passId, kind: "HOSTEL_OUTING", archivedAt: null } });
  if (!p) throw new HostelProblem("This pass was not found.");
  return p;
}

/** Marks a student out on an approved pass (never before approval). */
export async function markOut(tx: Tx, ctx: SchoolContext, passId: string, opts: { now: Date; tz: string; assertHostel: (hostelId: string | null) => void }) {
  const p = await passFor(tx, passId);
  opts.assertHostel(p.hostelId);
  if (p.status === "WAITING") throw new HostelProblem("Outing waiting for approval");
  if (p.status === "REJECTED" || p.status === "CANCELLED") throw new HostelProblem(`Pass ${p.passNo} was ${p.status === "REJECTED" ? "not approved" : "cancelled"}. Make a new pass if needed.`);
  if (p.status !== "APPROVED") throw new HostelProblem(`Pass ${p.passNo} is already used.`);
  if (p.toAt && p.toAt.getTime() < opts.now.getTime()) throw new HostelProblem(`Pass ${p.passNo} ended at ${clockAt(p.toAt, opts.tz)}. Make a new pass.`);
  const student = (await studentsInfo(tx, ctx, [p.studentId])).get(p.studentId)!;
  await tx.gatePass.update({ where: { id: p.id }, data: { status: "OUT", leftAt: opts.now, gateCheckedById: ctx.userId } });
  await tx.gateEntry.create({ data: { schoolId: ctx.schoolId, at: opts.now, direction: "OUT", kind: "person", who: `${student.name}${p.sectionLabel ? `, ${p.sectionLabel}` : ""} (hostel), with ${(p.collectorRelation ?? "guardian").toLowerCase()} ${p.collectorName ?? ""}`.trim(), purpose: `Hostel outing pass ${p.passNo}`, gatePassId: p.id, recordedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "marked-out", recordType: "Gate Pass", recordId: p.id, after: { passNo: p.passNo, student: student.name, at: opts.now.toISOString() } });
  const s = await hostelSettings(tx, ctx);
  let told: string | null = null;
  if (s.messageOnOut) {
    const r = await messageParents(tx, ctx, student, `${student.first} left the hostel at ${clockAt(opts.now, opts.tz)} with ${(p.collectorRelation ?? "").toLowerCase()} ${p.collectorName}. Back by ${p.toAt ? `${clockAt(p.toAt, opts.tz)}${p.outingType === "LEAVE" ? `, ${formatDate(p.toAt, opts.tz)}` : ""}` : "the set time"}.`, { trigger: "Hostel: student went out", key: `out:${p.id}`, source: { type: "Gate Pass", id: p.id } });
    told = r.status === "sent" ? r.how : null;
  }
  return { name: student.name, passNo: p.passNo, told };
}

/** Marks a student back. A late return is noted (the alert has gone already). */
export async function markReturned(tx: Tx, ctx: SchoolContext, passId: string, opts: { now: Date; tz: string; assertHostel: (hostelId: string | null) => void }) {
  const p = await passFor(tx, passId);
  opts.assertHostel(p.hostelId);
  if (p.status !== "OUT") throw new HostelProblem(p.status === "RETURNED" ? "Already marked returned." : "The student was not marked out on this pass.");
  const student = (await studentsInfo(tx, ctx, [p.studentId])).get(p.studentId)!;
  await tx.gatePass.update({ where: { id: p.id }, data: { status: "RETURNED", returnedAt: opts.now, returnedById: ctx.userId } });
  await tx.gateEntry.create({ data: { schoolId: ctx.schoolId, at: opts.now, direction: "IN", kind: "person", who: `${student.name}${p.sectionLabel ? `, ${p.sectionLabel}` : ""} (hostel), back`, purpose: `Hostel outing pass ${p.passNo}`, gatePassId: p.id, recordedById: ctx.userId } });
  const late = minutesLate({ toAt: p.toAt, returnedAt: opts.now }, opts.now);
  await writeAudit(tx, ctx, { action: "returned", recordType: "Gate Pass", recordId: p.id, after: { passNo: p.passNo, student: student.name, at: opts.now.toISOString(), late: late ? lateWords(late) : null } });
  const s = await hostelSettings(tx, ctx);
  if (s.messageOnReturn) await messageParents(tx, ctx, student, `${student.first} is back in the hostel at ${clockAt(opts.now, opts.tz)}.`, { trigger: "Hostel: student back", key: `back:${p.id}`, source: { type: "Gate Pass", id: p.id } });
  return { name: student.name, late };
}

/** Cancels an approved pass that was not used (the student did not go). */
export async function cancelPass(tx: Tx, ctx: SchoolContext, passId: string, reason: string, assertHostelOf: (hostelId: string | null) => void) {
  const p = await passFor(tx, passId);
  assertHostelOf(p.hostelId);
  if (reason.trim().length < 3) throw new HostelProblem("Say why the pass is cancelled.", "reason");
  if (p.status !== "APPROVED") throw new HostelProblem(p.status === "WAITING" ? "This pass is still waiting for approval. The approver can reject it, or the person who asked can withdraw it in Approvals." : "Only an approved pass not used yet can be cancelled.");
  await tx.gatePass.update({ where: { id: p.id }, data: { status: "CANCELLED", decisionNote: reason.trim() } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Gate Pass", recordId: p.id, after: { passNo: p.passNo, reason: reason.trim() } });
  return { passNo: p.passNo };
}

/** What happens to the pass when the outing request is decided in Approvals (src/lib/hostel/handlers.ts). */
export async function decidePass(tx: Tx, ctx: SchoolContext, passId: string, decision: Decision, note: string | null) {
  const p = await tx.gatePass.findFirst({ where: { id: passId, kind: "HOSTEL_OUTING" } });
  if (!p || p.status !== "WAITING") return;
  const status = decision === "approve" ? "APPROVED" : decision === "withdraw" ? "CANCELLED" : "REJECTED";
  await tx.gatePass.update({ where: { id: p.id }, data: { status, decidedById: ctx.userId, decidedAt: new Date(), decisionNote: note?.trim() || null } });
  await writeAudit(tx, ctx, { action: decision === "approve" ? "approved" : decision === "withdraw" ? "withdrawn" : "rejected", recordType: "Gate Pass", recordId: p.id, after: { passNo: p.passNo, status, note } });
}

/** Late returns: passes out past the back-by time (and the alert wait), not alerted yet. Tells the wardens, the Principal and the parents. */
export async function alertLateReturns(tx: Tx, ctx: SchoolContext, now: Date, tz: string) {
  const s = await hostelSettings(tx, ctx);
  if (!s.alertLate) return 0;
  const cutoff = new Date(now.getTime() - s.lateAfterMinutes * 60_000);
  const rows = await tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", status: "OUT", archivedAt: null, lateAlertedAt: null, toAt: { lt: cutoff } }, take: 200 });
  const info = await studentsInfo(tx, ctx, rows.map((r) => r.studentId));
  for (const p of rows) {
    const st = info.get(p.studentId);
    if (!st) continue;
    const words = `${st.first} not returned (due ${clockAt(p.toAt!, tz)})`;
    if (p.hostelId) await alertStaff(tx, ctx, p.hostelId, { text: `${words}. Out with ${p.collectorName}, ${p.collectorPhone ?? ""}.`.replace(/, \.$/, "."), link: `${BASE}/outings?pass=${p.id}`, groupKey: `hostel-late-${p.id}`, principal: true });
    if (s.messageOnLate) await messageParents(tx, ctx, st, `${st.first} was due back at the hostel by ${clockAt(p.toAt!, tz)} and is not back yet. Please call the warden.`, { trigger: "Hostel: late return", key: `late:${p.id}`, source: { type: "Gate Pass", id: p.id } });
    await tx.gatePass.update({ where: { id: p.id }, data: { lateAlertedAt: now } });
    await writeAudit(tx, ctx, { action: "late-alert", recordType: "Gate Pass", recordId: p.id, after: { passNo: p.passNo, student: st.name, due: p.toAt!.toISOString() } });
  }
  return rows.length;
}

/** The where-part for Hostel Outing passes. */
export const outingWhere = (extra: Prisma.GatePassWhereInput = {}): Prisma.GatePassWhereInput => ({ kind: "HOSTEL_OUTING", archivedAt: null, ...extra });
