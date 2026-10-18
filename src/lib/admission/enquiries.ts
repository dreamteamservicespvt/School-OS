// Enquiries (02 §2): add with a duplicate check, the owner from "Who gets new
// enquiries", a required next follow-up, and an activity log that is never
// deleted: notes, calls, follow-ups, reassignments, status and source
// changes, messages and closing as lost.
import "server-only";

import type { Enquiry, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDateTime } from "../format";
import { AdmissionProblem, instantToLocal, zonedToInstant } from "./act";
import { canWorkOn, enquiryScope, requireFull, requireOwnCampus, type Viewer } from "./access";
import { CLOSED_STATUSES, SYSTEM_STATUSES, label, live, yearOnCampus, type Settings } from "./settings";
import { messageParent } from "./notify-parents";
import { formatNumber, nextNumber } from "../sequences";

/** The next enquiry number, ENQ-0001 (never reused). */
export async function nextEnquiryNo(tx: Tx, ctx: SchoolContext) {
  return formatNumber("ENQ-", await nextNumber(tx, ctx, "enquiry"), 4);
}

export const CALL_OUTCOMES = ["Talked", "No answer", "Busy", "Switched off", "Wrong number", "Call back later"] as const;

export type Match = { kind: "enquiry" | "application" | "parent"; text: string; href: string; id: string };

/**
 * "This phone already has an open enquiry for Arjun (class 2)" — matches on phone or email (02 §5).
 * campusId: a person limited to one campus is shown that campus's matches only.
 */
export async function findDuplicates(tx: Tx, input: { phone?: string | null; email?: string | null; excludeEnquiryId?: string | null; excludeApplicationId?: string | null; campusId?: string | null }): Promise<Match[]> {
  const phone = input.phone && /^\d{10}$/.test(input.phone) ? input.phone : null;
  const email = input.email ? input.email.toLowerCase() : null;
  if (!phone && !email) return [];
  const or = <T>(p: T, e: T) => [...(phone ? [p] : []), ...(email ? [e] : [])];
  const campus = input.campusId ? { campusId: input.campusId } : {};
  const [enquiries, applications, guardians, classes] = await Promise.all([
    tx.enquiry.findMany({
      where: { archivedAt: null, status: { notIn: [...CLOSED_STATUSES] }, id: input.excludeEnquiryId ? { not: input.excludeEnquiryId } : undefined, ...campus, OR: or<Prisma.EnquiryWhereInput>({ phone: phone! }, { email: { equals: email!, mode: "insensitive" } }) },
      take: 5, orderBy: { createdAt: "desc" },
    }),
    tx.application.findMany({
      where: { archivedAt: null, stage: { notIn: ["REJECTED", "WITHDRAWN", "ADMITTED"] }, id: input.excludeApplicationId ? { not: input.excludeApplicationId } : undefined, ...campus, OR: or<Prisma.ApplicationWhereInput>({ phone: phone! }, { email: { equals: email!, mode: "insensitive" } }) },
      take: 5, orderBy: { createdAt: "desc" },
    }),
    tx.guardian.findMany({
      where: { archivedAt: null, OR: or<Prisma.GuardianWhereInput>({ phone: phone! }, { email: { equals: email!, mode: "insensitive" } }) },
      take: 3,
      include: { students: { where: { archivedAt: null, student: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] }, ...campus } }, include: { student: { include: { enrolments: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } } } } } },
    }),
    tx.schoolClass.findMany({ select: { id: true, name: true } }),
  ]);
  const cls = (id: string | null | undefined) => classes.find((c) => c.id === id)?.name ?? null;
  const sections = await tx.section.findMany({ where: { id: { in: guardians.flatMap((g) => g.students.flatMap((s) => s.student.enrolments.map((e) => e.sectionId))) } }, include: { schoolClass: true } });
  const out: Match[] = [];
  for (const e of enquiries) {
    const c = cls(e.classId);
    out.push({ kind: "enquiry", id: e.id, href: `/admission-management/enquiries/${e.id}`, text: `This ${phone && e.phone === phone ? "phone" : "email"} already has an open enquiry for ${e.childName}${c ? ` (${c})` : ""}, from ${e.parentName}.` });
  }
  for (const a of applications) {
    out.push({ kind: "application", id: a.id, href: `/admission-management/applications/${a.id}`, text: `This ${phone && a.phone === phone ? "phone" : "email"} is on application ${a.applicationNo} for ${a.fullName} (${cls(a.classId) ?? "class not set"}).` });
  }
  for (const g of guardians) {
    const kids = g.students.map((sg) => {
      const en = sg.student.enrolments[0];
      const sec = en ? sections.find((s) => s.id === en.sectionId) : null;
      return `${sg.student.firstName}${sec ? `, ${sec.schoolClass.name.replace(/^Class\s+/i, "")} ${sec.name}` : ""}`;
    });
    if (kids.length === 0) continue;
    out.push({ kind: "parent", id: g.id, href: `/student-management?q=${encodeURIComponent(g.phone)}`, text: `This ${phone && g.phone === phone ? "phone" : "email"} belongs to ${g.name}, parent of ${kids.join(" and ")}.` });
  }
  return out;
}

export class DuplicateProblem extends AdmissionProblem {
  constructor(public matches: Match[]) {
    super(matches[0]?.text ?? "This family may already be in School OS.", "phone");
  }
}

/** Is this staff member on approved leave on this date? (skipped in turn) */
async function onLeave(tx: Tx, staffIds: string[], dayIso: string) {
  if (staffIds.length === 0) return new Set<string>();
  const d = new Date(`${dayIso}T00:00:00Z`);
  const rows = await tx.leaveRequest.findMany({ where: { staffId: { in: staffIds }, status: "APPROVED", fromDate: { lte: d }, toDate: { gte: d }, archivedAt: null }, select: { staffId: true } });
  return new Set(rows.map((r) => r.staffId).filter((x): x is string => Boolean(x)));
}

/**
 * The owner of a new enquiry from "Who gets new enquiries" (decided 9 October
 * 2026): one default owner, in turn among chosen staff (skipping anyone on
 * approved leave today), or by class wanted. Otherwise the person adding it.
 */
export async function pickOwner(tx: Tx, ctx: SchoolContext, s: Settings, input: { classId: string | null; adderStaffId: string | null; today: string }): Promise<string | null> {
  const active = async (id: string | null | undefined) => (id ? Boolean(await tx.staff.findFirst({ where: { id, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true } })) : false);
  if (s.ownerRule === "class" && input.classId) {
    const rule = await tx.admissionClassRule.findUnique({ where: { schoolId_classId: { schoolId: ctx.schoolId, classId: input.classId } } });
    if (rule?.ownerStaffId && (await active(rule.ownerStaffId))) return rule.ownerStaffId;
  }
  if (s.ownerRule === "turn" && s.turnStaffIds.length > 0) {
    const list = s.turnStaffIds;
    const away = await onLeave(tx, list, input.today);
    for (let i = 0; i < list.length; i++) {
      const idx = (s.turnNext + i) % list.length;
      const candidate = list[idx];
      if (away.has(candidate) || !(await active(candidate))) continue;
      // Taken in the same transaction as the enquiry, so two at once get different people.
      await tx.admissionSetting.update({ where: { schoolId: ctx.schoolId }, data: { turnNext: (idx + 1) % list.length } });
      s.turnNext = (idx + 1) % list.length;
      return candidate;
    }
  }
  if (s.defaultOwnerStaffId && (await active(s.defaultOwnerStaffId))) return s.defaultOwnerStaffId;
  return input.adderStaffId;
}

/** Next working day (Monday to Saturday, not a holiday on the School Calendar) at 11:00 AM (inferred). */
export async function defaultFollowUp(tx: Tx, timeZone: string, now = new Date()) {
  const today = instantToLocal(now, timeZone).slice(0, 10);
  const d = new Date(`${today}T00:00:00Z`);
  const holidays = await tx.calendarEntry.findMany({
    where: { archivedAt: null, attendanceOn: false, type: { in: ["holiday", "vacation"] }, endDate: { gte: d }, startDate: { lte: new Date(d.getTime() + 30 * 86_400_000) } },
    select: { startDate: true, endDate: true },
  });
  for (let i = 1; i < 30; i++) {
    const next = new Date(d.getTime() + i * 86_400_000);
    if (next.getUTCDay() === 0) continue;
    if (holidays.some((h) => h.startDate <= next && h.endDate >= next)) continue;
    return zonedToInstant(`${next.toISOString().slice(0, 10)}T11:00`, timeZone);
  }
  return zonedToInstant(`${new Date(d.getTime() + 86_400_000).toISOString().slice(0, 10)}T11:00`, timeZone);
}

async function activity(tx: Tx, ctx: SchoolContext, enquiryId: string, kind: string, text: string, extra: { direction?: string | null; outcome?: string | null; data?: Prisma.InputJsonValue } = {}) {
  return tx.enquiryActivity.create({ data: { schoolId: ctx.schoolId, enquiryId, kind, text, direction: extra.direction ?? null, outcome: extra.outcome ?? null, data: extra.data, byId: ctx.userId } });
}

async function staffName(tx: Tx, id: string | null | undefined) {
  if (!id) return "nobody";
  return (await tx.staff.findUnique({ where: { id }, select: { fullName: true } }))?.fullName ?? "a staff member";
}

async function tellOwner(tx: Tx, ctx: SchoolContext, ownerStaffId: string | null, text: string, enquiryId: string) {
  if (!ownerStaffId) return;
  const owner = await tx.staff.findUnique({ where: { id: ownerStaffId }, select: { userLoginId: true } });
  if (!owner?.userLoginId) return;
  await notify(tx, ctx, { to: owner.userLoginId, type: "enquiry-assigned", text, link: `/admission-management/enquiries/${enquiryId}`, groupKey: "enquiry-assigned", mergedText: (n) => `${n} new enquiries assigned to you` });
}

export type EnquiryInput = {
  childName: string;
  parentName: string;
  phone: string;
  email: string | null;
  classId: string | null;
  source: string;
  ownerStaffId: string | null;
  nextFollowUpAt: Date;
  nextAction: string | null;
  childDob: Date | null;
  currentSchool: string | null;
  referredBy: string | null;
  notes: string | null;
  campaignId?: string | null;
  customFields?: Prisma.InputJsonValue;
};

function checkSource(s: Settings, key: string) {
  if (!live(s.sourceList).some((x) => x.key === key)) throw new AdmissionProblem("Choose where the family heard of the school.", "source");
}

/** The class wanted, if any; it must be on the given campus when one is given. */
async function checkClass(tx: Tx, classId: string | null, campusId?: string | null) {
  if (!classId) return null;
  const cls = await tx.schoolClass.findFirst({ where: { id: classId, archivedAt: null }, select: { id: true, campusId: true } });
  if (!cls) throw new AdmissionProblem("Choose a class from the list.", "classId");
  if (campusId && cls.campusId !== campusId) throw new AdmissionProblem("Choose a class of this enquiry's campus.", "classId");
  return cls;
}

/**
 * Adds an enquiry. A matching phone or email stops it with the matches,
 * unless the person chose "Add as sibling enquiry" (siblingOfId) or "Save anyway".
 * The enquiry is for the campus of the class wanted (else opts.campusId), in
 * that campus's year: opts.yearId, or the campus's open year of the same name
 * (each campus has its own years). A person limited to one campus adds
 * enquiries for that campus only.
 */
export async function createEnquiry(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, input: EnquiryInput, opts: { yearId: string; campusId: string; today: string; force?: boolean; siblingOfId?: string | null; importBatchId?: string | null; now?: Date }) {
  if (v.change === "none") throw new AdmissionProblem("Your role cannot add enquiries.");
  checkSource(s, input.source);
  const cls = await checkClass(tx, input.classId);
  const campusId = cls?.campusId ?? opts.campusId;
  requireOwnCampus(v, campusId, cls ? "classId" : undefined);
  const year = await yearOnCampus(tx, opts.yearId, campusId);
  if (!year) throw new AdmissionProblem("This campus has no year open for admissions. Add it in Academic Management.", "yearId");
  const now = opts.now ?? new Date();
  if (input.nextFollowUpAt.getTime() < now.getTime() - 5 * 60_000) throw new AdmissionProblem("The next follow-up must be now or later.", "nextFollowUpAt");
  if (!opts.force && !opts.siblingOfId) {
    const matches = await findDuplicates(tx, { phone: input.phone, email: input.email, campusId: v.campusId });
    if (matches.length) throw new DuplicateProblem(matches);
  }
  let siblingOfId: string | null = null;
  if (opts.siblingOfId) {
    const sib = await tx.enquiry.findFirst({ where: { id: opts.siblingOfId, archivedAt: null, ...(v.campusId ? { campusId: v.campusId } : {}) } });
    if (sib) siblingOfId = sib.id;
  }
  let owner = input.ownerStaffId;
  if (owner) {
    if (!(await tx.staff.findFirst({ where: { id: owner, archivedAt: null, ...(v.campusId ? { campusId: v.campusId } : {}) }, select: { id: true } }))) throw new AdmissionProblem("Choose the owner from the list.", "ownerStaffId");
  } else {
    owner = await pickOwner(tx, ctx, s, { classId: input.classId, adderStaffId: v.staffId, today: opts.today });
  }
  // People with "own" reach work only on their own enquiries: one they hand to someone else stays visible to them as the person who added it.
  const e = await tx.enquiry.create({
    data: {
      enquiryNo: await nextEnquiryNo(tx, ctx),
      schoolId: ctx.schoolId, campusId, academicYearId: year.id,
      childName: input.childName, parentName: input.parentName, phone: input.phone, email: input.email, classId: input.classId,
      source: input.source, firstSource: input.source, status: "new", ownerStaffId: owner,
      nextFollowUpAt: input.nextFollowUpAt, nextAction: input.nextAction, childDob: input.childDob, currentSchool: input.currentSchool,
      referredBy: input.referredBy, notes: input.notes, campaignId: input.campaignId ?? null, siblingOfId, customFields: input.customFields ?? {},
      importBatchId: opts.importBatchId ?? null, createdById: ctx.userId, updatedById: ctx.userId,
    },
  });
  const ownerName = await staffName(tx, owner);
  await activity(tx, ctx, e.id, "created", `Enquiry added. Source: ${label(s.sourceList, input.source)}. Owner: ${ownerName}.${siblingOfId ? " Added as a sibling enquiry." : ""}`, { data: { source: input.source, owner } });
  if (input.notes) await activity(tx, ctx, e.id, "note", input.notes);
  await tellOwner(tx, ctx, owner, `New enquiry assigned to you: ${e.childName} (${e.parentName}). Follow up by ${formatDateTime(input.nextFollowUpAt)}.`, e.id);
  await writeAudit(tx, ctx, { action: "created", recordType: "Enquiry", recordId: e.id, after: { childName: e.childName, parentName: e.parentName, phone: e.phone, classId: e.classId, source: e.source, owner, nextFollowUpAt: e.nextFollowUpAt?.toISOString() ?? null } });
  return e;
}

export async function loadEnquiry(tx: Tx, v: Viewer, id: string, opts: { forChange?: boolean } = {}) {
  // Another campus's enquiry is "not found" for a person limited to one campus.
  const e = await tx.enquiry.findFirst({ where: { id, archivedAt: null, ...(v.campusId ? { campusId: v.campusId } : {}) } });
  if (!e) throw new AdmissionProblem("This enquiry was not found. It may have been archived.");
  if (v.see !== "all" && !canWorkOn({ change: "own", staffId: v.staffId, userId: v.userId }, e)) throw new AdmissionProblem("This enquiry belongs to someone else. Ask the admission team if you need it.");
  if (opts.forChange && !canWorkOn(v, e)) throw new AdmissionProblem("You can read this enquiry but not change it.");
  return e;
}

export type EnquiryEdit = Pick<EnquiryInput, "childName" | "parentName" | "phone" | "email" | "classId" | "childDob" | "currentSchool" | "referredBy" | "customFields">;

export async function editEnquiry(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, input: EnquiryEdit, opts: { force?: boolean } = {}) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  await checkClass(tx, input.classId, e.campusId);
  if (!opts.force && (input.phone !== e.phone || (input.email ?? null) !== (e.email ?? null))) {
    const matches = await findDuplicates(tx, { phone: input.phone !== e.phone ? input.phone : null, email: input.email !== e.email ? input.email : null, excludeEnquiryId: e.id, campusId: v.campusId });
    if (matches.length) throw new DuplicateProblem(matches);
  }
  const changed = await tx.enquiry.update({ where: { id: e.id }, data: { ...input, customFields: input.customFields ?? (e.customFields as Prisma.InputJsonValue), updatedById: ctx.userId } });
  const before = { childName: e.childName, parentName: e.parentName, phone: e.phone, email: e.email, classId: e.classId, currentSchool: e.currentSchool, referredBy: e.referredBy };
  const after = { childName: changed.childName, parentName: changed.parentName, phone: changed.phone, email: changed.email, classId: changed.classId, currentSchool: changed.currentSchool, referredBy: changed.referredBy };
  await activity(tx, ctx, e.id, "edited", "Details changed.", { data: { before, after } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Enquiry", recordId: e.id, before, after });
  return changed;
}

/** Change status from the school's list. "Applied", "Admitted" and "Lost" are set by the software or by "Close as lost". */
export async function changeStatus(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, id: string, status: string) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if ((SYSTEM_STATUSES as readonly string[]).includes(status)) {
    throw new AdmissionProblem(status === "lost" ? "Use Close as lost, so the reason is kept." : `"${label(s.statusList, status)}" is set by School OS when an application is made or the admission is confirmed.`, "status");
  }
  if (!live(s.statusList).some((x) => x.key === status)) throw new AdmissionProblem("Choose a status from the list.", "status");
  if (CLOSED_STATUSES.includes(e.status)) throw new AdmissionProblem(e.status === "lost" ? "This enquiry is closed as lost. Reopen it first." : "This enquiry already has an application, so its status follows the application.");
  if (e.status === status) return e;
  const changed = await tx.enquiry.update({ where: { id: e.id }, data: { status, updatedById: ctx.userId } });
  await activity(tx, ctx, e.id, "status", `Status changed from ${label(s.statusList, e.status)} to ${label(s.statusList, status)}.`, { data: { from: e.status, to: status } });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Enquiry", recordId: e.id, before: { status: e.status }, after: { status } });
  return changed;
}

/** Source is kept as first recorded; a change needs the admission permission and a reason (decided 9 October 2026). */
export async function changeSource(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, id: string, source: string, reason: string) {
  requireFull(v, "a change of source");
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  checkSource(s, source);
  if (e.source === source) throw new AdmissionProblem("This is already the source.", "source");
  if (reason.trim().length < 5) throw new AdmissionProblem(`Give a reason for changing the source from ${label(s.sourceList, e.source)} to ${label(s.sourceList, source)}.`, "reason");
  const changed = await tx.enquiry.update({ where: { id: e.id }, data: { source, updatedById: ctx.userId } });
  await activity(tx, ctx, e.id, "source", `Source changed from ${label(s.sourceList, e.source)} to ${label(s.sourceList, source)}. First recorded: ${label(s.sourceList, e.firstSource)}. Reason: ${reason.trim()}`, { data: { from: e.source, to: source, first: e.firstSource, reason: reason.trim() } });
  await writeAudit(tx, ctx, { action: "source-changed", recordType: "Enquiry", recordId: e.id, before: { source: e.source }, after: { source, firstSource: e.firstSource, reason: reason.trim() } });
  return changed;
}

/** Reassign: the old and new owner and the reason are kept in the history. */
export async function reassign(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, ownerStaffId: string, reason: string | null) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if (e.ownerStaffId === ownerStaffId) throw new AdmissionProblem("This person already owns the enquiry.", "ownerStaffId");
  if (!(await tx.staff.findFirst({ where: { id: ownerStaffId, archivedAt: null, ...(v.campusId ? { campusId: v.campusId } : {}) }, select: { id: true } }))) throw new AdmissionProblem("Choose the new owner from the list.", "ownerStaffId");
  const [from, to] = [await staffName(tx, e.ownerStaffId), await staffName(tx, ownerStaffId)];
  const changed = await tx.enquiry.update({ where: { id: e.id }, data: { ownerStaffId, remindedFor: null, updatedById: ctx.userId } });
  await activity(tx, ctx, e.id, "reassigned", `Reassigned from ${from} to ${to}.${reason ? ` Reason: ${reason}` : ""}`, { data: { from: e.ownerStaffId, to: ownerStaffId, reason } });
  await tellOwner(tx, ctx, ownerStaffId, `Enquiry reassigned to you: ${e.childName} (${e.parentName}).`, e.id);
  await writeAudit(tx, ctx, { action: "reassigned", recordType: "Enquiry", recordId: e.id, before: { ownerStaffId: e.ownerStaffId }, after: { ownerStaffId, reason } });
  return changed;
}

export async function setFollowUp(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, at: Date, nextAction: string | null, now = new Date()) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if (CLOSED_STATUSES.includes(e.status)) throw new AdmissionProblem("This enquiry is closed, so it needs no follow-up.");
  if (at.getTime() < now.getTime() - 5 * 60_000) throw new AdmissionProblem("The next follow-up must be now or later.", "nextFollowUpAt");
  const changed = await tx.enquiry.update({ where: { id: e.id }, data: { nextFollowUpAt: at, nextAction, remindedFor: null, updatedById: ctx.userId } });
  await activity(tx, ctx, e.id, "follow-up", `Next follow-up set for ${formatDateTime(at)}${nextAction ? `: ${nextAction}` : ""}.`, { data: { at: at.toISOString(), nextAction } });
  await writeAudit(tx, ctx, { action: "follow-up-set", recordType: "Enquiry", recordId: e.id, before: { nextFollowUpAt: e.nextFollowUpAt?.toISOString() ?? null }, after: { nextFollowUpAt: at.toISOString(), nextAction } });
  return changed;
}

export async function addNote(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, text: string) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if (text.trim().length < 2) throw new AdmissionProblem("Type the note.", "text");
  await activity(tx, ctx, e.id, "note", text.trim());
  await tx.enquiry.update({ where: { id: e.id }, data: { updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "note-added", recordType: "Enquiry", recordId: e.id, after: { text: text.trim() } });
  return e;
}

/** Log a call; contacting a New enquiry moves it to Contacted. */
export async function logCall(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, id: string, input: { direction: "incoming" | "outgoing"; outcome: string; note: string | null; nextFollowUpAt: Date | null; nextAction: string | null }, now = new Date()) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if (!CALL_OUTCOMES.includes(input.outcome as (typeof CALL_OUTCOMES)[number])) throw new AdmissionProblem("Choose how the call went.", "outcome");
  await activity(tx, ctx, e.id, "call", `${input.direction === "incoming" ? "Incoming" : "Outgoing"} call: ${input.outcome}.${input.note ? ` ${input.note}` : ""}`, { direction: input.direction, outcome: input.outcome, data: { note: input.note } });
  const data: Prisma.EnquiryUpdateInput = { updatedById: ctx.userId };
  if (input.outcome === "Talked" && e.status === "new" && live(s.statusList).some((x) => x.key === "contacted")) {
    data.status = "contacted";
    await activity(tx, ctx, e.id, "status", `Status changed from ${label(s.statusList, "new")} to ${label(s.statusList, "contacted")}.`, { data: { from: "new", to: "contacted" } });
  }
  if (input.nextFollowUpAt && !CLOSED_STATUSES.includes(e.status)) {
    if (input.nextFollowUpAt.getTime() < now.getTime() - 5 * 60_000) throw new AdmissionProblem("The next follow-up must be now or later.", "nextFollowUpAt");
    data.nextFollowUpAt = input.nextFollowUpAt;
    data.nextAction = input.nextAction;
    data.remindedFor = null;
    await activity(tx, ctx, e.id, "follow-up", `Next follow-up set for ${formatDateTime(input.nextFollowUpAt)}${input.nextAction ? `: ${input.nextAction}` : ""}.`, { data: { at: input.nextFollowUpAt.toISOString(), nextAction: input.nextAction } });
  }
  await tx.enquiry.update({ where: { id: e.id }, data });
  await writeAudit(tx, ctx, { action: "call-logged", recordType: "Enquiry", recordId: e.id, after: { direction: input.direction, outcome: input.outcome, note: input.note } });
  return e;
}

/** Ready message texts staff can start from (inferred; the school's own templates live in Communication). */
export function enquiryTemplates(schoolName: string, e: { childName: string; parentName: string }) {
  return [
    { key: "admission-enquiry-thanks", label: "Thank you for your enquiry", text: `Dear ${e.parentName}, thank you for your interest in ${schoolName} for ${e.childName}. We will call you soon. For any question, reply to this message.` },
    { key: "admission-visit-invite", label: "Invite to visit the school", text: `Dear ${e.parentName}, we would be happy to show you ${schoolName}. Please visit any working day between 9 AM and 1 PM, or reply with a time that suits you.` },
    { key: "admission-application-reminder", label: "Reminder to apply", text: `Dear ${e.parentName}, admissions at ${schoolName} are open. Please fill the application for ${e.childName} at the school office soon, as seats are limited.` },
  ];
}

export async function sendEnquiryMessage(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, input: { channel: "whatsapp" | "sms" | "email"; template: string; text: string }) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if (input.text.trim().length < 5) throw new AdmissionProblem("Type the message.", "text");
  if (input.text.length > 1000) throw new AdmissionProblem("A message can be at most 1,000 characters.", "text");
  if (input.channel === "email" && !e.email) throw new AdmissionProblem("This enquiry has no email address. Add one in Edit, or send by WhatsApp or SMS.", "channel");
  const sent = await messageParent(tx, ctx, { to: { name: e.parentName, phone: e.phone, email: e.email }, template: input.template, text: input.text.trim(), channel: input.channel, about: { recordType: "Enquiry", recordId: e.id } });
  if (sent.status === "skipped") throw new AdmissionProblem(`The message was not sent. ${sent.note ?? "Please try again later"}.`);
  await activity(tx, ctx, e.id, "message", input.text.trim(), { direction: "outgoing", data: { channel: input.channel, template: input.template } });
  return e;
}

/** Close as lost: needs a reason from the school's list. */
export async function closeLost(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, id: string, reason: string, note: string | null) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if (e.status === "lost") throw new AdmissionProblem("This enquiry is already closed as lost.");
  if (e.status === "admitted") throw new AdmissionProblem("This child is already admitted.");
  if (!live(s.lossList).some((x) => x.key === reason)) throw new AdmissionProblem("Choose why this enquiry was lost.", "reason");
  if (reason === "other" && (!note || note.length < 3)) throw new AdmissionProblem("Say in a few words why this enquiry was lost.", "note");
  const changed = await tx.enquiry.update({ where: { id: e.id }, data: { status: "lost", lostReason: reason, lostNote: note, closedAt: new Date(), nextFollowUpAt: null, nextAction: null, updatedById: ctx.userId } });
  await activity(tx, ctx, e.id, "lost", `Closed as lost: ${label(s.lossList, reason)}.${note ? ` ${note}` : ""}`, { data: { from: e.status, reason, note } });
  await writeAudit(tx, ctx, { action: "closed-lost", recordType: "Enquiry", recordId: e.id, before: { status: e.status }, after: { status: "lost", reason, note } });
  return changed;
}

/** Reopen a lost enquiry later (inferred), with a new follow-up. */
export async function reopen(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, id: string, at: Date, now = new Date()) {
  const e = await loadEnquiry(tx, v, id, { forChange: true });
  if (e.status !== "lost") throw new AdmissionProblem("Only an enquiry closed as lost can be reopened.");
  if (at.getTime() < now.getTime() - 5 * 60_000) throw new AdmissionProblem("The next follow-up must be now or later.", "nextFollowUpAt");
  const to = live(s.statusList).some((x) => x.key === "contacted") ? "contacted" : (live(s.statusList).find((x) => !CLOSED_STATUSES.includes(x.key))?.key ?? "new");
  const changed = await tx.enquiry.update({ where: { id: e.id }, data: { status: to, lostReason: null, lostNote: null, closedAt: null, nextFollowUpAt: at, remindedFor: null, updatedById: ctx.userId } });
  await activity(tx, ctx, e.id, "reopened", `Reopened. Status ${label(s.statusList, to)}, next follow-up ${formatDateTime(at)}.`, { data: { to, at: at.toISOString() } });
  await writeAudit(tx, ctx, { action: "reopened", recordType: "Enquiry", recordId: e.id, before: { status: "lost", lostReason: e.lostReason }, after: { status: to } });
  return changed;
}

/** Archive an enquiry entered by mistake (P13). */
export async function archiveEnquiry(tx: Tx, ctx: SchoolContext, v: Viewer, id: string, reason: string) {
  requireFull(v, "archiving enquiries");
  const e = await loadEnquiry(tx, v, id);
  if (reason.trim().length < 5) throw new AdmissionProblem("Give a reason for archiving this enquiry.", "reason");
  if (await tx.application.count({ where: { enquiryId: e.id, archivedAt: null } })) throw new AdmissionProblem("This enquiry has an application, so it is kept. Withdraw the application instead.");
  await tx.enquiry.update({ where: { id: e.id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await activity(tx, ctx, e.id, "archived", `Archived. Reason: ${reason.trim()}`);
  await writeAudit(tx, ctx, { action: "archived", recordType: "Enquiry", recordId: e.id, after: { reason: reason.trim() } });
}

export async function restoreEnquiry(tx: Tx, ctx: SchoolContext, v: Viewer, id: string) {
  requireFull(v, "restoring enquiries");
  const e = await tx.enquiry.findFirst({ where: { id, archivedAt: { not: null }, ...(v.campusId ? { campusId: v.campusId } : {}) } });
  if (!e) throw new AdmissionProblem("This enquiry is not archived.");
  await tx.enquiry.update({ where: { id }, data: { archivedAt: null, updatedById: ctx.userId } });
  await activity(tx, ctx, id, "restored", "Restored from the archive.");
  await writeAudit(tx, ctx, { action: "restored", recordType: "Enquiry", recordId: id });
}

/** The software moves an enquiry on when an application is made or the admission confirmed. */
export async function systemStatus(tx: Tx, ctx: SchoolContext, s: Settings, enquiry: Pick<Enquiry, "id" | "status">, to: "applied" | "admitted", text: string) {
  if (enquiry.status === to) return;
  await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: to, nextFollowUpAt: null, nextAction: null, closedAt: to === "admitted" ? new Date() : null } });
  await activity(tx, ctx, enquiry.id, to === "applied" ? "application" : "admitted", text, { data: { from: enquiry.status, to } });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Enquiry", recordId: enquiry.id, before: { status: enquiry.status }, after: { status: to, by: "software" } });
  void s;
}

/**
 * Follow-up reminders to the enquiry owner (02 Done when 3): one notification
 * per follow-up time, when it comes due. Safe to run twice.
 */
export async function sendFollowUpReminders(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const due = await tx.enquiry.findMany({
    where: { archivedAt: null, status: { notIn: [...CLOSED_STATUSES] }, nextFollowUpAt: { lte: now }, ownerStaffId: { not: null } },
    select: { id: true, childName: true, parentName: true, nextFollowUpAt: true, nextAction: true, remindedFor: true, ownerStaffId: true },
    take: 500,
  });
  const owners = await tx.staff.findMany({ where: { id: { in: [...new Set(due.map((d) => d.ownerStaffId!))] } }, select: { id: true, userLoginId: true } });
  let sent = 0;
  for (const e of due) {
    if (e.remindedFor && e.nextFollowUpAt && e.remindedFor.getTime() === e.nextFollowUpAt.getTime()) continue;
    const to = owners.find((o) => o.id === e.ownerStaffId)?.userLoginId;
    // Marked first, so a second run never sends it again.
    const claimed = await tx.enquiry.updateMany({ where: { id: e.id, OR: [{ remindedFor: null }, { remindedFor: { not: e.nextFollowUpAt! } }] }, data: { remindedFor: e.nextFollowUpAt } });
    if (claimed.count === 0 || !to) continue;
    const overdue = now.getTime() - e.nextFollowUpAt!.getTime() > 60 * 60_000;
    await notify(tx, { schoolId: ctx.schoolId, userId: null }, {
      to,
      type: "enquiry-follow-up",
      text: `${overdue ? "Overdue follow-up" : "Follow-up due"}: ${e.childName} (${e.parentName})${e.nextAction ? `: ${e.nextAction}` : ""}`,
      link: `/admission-management/enquiries/${e.id}`,
      groupKey: "enquiry-follow-up",
      mergedText: (n) => `${n} enquiry follow-ups are due`,
    });
    sent++;
  }
  return sent;
}

export type CampaignInput = { name: string; message: string; channel: "whatsapp" | "sms" | "email" };

/** Run a campaign to chosen enquiries: one message each through Communication; each enquiry then shows the campaign. */
export async function runCampaign(tx: Tx, ctx: SchoolContext, v: Viewer, s: Settings, ids: string[], input: CampaignInput) {
  requireFull(v, "campaigns");
  if (!s.campaignsOn) throw new AdmissionProblem("Campaigns are switched off in Admission Settings.");
  if (input.name.trim().length < 3) throw new AdmissionProblem("Name the campaign, for example \"Class 1 open day\".", "name");
  if (input.message.trim().length < 10) throw new AdmissionProblem("Type the message parents will read.", "message");
  if (input.message.length > 1000) throw new AdmissionProblem("A message can be at most 1,000 characters.", "message");
  const enquiries = await tx.enquiry.findMany({ where: { id: { in: ids }, archivedAt: null, AND: [enquiryScope(v)] } });
  if (enquiries.length === 0) throw new AdmissionProblem("Select at least one enquiry.");
  const campaign = await tx.admissionCampaign.create({ data: { schoolId: ctx.schoolId, name: input.name.trim(), message: input.message.trim(), channel: input.channel, createdById: ctx.userId } });
  let sent = 0;
  let skipped = 0;
  const skippedWhy: string[] = [];
  for (const e of enquiries) {
    if (e.status === "lost" || e.status === "admitted") { skipped++; skippedWhy.push(`${e.childName}: closed`); continue; }
    if (input.channel === "email" && !e.email) { skipped++; skippedWhy.push(`${e.childName}: no email`); continue; }
    const text = input.message.trim().replace(/\{parent\}/g, e.parentName).replace(/\{child\}/g, e.childName);
    const r = await messageParent(tx, ctx, { to: { name: e.parentName, phone: e.phone, email: e.email }, template: "admission-campaign", text, channel: input.channel, about: { recordType: "Enquiry", recordId: e.id } });
    if (r.status === "skipped") { skipped++; skippedWhy.push(`${e.childName}: ${r.note ?? "no valid phone"}`); continue; }
    await tx.enquiry.update({ where: { id: e.id }, data: { campaignId: campaign.id } });
    await activity(tx, ctx, e.id, "campaign", `Campaign "${campaign.name}": ${text}`, { direction: "outgoing", data: { campaignId: campaign.id, channel: input.channel } });
    sent++;
  }
  await tx.admissionCampaign.update({ where: { id: campaign.id }, data: { sentCount: sent, skipped, sentAt: new Date() } });
  await writeAudit(tx, ctx, { action: "campaign-run", recordType: "Admission Campaign", recordId: campaign.id, after: { name: campaign.name, channel: input.channel, sent, skipped } });
  return { campaign, sent, skipped, skippedWhy };
}
