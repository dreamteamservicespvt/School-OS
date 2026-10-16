// Hostel visitors (15 §2 Outing & Visitors): every hostel visitor comes to
// meet one resident student, who is named on the entry. Only people on that
// student's authorised list (their guardians allowed to pick them up, with no
// restriction) can visit without the warden's approval, and visits outside
// visiting hours need it too. Each visit is a Visitor Entry, so it also shows
// in the Front Office visitor log.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { checkIndianMobile } from "../format";
import { formatNumber, nextNumber } from "../sequences";
import { clockAt, instantOf, localOf, minuteNow } from "../front-office/time";
import { activeBedOf, studentsInfo } from "./allocation";
import { HostelProblem } from "./problem";
import { hostelSettings } from "./settings";
import { WEEKDAYS, minuteWords } from "./words";

/** A student's authorised list: guardians allowed to pick them up, with no restriction. */
export async function authorisedList(tx: Tx, studentId: string) {
  const links = await tx.studentGuardian.findMany({ where: { studentId, archivedAt: null }, include: { guardian: { select: { id: true, name: true, phone: true, photoFileId: true, archivedAt: true } } }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }] });
  return links
    .filter((l) => !l.guardian.archivedAt)
    .map((l) => ({ guardianId: l.guardian.id, name: l.guardian.name, relation: l.relationship, phone: l.guardian.phone, photoFileId: l.guardian.photoFileId, allowed: l.canPickUp && !l.restriction?.trim(), restriction: l.restriction?.trim() || null }));
}

export type VisitorInput = {
  studentId: string;
  guardianId: string | null;
  name: string | null;
  relation: string | null;
  phone: string | null;
  /** The warden let this visitor in (not on the list, or outside visiting hours). */
  wardenApproved: boolean;
  note: string | null;
};

/** "Sun, 10:00 AM to 1:00 PM". */
export function visitingWords(s: { visitingDays: number[]; visitingFromMinute: number; visitingToMinute: number }) {
  const days = s.visitingDays.map((d) => WEEKDAYS[d]?.slice(0, 3)).filter(Boolean).join(", ");
  return `${days}, ${minuteWords(s.visitingFromMinute)} to ${minuteWords(s.visitingToMinute)}`;
}

export async function recordVisitor(tx: Tx, ctx: SchoolContext, input: VisitorInput, opts: { now: Date; tz: string; assertHostel: (hostelId: string | null) => void }) {
  if (!input.studentId) throw new HostelProblem("Choose the student the visitor has come to meet.", "studentId");
  const bed = await activeBedOf(tx, input.studentId);
  if (!bed) throw new HostelProblem("Choose a student who lives in the hostel.", "studentId");
  opts.assertHostel(bed.hostel.id);
  const student = (await studentsInfo(tx, ctx, [input.studentId])).get(input.studentId)!;
  const list = await authorisedList(tx, input.studentId);

  let name: string;
  let relation: string;
  let phone: string;
  let onList = false;
  if (input.guardianId) {
    const g = list.find((x) => x.guardianId === input.guardianId);
    if (!g) throw new HostelProblem("Choose someone from the student's list, or type the visitor's name.", "guardianId");
    name = g.name;
    relation = g.relation;
    phone = g.phone;
    onList = g.allowed;
  } else {
    name = (input.name ?? "").trim().replace(/\s+/g, " ");
    relation = (input.relation ?? "").trim();
    phone = (input.phone ?? "").replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
    if (name.length < 2) throw new HostelProblem("Write the visitor's name.", "name");
    if (name.length > 80) throw new HostelProblem("The name can be at most 80 characters.", "name");
    if (!relation) throw new HostelProblem("Choose how the visitor is related to the student.", "relation");
    const bad = checkIndianMobile(phone);
    if (bad) throw new HostelProblem(bad, "phone");
    const same = list.find((x) => x.phone === phone);
    onList = Boolean(same?.allowed);
  }

  const s = await hostelSettings(tx, ctx);
  const day = localOf(opts.now, opts.tz).slice(0, 10);
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  const minute = minuteNow(opts.tz, opts.now);
  const inHours = s.visitingDays.includes(dow) && minute >= s.visitingFromMinute && minute <= s.visitingToMinute;
  if (!onList && !input.wardenApproved) throw new HostelProblem(`Not on ${student.first}'s authorised list. The warden must approve this visit.`, "wardenApproved");
  if (!inHours && !input.wardenApproved) throw new HostelProblem(`Outside visiting hours (${visitingWords(s)}). The warden must approve this visit.`, "wardenApproved");

  const passNo = formatNumber("V-", await nextNumber(tx, ctx, "visitor-pass"), 4);
  const endOfHours = instantOf(day, s.visitingToMinute, opts.tz);
  const passExpiresAt = endOfHours.getTime() > opts.now.getTime() + 30 * 60_000 ? endOfHours : new Date(opts.now.getTime() + 2 * 3600_000);
  const v = await tx.visitorEntry.create({
    data: {
      schoolId: ctx.schoolId, passNo, visitDate: new Date(`${day}T00:00:00Z`), name, phone, purpose: "Hostel visit",
      note: `Meeting ${student.name}${student.classSection ? ` (${student.classSection})` : ""}, ${bed.hostel.name}, ${bed.words}${input.note ? `. ${input.note}` : ""}`.slice(0, 500),
      timeIn: opts.now, passExpiresAt, createdById: ctx.userId,
      meetStudentId: student.id, hostelId: bed.hostel.id, relation, allowedBy: onList && inHours ? "LIST" : "WARDEN", approvedById: onList && inHours ? null : ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Visitor Entry", recordId: v.id, after: { passNo, visitor: name, relation, meets: student.name, allowedBy: onList ? (inHours ? "On the authorised list" : "On the list, outside visiting hours, warden approved") : "Warden approved" } });
  return { visitor: v, student, onList, inHours };
}

export async function visitorOut(tx: Tx, ctx: SchoolContext, visitorId: string, opts: { now: Date; tz: string; assertHostel: (hostelId: string | null) => void }) {
  const v = await tx.visitorEntry.findFirst({ where: { id: visitorId, archivedAt: null, meetStudentId: { not: null } } });
  if (!v) throw new HostelProblem("This visit was not found.");
  opts.assertHostel(v.hostelId);
  if (v.timeOut) throw new HostelProblem(`${v.name} already left at ${clockAt(v.timeOut, opts.tz)}.`);
  await tx.visitorEntry.update({ where: { id: v.id }, data: { timeOut: opts.now, checkedOutById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "checked-out", recordType: "Visitor Entry", recordId: v.id, after: { passNo: v.passNo, at: opts.now.toISOString() } });
  return { name: v.name };
}
