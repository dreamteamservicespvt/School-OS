"use server";

// Every change made on the Front Office pages. Each one checks the person's
// role on the server (requireAction and the Front Office level), runs inside
// the school's walls and writes the audit log in the same transaction.

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/forms";
import { formValues } from "@/lib/forms";
import { DuplicateProblem, type Match } from "@/lib/admission/enquiries";
import { foAction, foT, inFrontOffice, need, problemState, str, id, optionalId, maybe, file, UUID_RE } from "@/lib/front-office/act";
import { FrontOfficeProblem } from "@/lib/front-office/problem";
import { addGateEntry, checkOutVisitor, registerVisitor, remindDeskAboutPass, replyToVisitor, returningVisitor, type ReturningVisitor } from "@/lib/front-office/visitors";
import { loginsWithRole } from "@/lib/front-office/people";
import { letOut, refusedPickup, releaseStudent, sendPickupCode } from "@/lib/front-office/pickup";
import { findStudents } from "@/lib/students/find";
import { inCampus } from "@/lib/campus";
import { closeCall, deskEnquiry, logCall, recognisePhone, setCallFollowUp, type KnownPhone } from "@/lib/front-office/calls";
import { addNote, addWalkIn, clearNote, closeWalkIn, editNote } from "@/lib/front-office/desk";
import { arriveAppointment, bookAppointment, dayPlan, remindAppointment, setAppointmentStatus } from "@/lib/front-office/appointments";
import { handOver, recordPostal } from "@/lib/front-office/postal";
import { addToList, isListKey, removeFromList, saveSettings } from "@/lib/front-office/settings";
import { messageVisitor, sentWords } from "@/lib/front-office/notify";
import { clockAt, instantOf } from "@/lib/front-office/time";
import { clockOf, FRONT_OFFICE_FEATURES, isNoPhotoCheck, minutesOf, type ReplyKey } from "@/lib/front-office/words";
import { withSchool } from "@/lib/db";
import { requireCurrent } from "@/lib/current";
import { flash } from "@/lib/flash";
import { codeNotSentWords } from "@/lib/dev-codes";
import { revalidatePath } from "next/cache";

type S = FormState<unknown>;
const BASE = "/front-office";

const hhmm = (fd: FormData, key: string, label: string) => {
  const v = str(fd, key);
  if (!v) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new FrontOfficeProblem(`Enter the ${label} like 10:30.`, key);
  return minutesOf(v);
};
const people = (fd: FormData) => {
  const v = str(fd, "peopleCount");
  return v === "4+" ? 4 : Math.max(1, Math.min(50, Number(v) || 1));
};
const back = (fd: FormData, fallback: string) => {
  const b = str(fd, "back");
  return b.startsWith(BASE) ? b : fallback;
};

/* ---------- Visitors ---------- */

export async function lookupVisitor(phone: string): Promise<ReturningVisitor | null> {
  try {
    return await inFrontOffice("create", async (w) => (w.can.register ? returningVisitor(w.tx, phone, w.tz) : null));
  } catch {
    return null;
  }
}

export async function registerVisitorAction(_: S, fd: FormData): Promise<S> {
  const r = await foAction("create", fd, async (w) => {
    need(w.can.register, "register visitors");
    const res = await registerVisitor(w.tx, w.ctx, {
      phone: str(fd, "phone"), name: str(fd, "name"), purpose: str(fd, "purpose"), meetStaffId: optionalId(fd, "meetStaffId"),
      note: maybe(fd, "note", "Note", 200), peopleCount: people(fd), photo: file(fd, "photo"),
      idProofType: str(fd, "idProofType") || null, idProofNo: str(fd, "idProofNo") || null, vehicleNo: str(fd, "vehicleNo") || null,
      appointmentId: optionalId(fd, "appointmentId"), again: str(fd, "again") === "on",
    }, { timeZone: w.tz });
    return { ...res, enquiry: res.visitor.purpose === "Admission enquiry" && w.can.desk };
  }, (r, t) => (r.meetName && r.told ? t("{name} registered · pass {pass}. {staff} told on the app.", { name: r.visitor.name, pass: r.visitor.passNo, staff: r.meetName }) : t("{name} registered · pass {pass}", { name: r.visitor.name, pass: r.visitor.passNo })));
  if (!r?.ok || !r.data) return r as S;
  const d = r.data as { visitor: { id: string }; enquiry: boolean };
  const from = back(fd, `${BASE}/visitors`);
  const sep = from.includes("?") ? "&" : "?";
  // Replace, not push: Back from the pass goes to the list, never to an empty "New visitor" form
  // that looks as if the visitor was not saved (layman loop 3: Hari registered twice).
  redirect(d.enquiry ? `${BASE}/enquiries?do=enquiry&visitor=${d.visitor.id}` : `${from}${sep}pass=${d.visitor.id}`, "replace" as Parameters<typeof redirect>[1]);
}

export async function checkOutAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.checkOut, "check visitors out");
    const r = await checkOutVisitor(w.tx, w.ctx, id(fd, "visitorId", "visitor"), { timeZone: w.tz, leftAtMinute: hhmm(fd, "timeOut", "time out"), atGate: w.v.level === "gate" });
    return { ...r, words: clockAt(r.at, w.tz) };
  }, (r, t) => ({ message: t("{name} checked out at {time}. Pass {pass} no longer works.", { name: r.visitor.name, time: r.words, pass: r.visitor.passNo }), undo: { kind: "fo-checkout", id: r.visitor.id } }));
}

/** Principal, School Admin, Vice Principal: remind the desk to close an expired pass (they do not do desk work themselves). */
export async function remindDeskAction(_: S, fd: FormData): Promise<S> {
  return foAction("view", fd, async (w) => {
    need(w.can.remind, "remind the desk");
    return remindDeskAboutPass(w.tx, w.ctx, id(fd, "visitorId", "visitor"), await loginsWithRole(w.tx, w.ctx, "receptionist"), { timeZone: w.tz });
  }, (r, t) => t("Reminder sent to the front desk: close pass {pass} with the right time.", { pass: r.visitor.passNo }));
}

export async function sendPassAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.register, "send visitor passes");
    const v = await w.tx.visitorEntry.findFirst({ where: { id: id(fd, "visitorId", "visitor"), archivedAt: null } });
    if (!v) throw new FrontOfficeProblem("This visitor entry was not found.");
    if (v.timeOut || v.passExpiresAt <= new Date()) throw new FrontOfficeProblem(`Pass ${v.passNo} no longer works. Register the visitor again.`);
    const school = await w.tx.school.findUnique({ where: { id: w.ctx.schoolId }, select: { name: true } });
    const r = await messageVisitor(w.tx, w.ctx, {
      to: { name: v.name, phone: v.phone }, trigger: "Visitor pass",
      text: `${school?.name ?? "School"} visitor pass ${v.passNo} for ${v.name}. Show this at the gate. Valid until ${clockAt(v.passExpiresAt, w.tz)} today.`,
      about: { recordType: "Visitor Entry", recordId: v.id },
    });
    if (r.status !== "queued") throw new FrontOfficeProblem(`The pass was not sent: ${r.note ?? "messages are not set up"}. Print it instead.`);
    return { v, how: sentWords(r) };
  }, (r, t) => t("Pass {pass} sent {how}", { pass: r.v.passNo, how: t.any(r.how ?? "") }));
}

export async function replyAction(_: S, fd: FormData): Promise<S> {
  try {
    const current = await requireCurrent();
    const visitId = id(fd, "visitorId", "visit");
    const reply = str(fd, "reply") as ReplyKey;
    const r = await withSchool(current.ctx, (tx) => replyToVisitor(tx, current.ctx, visitId, reply, { asDesk: false }));
    const t = foT(current);
    await flash({ message: t("{reply}: the front desk is told about {name}.", { reply: t(r.reply.label), name: r.visitor.name }) });
    revalidatePath("/", "layout");
    return { ok: true, message: "Sent." };
  } catch (e) {
    return problemState(e, fd) as S;
  }
}

export async function gateEntryAction(_: S, fd: FormData): Promise<S> {
  return foAction("create", fd, async (w) => {
    need(w.can.gateWork, "record gate entries");
    return addGateEntry(w.tx, w.ctx, { direction: str(fd, "direction") as "IN" | "OUT", kind: str(fd, "kind"), who: str(fd, "who"), vehicleNo: str(fd, "vehicleNo") || null, purpose: maybe(fd, "purpose", "Purpose", 120) });
  }, (e, t) => `${e.direction === "IN" ? t("Gate in recorded: {who}", { who: e.who }) : t("Gate out recorded: {who}", { who: e.who })}${e.vehicleNo ? ` · ${e.vehicleNo}` : ""}`);
}

/* ---------- Pickup ---------- */

export async function sendCodeAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.release, "release students");
    return sendPickupCode(w.tx, w.ctx, id(fd, "studentId", "student"), id(fd, "guardianId", "person collecting"));
  }, (r, t) => ({ message: r.testMode ? codeNotSentWords({ to: r.to, channel: r.channel, inLog: r.inLog }) : t("Code sent to {name}. Ask them to read out the 4 digits.", { name: r.to }), tone: "info" }));
}

export async function releaseAction(_: S, fd: FormData): Promise<S> {
  const r = await foAction("create", fd, async (w) => {
    need(w.can.release, "release students");
    return releaseStudent(w.tx, w.ctx, {
      studentId: id(fd, "studentId", "student"), guardianId: id(fd, "guardianId", "person collecting"), photoMatch: str(fd, "photoMatch") === "on",
      otherCheck: ((c) => (isNoPhotoCheck(c) ? c : null))(str(fd, "otherCheck")), code: str(fd, "code") || null, reason: str(fd, "reason"), otherReason: str(fd, "otherReason") || null, minute: hhmm(fd, "time", "time"),
    }, { timeZone: w.tz, codeCheck: (await w.tx.frontOfficeSetting.findUnique({ where: { schoolId: w.ctx.schoolId } }))?.pickupCodeCheck ?? false });
  }, (r, t) => r.classTeacher ? t("{student} released to {name}. {teacher} told.", { student: r.student.first, name: r.person.name, teacher: r.classTeacher }) : t("{student} released to {name}.", { student: r.student.first, name: r.person.name }));
  if (!r?.ok || !r.data) return r as S;
  const d = r.data as { pass: { id: string }; student: { id: string } };
  redirect(`${BASE}/pickup?student=${d.student.id}&gp=${d.pass.id}`, "replace" as Parameters<typeof redirect>[1]);
}

export async function letOutAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.gateWork, "let students out at the gate");
    return letOut(w.tx, w.ctx, id(fd, "gatePassId", "gate pass"), { timeZone: w.tz });
  }, (r, t) => t("{student} left with {name}. Gate log updated.", { student: r.student, name: r.pass.collectorName ?? "" }));
}

export async function sendGatePassAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.release, "send gate passes");
    const g = await w.tx.gatePass.findFirst({ where: { id: id(fd, "gatePassId", "gate pass"), kind: "PICKUP", archivedAt: null } });
    if (!g) throw new FrontOfficeProblem("This gate pass was not found.");
    if (g.status === "LEFT") throw new FrontOfficeProblem(`Gate pass ${g.passNo} was already used at the gate.`);
    const guardian = g.guardianId ? await w.tx.guardian.findFirst({ where: { id: g.guardianId }, select: { name: true, phone: true } }) : null;
    if (!guardian?.phone) throw new FrontOfficeProblem("There is no mobile number for this guardian. Print the pass instead.");
    const student = await w.tx.student.findFirst({ where: { id: g.studentId }, select: { firstName: true } });
    const r = await messageVisitor(w.tx, w.ctx, {
      to: { name: guardian.name, phone: guardian.phone }, trigger: "Pickup gate pass",
      text: `Gate pass ${g.passNo}: ${student?.firstName ?? "Your child"} leaves with ${guardian.name} at ${clockAt(g.timeOut, w.tz)}. Show this number at the gate.`,
      about: { recordType: "Gate Pass", recordId: g.id },
    });
    if (r.status !== "queued") throw new FrontOfficeProblem(`The pass was not sent: ${r.note ?? "messages are not set up"}. Print it instead.`);
    return { g, to: guardian.name, how: sentWords(r) };
  }, (r, t) => t("Gate pass {pass} sent to {name} {how}", { pass: r.g.passNo, name: r.to, how: t.any(r.how ?? "") }));
}

export async function refusedAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.release || w.can.gateWork, "record this");
    return refusedPickup(w.tx, w.ctx, id(fd, "studentId", "student"), str(fd, "who"), { timeZone: w.tz });
  }, (r) => (r.told ? `${r.classTeacher} told. ${r.student.first} stays in class.` : `Kept with ${r.student.first}’s record. ${r.student.first} stays in class.`));
}

/* ---------- Enquiries & calls ---------- */

export async function lookupPhone(phone: string): Promise<KnownPhone | null> {
  try {
    return await inFrontOffice("create", async (w) => (w.can.desk ? recognisePhone(w.tx, w.ctx, phone) : null));
  } catch {
    return null;
  }
}

type DupState = FormState<{ matches?: Match[] }>;

export async function enquiryAction(_: DupState, fd: FormData): Promise<DupState> {
  try {
    const r = await foAction("create", fd, async (w) => {
      need(w.can.desk, "add enquiries");
      return deskEnquiry(w.tx, w.ctx, w.current, {
        childName: str(fd, "childName"), parentName: str(fd, "parentName"), phone: str(fd, "phone"), classId: optionalId(fd, "classId"),
        source: str(fd, "source") === "phone" ? "phone" : "walk-in", note: maybe(fd, "note", "Note", 500),
      }, { timeZone: w.tz, force: str(fd, "force") === "on", visitorEntryId: optionalId(fd, "visitorId") });
    }, (r, t) => ({ message: (r.owner ? t("Enquiry {no} sent to Admissions. Owner: {name}.", { no: r.enquiry.enquiryNo ?? "", name: r.owner }) : t("Enquiry {no} sent to Admissions.", { no: r.enquiry.enquiryNo ?? "" })).replace("  ", " "), link: { href: `/admission-management/enquiries/${r.enquiry.id}`, label: "Open in Admissions" } }));
    return r as DupState;
  } catch (e) {
    if (e instanceof DuplicateProblem) return { ok: false, message: e.message, errors: { phone: e.message }, values: formValues(fd), data: { matches: e.matches } };
    return problemState(e, fd) as DupState;
  }
}

function followUpOf(fd: FormData, tz: string) {
  if (str(fd, "followUp") !== "on") return null;
  const day = str(fd, "followDate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new FrontOfficeProblem("Choose the follow-up date.", "followDate");
  const minute = hhmm(fd, "followTime", "follow-up time");
  if (minute == null) throw new FrontOfficeProblem("Choose the follow-up time.", "followTime");
  const loginId = str(fd, "followWho");
  if (!UUID_RE.test(loginId)) throw new FrontOfficeProblem("Choose who follows up.", "followWho");
  return { at: instantOf(day, minute, tz), loginId };
}

async function checkLogin(w: { tx: import("@/lib/db").Tx }, loginId: string) {
  const staff = await w.tx.staff.findFirst({ where: { userLoginId: loginId, archivedAt: null }, select: { id: true } });
  if (!staff) throw new FrontOfficeProblem("Choose who follows up from the list.", "followWho");
}

export async function logCallAction(_: DupState, fd: FormData): Promise<DupState> {
  try {
    return await foAction("create", fd, async (w) => {
      need(w.can.desk, "log calls");
      const followUp = followUpOf(fd, w.tz);
      if (followUp) await checkLogin(w, followUp.loginId);
      return logCall(w.tx, w.ctx, w.current, {
        direction: str(fd, "direction") === "OUT" ? "OUT" : "IN", phone: str(fd, "phone"), name: str(fd, "name"), purpose: str(fd, "purpose"),
        note: maybe(fd, "note", "Note", 1000), childName: str(fd, "childName") || null, classId: optionalId(fd, "classId"), followUp,
      }, { timeZone: w.tz, force: str(fd, "force") === "on" });
    }, (r, t) => r.enquiryNo ? { message: r.owner ? t("Call saved. Enquiry {no} made in the same step. Owner: {name}.", { no: r.enquiryNo, name: r.owner }) : t("Call saved. Enquiry {no} made in the same step.", { no: r.enquiryNo }) }
      : r.queryNo ? { message: t("Call saved. Sent to Communication, Feedback & Queries as {no}.", { no: r.queryNo }) }
        : r.call.followUpAt ? t("Call saved with a follow-up reminder.") : t("Call added to the call log.")) as DupState;
  } catch (e) {
    if (e instanceof DuplicateProblem) return { ok: false, message: e.message, errors: { phone: e.message }, values: formValues(fd), data: { matches: e.matches } };
    return problemState(e, fd) as DupState;
  }
}

export async function callFollowUpAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.desk, "set follow-ups");
    fd.set("followUp", "on");
    const f = followUpOf(fd, w.tz)!;
    await checkLogin(w, f.loginId);
    return setCallFollowUp(w.tx, w.ctx, id(fd, "callId", "call"), f, { timeZone: w.tz });
  }, (c, t) => t("Follow-up reminder set to call {name} back.", { name: c.name }));
}

export async function closeCallAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.desk, "close calls");
    return closeCall(w.tx, w.ctx, id(fd, "callId", "call"));
  }, (c, t) => t("Call with {name} marked closed.", { name: c.name }));
}

/* ---------- Desk: walk-in requests and notes ---------- */

export async function searchFrom(q: string) {
  try {
    return await inFrontOffice("create", async (w) => {
      if (!w.can.desk) return [];
      const t = q.trim();
      if (t.length < 3) return [];
      // The one student search (student or parent name, one letter wrong allowed, phone, admission number),
      // then each student's parents: the parent who matched first.
      const hits = await findStudents(w.tx, t, { scope: inCampus(w.current), yearId: null, statuses: ["ACTIVE"], take: 6 });
      const links = await w.tx.studentGuardian.findMany({
        where: { archivedAt: null, studentId: { in: hits.map((h) => h.id) }, guardian: { archivedAt: null } },
        select: { studentId: true, relationship: true, isPrimary: true, guardian: { select: { id: true, name: true } } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      });
      const rows = hits.flatMap((h) => links
        .filter((l) => l.studentId === h.id)
        .sort((a, b) => Number(b.guardian.name === h.parent) - Number(a.guardian.name === h.parent))
        .map((l) => ({ ...l, student: h })));
      return rows.slice(0, 6).map((r) => ({ guardianId: r.guardian.id, studentId: r.student.id, label: `${r.guardian.name} (${r.relationship.toLowerCase()} of ${r.student.name})`, student: r.student.name, admissionNo: r.student.admissionNo }));
    });
  } catch {
    return [];
  }
}

export async function walkInAction(_: S, fd: FormData): Promise<S> {
  return foAction("create", fd, async (w) => {
    need(w.can.desk, "record walk-in requests");
    return addWalkIn(w.tx, w.ctx, {
      fromName: str(fd, "fromName"), fromPhone: str(fd, "fromPhone") || null, guardianId: optionalId(fd, "guardianId"), studentId: optionalId(fd, "studentId"),
      request: str(fd, "request"), department: str(fd, "department"), note: maybe(fd, "note", "Note", 500), givenBy: str(fd, "givenBy") === "slip" ? "slip" : "whatsapp",
    }, { timeZone: w.tz });
  }, (r, t) => ({
    message: `${r.handler ? t("Request {no} sent to {dept} ({name}).", { no: r.request.requestNo, dept: t.any(r.request.department), name: r.handler.name }) : t("Request {no} sent to {dept}.", { no: r.request.requestNo, dept: t.any(r.request.department) })} ${r.request.givenBy === "slip" ? t("Write the number on a slip for the person.") : r.sent ? t("The number went to the person {how}.", { how: t.any(r.sent) }) : t("The message could not be sent: give the number on a slip.")}`,
  }));
}

export async function closeWalkInAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.desk, "close walk-in requests");
    return closeWalkIn(w.tx, w.ctx, id(fd, "requestId", "request"));
  }, (r, t) => t("{no} marked done.", { no: r.requestNo }));
}

export async function addNoteAction(_: S, fd: FormData): Promise<S> {
  return foAction("create", fd, async (w) => {
    need(w.can.desk, "add desk notes");
    return addNote(w.tx, w.ctx, str(fd, "text"));
  }, () => "Note added for the desk.");
}

export async function editNoteAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.desk, "change desk notes");
    return editNote(w.tx, w.ctx, id(fd, "noteId", "note"), str(fd, "text"));
  }, () => "Note saved.");
}

export async function clearNoteAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.desk, "clear desk notes");
    return clearNote(w.tx, w.ctx, id(fd, "noteId", "note"));
  }, (n) => ({ message: "Note cleared.", undo: { kind: "fo-note", id: n.id } }));
}

/* ---------- Appointments ---------- */

export async function slotsFor(staffId: string, dayIso: string, length: number, rescheduleId?: string | null) {
  try {
    return await inFrontOffice("create", async (w) => {
      if (!w.can.book || !UUID_RE.test(staffId) || !/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return null;
      const plan = await dayPlan(w.tx, w.ctx, staffId, dayIso, { timeZone: w.tz, length: [15, 30, 45].includes(length) ? length : 15, ignoreId: rescheduleId && UUID_RE.test(rescheduleId) ? rescheduleId : null });
      if (!plan) return null;
      return { leave: plan.leave, free: plan.free, taken: plan.segments.filter((s) => s.kind !== "noshow" && s.appointmentId !== rescheduleId).map((s) => ({ start: s.start, label: s.label, kind: s.kind })) };
    });
  } catch {
    return null;
  }
}

export async function bookAction(_: S, fd: FormData): Promise<S> {
  return foAction("create", fd, async (w) => {
    need(w.can.book, "book appointments");
    const startMin = Number(str(fd, "startMin"));
    if (!str(fd, "startMin") || !Number.isFinite(startMin)) throw new FrontOfficeProblem("Pick a free slot.", "startMin");
    return bookAppointment(w.tx, w.ctx, {
      staffId: id(fd, "staffId", "person to meet"), dayIso: str(fd, "date"), startMin, lengthMin: Number(str(fd, "lengthMin")) || 15,
      visitorName: str(fd, "visitorName"), visitorPhone: str(fd, "visitorPhone"), purpose: str(fd, "purpose"), confirm: str(fd, "confirm") === "on",
    }, { timeZone: w.tz, rescheduleId: optionalId(fd, "rescheduleId") });
  }, (r, t) => {
    const vars = { name: r.appointment.visitorName, staff: r.staffName, when: r.when.replace(/^today/, t("today")), n: r.appointment.lengthMin };
    return `${str(fd, "rescheduleId") ? t("Moved: {name} with {staff}, {when} for {n} minutes.", vars) : t("Booked: {name} with {staff}, {when} for {n} minutes.", vars)}${r.sent ? ` ${t("Confirmation sent {how}.", { how: t.any(r.sent) })}` : ""}${r.notSent ? ` ${t("The confirmation was not sent: {why}. Call the visitor to tell them.", { why: t.any(r.notSent) })}` : ""}`;
  });
}

export async function appointmentStatusAction(_: S, fd: FormData): Promise<S> {
  const status = str(fd, "status");
  if (status === "ARRIVED") {
    return foAction("create", fd, async (w) => {
      need(w.can.book, "change appointments");
      return arriveAppointment(w.tx, w.ctx, id(fd, "appointmentId", "appointment"), { timeZone: w.tz });
    }, (r, t) => ({ message: r.meetName ? t("{name} arrived at {time}. Visitor pass {pass} made; {staff} told.", { name: r.appointment.visitorName, time: r.at, pass: r.visitor.passNo, staff: r.meetName }) : t("{name} arrived at {time}. Visitor pass {pass} made.", { name: r.appointment.visitorName, time: r.at, pass: r.visitor.passNo }) }));
  }
  if (!["DONE", "NO_SHOW", "CANCELLED"].includes(status)) return { ok: false, message: "Choose what happened." };
  return foAction("edit", fd, async (w) => {
    need(w.can.book, "change appointments");
    return setAppointmentStatus(w.tx, w.ctx, id(fd, "appointmentId", "appointment"), status as "DONE" | "NO_SHOW" | "CANCELLED", { timeZone: w.tz });
  }, (r, t) => ({
    message: `${status === "NO_SHOW" ? t("{name}: no-show.", { name: r.appointment.visitorName }) : status === "DONE" ? t("{name}: done.", { name: r.appointment.visitorName }) : t("{name}: cancelled.", { name: r.appointment.visitorName })}${status === "CANCELLED" ? (r.sent ? ` ${t("A message went to the visitor {how}.", { how: t.any(r.sent) })}` : ` ${t("Call the visitor to tell them.")}`) : ""}`,
    undo: { kind: "fo-appointment", id: `${r.appointment.id}~${r.appointment.status}` },
  }));
}

export async function remindAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.book, "send reminders");
    return remindAppointment(w.tx, w.ctx, id(fd, "appointmentId", "appointment"));
  }, (r, t) => t("Reminder sent to {name} {how}: {time} with {staff}.", { name: r.appointment.visitorName, how: t.any(r.sent ?? ""), time: clockOf(r.appointment.startMin), staff: r.staffName }));
}

/* ---------- Postal ---------- */

export async function postalAction(_: S, fd: FormData): Promise<S> {
  return foAction("create", fd, async (w) => {
    need(w.can.desk, "keep the postal register");
    if (!(await w.tx.schoolFeature.findFirst({ where: { featureKey: "front-office-postal", isOn: true } }))) throw new FrontOfficeProblem("Postal & Deliveries is switched off for this school.");
    const forValue = str(fd, "for");
    return recordPostal(w.tx, w.ctx, {
      direction: str(fd, "direction") === "SENT" ? "SENT" : "RECEIVED", itemType: str(fd, "itemType"), party: str(fd, "party"),
      forStaffId: UUID_RE.test(forValue) ? forValue : null, forDepartment: UUID_RE.test(forValue) ? null : forValue || null,
      courier: str(fd, "courier") || null, trackingNo: str(fd, "trackingNo") || null, photo: file(fd, "photo"), tell: str(fd, "tell") === "on",
    }, { timeZone: w.tz });
  }, (r) => r.entry.direction === "RECEIVED"
    ? `${r.entry.itemType.charAt(0)}${r.entry.itemType.slice(1).toLowerCase()} from ${r.entry.party} at the desk${r.told ? `. ${r.entry.forText.split(" · ")[0].split(" (")[0]} told on the app.` : "."}`
    : `${r.entry.itemType.charAt(0)}${r.entry.itemType.slice(1).toLowerCase()} to ${r.entry.party} recorded · ${r.entry.entryNo}`);
}

export async function handOverAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.desk, "hand over deliveries");
    return handOver(w.tx, w.ctx, id(fd, "entryId", "entry"), str(fd, "who"));
  }, (e, t) => ({ message: t("Handed over to {name}: {item} from {from}.", { name: str(fd, "who"), item: t.any(e.itemType.charAt(0) + e.itemType.slice(1).toLowerCase()).toLowerCase(), from: e.party }), undo: { kind: "fo-handover", id: e.id } }));
}

/* ---------- Settings (Front Office manager) ---------- */

export async function settingsAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.manage, "change Front Office settings");
    const expiry = str(fd, "passExpiryMode") === "set" ? str(fd, "passExpiry") : "";
    return saveSettings(w.tx, w.ctx, {
      photoRequired: str(fd, "photoRequired") === "on", idProofRequired: str(fd, "idProofRequired") === "on", pickupCodeCheck: str(fd, "pickupCodeCheck") === "on",
      passExpiry: expiry || null, slotMinutes: Number(str(fd, "slotMinutes")) || 15,
      features: Object.fromEntries(FRONT_OFFICE_FEATURES.map((f) => [f.key, str(fd, f.key) === "on"])) as Record<(typeof FRONT_OFFICE_FEATURES)[number]["key"], boolean>,
    });
  }, () => "Front Office settings saved.");
}

export async function listAddAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.manage, "change the lists");
    const list = str(fd, "list");
    if (!isListKey(list)) throw new FrontOfficeProblem("Choose the list.");
    return addToList(w.tx, w.ctx, list, str(fd, "value"));
  }, (v) => `“${v}” added to the list.`);
}

export async function listRemoveAction(_: S, fd: FormData): Promise<S> {
  return foAction("edit", fd, async (w) => {
    need(w.can.manage, "change the lists");
    const list = str(fd, "list");
    if (!isListKey(list)) throw new FrontOfficeProblem("Choose the list.");
    await removeFromList(w.tx, w.ctx, list, str(fd, "value"));
    return str(fd, "value");
  }, (v) => `“${v}” removed. Records that used it keep their words.`);
}
