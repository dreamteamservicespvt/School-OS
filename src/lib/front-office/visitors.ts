// Visitors (16 §2): register a visitor in under a minute (returning visitors
// are found by phone), make a pass that expires by itself, tell the staff
// member being visited, check out, and the gate log. A pass is In until it
// is checked out or its expiry time passes; then it shows Expired, also when
// its QR is scanned.
import "server-only";

import type { Prisma, VisitorEntry } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { encryptField } from "../crypto";
import { formatNumber, nextNumber } from "../sequences";
import { saveFile, IMAGE_TYPES } from "../files";
import { FrontOfficeProblem } from "./problem";
import { frontOfficeSettings, passExpiryFor } from "./settings";
import { instantOf, clockAt, todayIso } from "./time";
import { mobileDigits, phoneProblem, replyOf, tidyVehicle, vehicleProblem, type ReplyKey, type VisitorStatus } from "./words";

export function visitorStatus(v: Pick<VisitorEntry, "timeOut" | "passExpiresAt">, now = new Date()): VisitorStatus {
  if (v.timeOut) return "Out";
  return v.passExpiresAt.getTime() <= now.getTime() ? "Expired" : "In";
}

/** The filter for each status, worked out in the database. */
export function statusWhere(status: string, now = new Date()): Prisma.VisitorEntryWhereInput {
  if (status === "In") return { timeOut: null, passExpiresAt: { gt: now } };
  if (status === "Expired") return { timeOut: null, passExpiresAt: { lte: now } };
  if (status === "Out") return { timeOut: { not: null } };
  return {};
}

/** Purposes that need a person to meet. */
export const MEET_PURPOSES = ["Meeting", "Interview", "Fee payment"];

export type ReturningVisitor = { name: string; purpose: string | null; meetStaffId: string | null; last: string | null; kind: "visitor" | "parent" };

/** Finds a returning visitor (or a parent of the school) by phone, so the form fills in. */
export async function returningVisitor(tx: Tx, rawPhone: string, timeZone: string): Promise<ReturningVisitor | null> {
  const phone = mobileDigits(rawPhone);
  if (!/^[6-9]\d{9}$/.test(phone)) return null;
  const last = await tx.visitorEntry.findFirst({ where: { phone, archivedAt: null }, orderBy: { timeIn: "desc" } });
  if (last) {
    const met = last.meetStaffId ? await tx.staff.findFirst({ where: { id: last.meetStaffId }, select: { fullName: true } }) : null;
    const d = last.timeIn;
    const day = new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(d);
    return { kind: "visitor", name: last.name, purpose: last.purpose, meetStaffId: last.meetStaffId, last: `${day}${met ? `, met ${met.fullName}` : ""}` };
  }
  const g = await tx.guardian.findFirst({
    where: { phone, archivedAt: null },
    include: { students: { where: { archivedAt: null, student: { archivedAt: null } }, include: { student: { select: { firstName: true, fullName: true } } }, take: 2 } },
  });
  if (!g) return null;
  const kids = g.students.map((s) => s.student.firstName || s.student.fullName).join(" and ");
  return { kind: "parent", name: g.name, purpose: null, meetStaffId: null, last: kids ? `${g.relationship} of ${kids}` : g.relationship };
}

export type RegisterInput = {
  phone: string;
  name: string;
  purpose: string;
  meetStaffId: string | null;
  note: string | null;
  peopleCount: number;
  photo: File | null;
  idProofType: string | null;
  idProofNo: string | null;
  vehicleNo: string | null;
  appointmentId?: string | null;
};

/** Registers a visitor and makes the pass (16 §2, Done when 1, 2 and 9). */
export async function registerVisitor(tx: Tx, ctx: SchoolContext, input: RegisterInput, opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const s = await frontOfficeSettings(tx, ctx);
  const pp = phoneProblem(input.phone);
  if (pp) throw new FrontOfficeProblem(pp, "phone");
  const phone = mobileDigits(input.phone);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new FrontOfficeProblem("Enter the visitor’s name.", "name");
  if (name.length > 120) throw new FrontOfficeProblem("Name can be at most 120 characters.", "name");
  if (!s.visitorPurposes.includes(input.purpose)) throw new FrontOfficeProblem("Choose the purpose from the list.", "purpose");
  let meetName: string | null = null;
  let meetLogin: string | null = null;
  if (input.meetStaffId) {
    const staff = await tx.staff.findFirst({ where: { id: input.meetStaffId, archivedAt: null }, select: { fullName: true, userLoginId: true } });
    if (!staff) throw new FrontOfficeProblem("Choose who they are here to meet from the list.", "meetStaffId");
    meetName = staff.fullName;
    meetLogin = staff.userLoginId;
  } else if (MEET_PURPOSES.includes(input.purpose)) {
    throw new FrontOfficeProblem("Choose who they are here to meet.", "meetStaffId");
  }
  if (input.peopleCount < 1 || input.peopleCount > 50) throw new FrontOfficeProblem("Number of people must be between 1 and 50.", "peopleCount");
  if (s.photoRequired && !input.photo) throw new FrontOfficeProblem("A photo of the visitor is required by school policy. Take the photo.", "photo");
  const idNo = input.idProofNo?.replace(/\s+/g, " ").trim() || null;
  if (s.idProofRequired && (!input.idProofType || !idNo)) throw new FrontOfficeProblem("ID proof is required by school policy. Enter the ID type and number.", "idProofNo");
  if (idNo && !input.idProofType) throw new FrontOfficeProblem("Choose the type of ID proof.", "idProofType");
  if (idNo && (idNo.replace(/[^A-Za-z0-9]/g, "").length < 4 || idNo.length > 30)) throw new FrontOfficeProblem("The ID number looks too short or too long. Check it.", "idProofNo");
  const vp = vehicleProblem(input.vehicleNo);
  if (vp) throw new FrontOfficeProblem(vp, "vehicleNo");
  const vehicleNo = input.vehicleNo?.trim() ? tidyVehicle(input.vehicleNo) : null;

  let appointment: { id: string; status: string } | null = null;
  if (input.appointmentId) {
    appointment = await tx.appointment.findFirst({ where: { id: input.appointmentId, archivedAt: null }, select: { id: true, status: true } });
    if (!appointment) throw new FrontOfficeProblem("That appointment was not found.");
  }

  const photo = input.photo ? await saveFile(tx, ctx, { file: input.photo, purpose: "visitor-photo", allowed: IMAGE_TYPES, maxImageWidth: 480 }) : null;
  const day = todayIso(opts.timeZone, now);
  const passNo = formatNumber("V-", await nextNumber(tx, ctx, "visitor-pass"), 4);
  const passExpiresAt = await passExpiryFor(tx, ctx, s, day, opts.timeZone, now);
  const v = await tx.visitorEntry.create({
    data: {
      schoolId: ctx.schoolId, passNo, visitDate: new Date(`${day}T00:00:00Z`), name, phone, purpose: input.purpose,
      meetStaffId: input.meetStaffId, note: input.note, peopleCount: input.peopleCount, photoFileId: photo?.id ?? null,
      idProofType: idNo ? input.idProofType : null, idProofNo: idNo ? encryptField(idNo) : null, idProofLast4: idNo ? idNo.replace(/[^A-Za-z0-9]/g, "").slice(-4) : null,
      vehicleNo, timeIn: now, passExpiresAt, appointmentId: appointment?.id ?? null, createdById: ctx.userId,
    },
  });
  if (vehicleNo) {
    await tx.gateEntry.create({ data: { schoolId: ctx.schoolId, at: now, direction: "IN", kind: "vehicle", who: `${name} (visitor ${passNo})`, vehicleNo, purpose: input.purpose, visitorEntryId: v.id, recordedById: ctx.userId } });
  }
  if (appointment && appointment.status === "BOOKED") {
    await tx.appointment.update({ where: { id: appointment.id }, data: { status: "ARRIVED", statusAt: now, visitorEntryId: v.id } });
  }
  let told = false;
  if (meetLogin) {
    const n = await notify(tx, ctx, {
      to: meetLogin, type: "visitor-arrived",
      text: `${name} is at the front desk to meet you (${input.purpose.toLowerCase()}${input.peopleCount > 1 ? `, ${input.peopleCount} people` : ""}). Reply: Send in, Wait or Not available.`,
      link: `/front-office/visit/${v.id}`,
    }, now);
    told = Boolean(n);
  }
  await writeAudit(tx, ctx, {
    action: "created", recordType: "Visitor Entry", recordId: v.id,
    after: { passNo, name, phone, purpose: input.purpose, meetStaffId: input.meetStaffId, peopleCount: input.peopleCount, vehicleNo, idProof: idNo ? `${input.idProofType} ••••${v.idProofLast4}` : null, photo: Boolean(photo), expires: passExpiresAt.toISOString() },
  });
  return { visitor: v, meetName, told };
}

/** Checks a visitor out now, or (for a pass that expired) at the time they actually left. */
export async function checkOutVisitor(tx: Tx, ctx: SchoolContext, id: string, opts: { timeZone: string; leftAtMinute?: number | null; now?: Date; atGate?: boolean }) {
  const now = opts.now ?? new Date();
  const v = await tx.visitorEntry.findFirst({ where: { id, archivedAt: null } });
  if (!v) throw new FrontOfficeProblem("This visitor entry was not found.");
  if (v.timeOut) throw new FrontOfficeProblem(`${v.name} was already checked out at ${clockAt(v.timeOut, opts.timeZone)}.`);
  let at = now;
  if (opts.leftAtMinute != null) {
    const day = v.visitDate.toISOString().slice(0, 10);
    at = instantOf(day, opts.leftAtMinute, opts.timeZone);
    if (at.getTime() < v.timeIn.getTime()) throw new FrontOfficeProblem(`The time out is before they came in at ${clockAt(v.timeIn, opts.timeZone)}.`, "timeOut");
    if (at.getTime() > now.getTime() + 60_000) throw new FrontOfficeProblem("The time out cannot be later than now.", "timeOut");
  }
  await tx.visitorEntry.update({ where: { id }, data: { timeOut: at, checkedOutById: ctx.userId } });
  if (opts.atGate || v.vehicleNo) {
    await tx.gateEntry.create({ data: { schoolId: ctx.schoolId, at, direction: "OUT", kind: v.vehicleNo ? "vehicle" : "person", who: `${v.name} (visitor ${v.passNo})`, vehicleNo: v.vehicleNo, purpose: v.purpose, visitorEntryId: v.id, recordedById: ctx.userId } });
  }
  await writeAudit(tx, ctx, { action: "checked-out", recordType: "Visitor Entry", recordId: id, before: { timeOut: null }, after: { timeOut: at.toISOString(), late: visitorStatus(v, now) === "Expired" } });
  return { visitor: v, at };
}

/** Undo a check-out within the undo window: the pass works again until its expiry. */
export async function undoCheckOut(tx: Tx, ctx: SchoolContext, id: string) {
  const v = await tx.visitorEntry.findFirst({ where: { id, archivedAt: null } });
  if (!v || !v.timeOut) throw new FrontOfficeProblem("This visitor is not checked out.");
  await tx.visitorEntry.update({ where: { id }, data: { timeOut: null, checkedOutById: null } });
  await writeAudit(tx, ctx, { action: "check-out-undone", recordType: "Visitor Entry", recordId: id, before: { timeOut: v.timeOut.toISOString() }, after: { timeOut: null } });
}

/** The staff member being visited answers: Send in, Wait or Not available. */
export async function replyToVisitor(tx: Tx, ctx: SchoolContext, id: string, reply: ReplyKey, opts: { asDesk: boolean; now?: Date }) {
  const r = replyOf(reply);
  if (!r) throw new FrontOfficeProblem("Choose Send in, Wait or Not available.");
  const v = await tx.visitorEntry.findFirst({ where: { id, archivedAt: null } });
  if (!v) throw new FrontOfficeProblem("This visit was not found.");
  const staff = v.meetStaffId ? await tx.staff.findFirst({ where: { id: v.meetStaffId }, select: { fullName: true, userLoginId: true } }) : null;
  const isMe = Boolean(staff?.userLoginId && staff.userLoginId === ctx.userId);
  if (!isMe && !opts.asDesk) throw new FrontOfficeProblem("Only the person being visited can answer this.");
  if (v.timeOut) throw new FrontOfficeProblem(`${v.name} has already left.`);
  const now = opts.now ?? new Date();
  await tx.visitorEntry.update({ where: { id }, data: { staffReply: r.key, staffReplyAt: now } });
  await writeAudit(tx, ctx, { action: "visitor-reply", recordType: "Visitor Entry", recordId: id, before: { staffReply: v.staffReply }, after: { staffReply: r.key } });
  if (isMe && v.createdById && v.createdById !== ctx.userId) {
    await notify(tx, ctx, { to: v.createdById, type: "visitor-reply", text: `${staff?.fullName ?? "Staff"}: ${r.label} for ${v.name} (pass ${v.passNo}).`, link: "/front-office" }, now);
  }
  return { visitor: v, reply: r, staffName: staff?.fullName ?? null };
}

export type PassCheck =
  | { kind: "visitor"; id: string; passNo: string; name: string; purpose: string; meet: string | null; status: VisitorStatus; expiresAt: Date; timeOut: Date | null; visitDate: Date; photoFileId: string | null }
  | { kind: "pickup"; id: string; passNo: string; student: string; studentPhotoFileId: string | null; section: string | null; collector: string; relation: string | null; guardianPhotoFileId: string | null; timeOut: Date; issuedBy: string | null; status: string; leftAt: Date | null }
  | { kind: "none"; code: string };

/** What a scanned or typed pass number shows at the gate. */
export async function checkPass(tx: Tx, rawCode: string, now = new Date()): Promise<PassCheck> {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { kind: "none", code: "" };
  if (code.startsWith("V-")) {
    const v = await tx.visitorEntry.findFirst({ where: { passNo: code, archivedAt: null } });
    if (!v) return { kind: "none", code };
    const met = v.meetStaffId ? await tx.staff.findFirst({ where: { id: v.meetStaffId }, select: { fullName: true } }) : null;
    return { kind: "visitor", id: v.id, passNo: v.passNo, name: v.name, purpose: v.purpose, meet: met?.fullName ?? null, status: visitorStatus(v, now), expiresAt: v.passExpiresAt, timeOut: v.timeOut, visitDate: v.visitDate, photoFileId: v.photoFileId };
  }
  const g = await tx.gatePass.findFirst({ where: { passNo: code, archivedAt: null, kind: "PICKUP" } });
  if (!g) return { kind: "none", code };
  const [student, guardian, issuer] = await Promise.all([
    tx.student.findFirst({ where: { id: g.studentId }, select: { fullName: true, photoFileId: true } }),
    g.guardianId ? tx.guardian.findFirst({ where: { id: g.guardianId }, select: { photoFileId: true } }) : null,
    g.issuedById ? tx.userLogin.findUnique({ where: { id: g.issuedById }, select: { displayName: true } }) : null,
  ]);
  return {
    kind: "pickup", id: g.id, passNo: g.passNo, student: student?.fullName ?? "Student", studentPhotoFileId: student?.photoFileId ?? null, section: g.sectionLabel,
    collector: g.collectorName ?? "", relation: g.collectorRelation, guardianPhotoFileId: guardian?.photoFileId ?? null, timeOut: g.timeOut, issuedBy: issuer?.displayName ?? null, status: g.status, leftAt: g.leftAt,
  };
}

export type GateInput = { direction: "IN" | "OUT"; kind: string; who: string; vehicleNo: string | null; purpose: string | null };

/** Records a gate entry or exit with the time now (optional gate log). */
export async function addGateEntry(tx: Tx, ctx: SchoolContext, input: GateInput, now = new Date()) {
  if (!["IN", "OUT"].includes(input.direction)) throw new FrontOfficeProblem("Choose In or Out.", "direction");
  if (!["vehicle", "school-bus", "delivery", "person"].includes(input.kind)) throw new FrontOfficeProblem("Choose what is at the gate.", "kind");
  const who = input.who.trim().replace(/\s+/g, " ");
  if (!who) throw new FrontOfficeProblem(input.kind === "person" ? "Enter the person’s name." : "Who or what is it?", "who");
  if (who.length > 120) throw new FrontOfficeProblem("Keep it to 120 characters.", "who");
  const needVehicle = input.kind !== "person";
  if (needVehicle && !input.vehicleNo?.trim()) throw new FrontOfficeProblem("Enter the vehicle number.", "vehicleNo");
  const vp = vehicleProblem(input.vehicleNo);
  if (vp) throw new FrontOfficeProblem(vp, "vehicleNo");
  const e = await tx.gateEntry.create({
    data: { schoolId: ctx.schoolId, at: now, direction: input.direction, kind: input.kind, who, vehicleNo: input.vehicleNo?.trim() ? tidyVehicle(input.vehicleNo) : null, purpose: input.purpose?.trim() || null, recordedById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Gate Entry", recordId: e.id, after: { direction: e.direction, kind: e.kind, who: e.who, vehicleNo: e.vehicleNo } });
  return e;
}

/** Expired passes not checked out (16 §5 "Visitor never checked out"). */
export function expiredWhere(now = new Date()): Prisma.VisitorEntryWhereInput {
  return { archivedAt: null, timeOut: null, passExpiresAt: { lte: now } };
}

/**
 * The visitor log's search: name, pass number, vehicle number or the staff
 * member met, and the phone number only for people who may see phones (a
 * masked number cannot be searched, so it cannot be guessed digit by digit).
 */
export async function visitorSearch(tx: Tx, rawQ: string, phones: boolean): Promise<Prisma.VisitorEntryWhereInput | null> {
  const q = rawQ.trim().slice(0, 60);
  if (!q) return null;
  const tight = q.replace(/\s+/g, "").toUpperCase();
  const spaced = tight.replace(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/, "$1 $2 $3 $4").replace(/\s+/g, " ");
  const staffHits = await tx.staff.findMany({ where: { fullName: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 20 });
  const or: Prisma.VisitorEntryWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { passNo: { contains: tight, mode: "insensitive" } },
    { vehicleNo: { contains: q, mode: "insensitive" } },
    { vehicleNo: { contains: spaced, mode: "insensitive" } },
  ];
  if (staffHits.length) or.push({ meetStaffId: { in: staffHits.map((s) => s.id) } });
  const digits = q.replace(/\D/g, "");
  if (phones && digits.length >= 4) or.push({ phone: { contains: digits } });
  return { OR: or };
}

/** The visitor log's rows for a day range (and, when the range is today, older passes never closed). */
export function visitorLogWhere(opts: { scope: Prisma.VisitorEntryWhereInput; from: Date; to: Date; withOpenExpired: boolean; status: string; search: Prisma.VisitorEntryWhereInput | null; now?: Date }): Prisma.VisitorEntryWhereInput {
  const now = opts.now ?? new Date();
  const day: Prisma.VisitorEntryWhereInput = opts.withOpenExpired ? { OR: [{ visitDate: { gte: opts.from, lte: opts.to } }, expiredWhere(now)] } : { visitDate: { gte: opts.from, lte: opts.to } };
  return { AND: [{ archivedAt: null }, opts.scope, day, statusWhere(opts.status, now), ...(opts.search ? [opts.search] : [])] };
}
