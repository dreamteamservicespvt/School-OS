// The first-login setup checklist (01 §2, Needs Attention): steps follow the
// build order, each is worked out from the school's records, and a step can
// also be marked done (or an optional one skipped) by hand. Steps of modules
// that are not built or are switched off are hidden.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { currentYear } from "../academic/years";
import { moduleOpen, n, plural } from "./common";
import type { ModuleKey } from "../modules";
import type { Viewer } from "./types";

export type SetupStep = {
  key: string;
  label: string;
  module: ModuleKey;
  href: string;
  /** What the step asks for, shown until it is done. */
  sub: string;
  time: string;
  button: string;
  optional?: boolean;
};

export const SETUP_STEPS: readonly SetupStep[] = [
  { key: "profile", label: "School profile and logo", module: "settings", href: "/settings/school-profile", sub: "Name, address, board and logo. They print on receipts, certificates and ID cards.", time: "5 minutes", button: "Add details" },
  { key: "year", label: "Academic year, terms and timings", module: "academic-management", href: "/academic-management/settings", sub: "The year's dates, its terms, school timings and periods.", time: "5 minutes", button: "Set up the year" },
  { key: "classes", label: "Classes and sections", module: "academic-management", href: "/academic-management", sub: "Nursery to Class 12, with the sections in each.", time: "10 minutes", button: "Add classes" },
  { key: "subjects", label: "Subjects", module: "academic-management", href: "/academic-management/subjects", sub: "The subjects taught, and which classes take them.", time: "5 minutes", button: "Add subjects" },
  { key: "staff", label: "Staff and their logins", module: "staff-hr-management", href: "/staff-hr-management", sub: "Add your staff, then invite them to sign in.", time: "20 minutes", button: "Add staff" },
  { key: "students", label: "Students and parents (import from Excel)", module: "student-management", href: "/student-management/import", sub: "Bring your students and their parents from Excel. Every row is checked first.", time: "15 minutes", button: "Import students" },
  { key: "fees", label: "Fee structure", module: "fee-management", href: "/fee-management/structure", sub: "Fee heads, amounts and due dates per class.", time: "20 minutes", button: "Set up fees" },
  { key: "gateway", label: "Payment gateway", module: "settings", href: "/settings/payment-gateways", sub: "Connect Razorpay so parents can pay online. You need your Razorpay key ID and secret.", time: "10 minutes", button: "Connect Razorpay", optional: true },
  { key: "messaging", label: "SMS and WhatsApp", module: "settings", href: "/settings/messaging", sub: "Your DLT entity ID and sender header, and the WhatsApp Business number.", time: "15 minutes", button: "Connect" },
  { key: "holidays", label: "Holiday list", module: "events-calendar", href: "/events-calendar", sub: "The year's holidays, so attendance and the Time Table skip them.", time: "5 minutes", button: "Add holidays" },
  { key: "parent-link", label: "Parent Link", module: "communication", href: "/communication/parent-link", sub: "Choose what parents see, then send each guardian their own link.", time: "5 minutes", button: "Set up" },
];

export type StepState = SetupStep & { done: boolean; doneNote: string | null; skipped: boolean; marked: boolean };

/** Works out each visible step from the records (and what was marked by hand). */
export async function setupSteps(tx: Tx, ctx: SchoolContext, v: Pick<Viewer, "permissions" | "modulesOn">): Promise<StepState[]> {
  // Steps are for the School Admin and Principal; module visibility follows the school, not the person.
  const shown = SETUP_STEPS.filter((s) => moduleOpen({ permissions: v.permissions, modulesOn: v.modulesOn }, s.module));
  const year = await currentYear(tx, ctx);
  const [school, terms, slots, classes, sections, subjects, staff, staffWithLogin, students, guardians, gateways, channels, links, marks, feeClasses, holidays] = await Promise.all([
    tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true, address: true, logoUrl: true, logoFileId: true, board: true } }),
    year ? tx.term.count({ where: { academicYearId: year.id, archivedAt: null } }) : 0,
    tx.periodSlot.count({ where: { archivedAt: null } }),
    year ? tx.schoolClass.count({ where: { archivedAt: null, sections: { some: { academicYearId: year.id, archivedAt: null } } } }) : 0,
    year ? tx.section.count({ where: { academicYearId: year.id, archivedAt: null } }) : 0,
    tx.subject.count({ where: { archivedAt: null } }),
    tx.staff.count({ where: { archivedAt: null, status: "ACTIVE" } }),
    tx.staff.findMany({ where: { archivedAt: null, status: "ACTIVE", userLoginId: { not: null } }, select: { userLoginId: true } }),
    tx.student.count({ where: { archivedAt: null, status: { in: ["ADMITTED", "ACTIVE", "PROMOTED"] } } }),
    tx.guardian.count({ where: { archivedAt: null } }),
    tx.paymentGatewayAccount.count({ where: { archivedAt: null, isActive: true } }),
    tx.messagingChannel.findMany({ where: { channel: { in: ["sms", "whatsapp"] }, isOn: true }, select: { channel: true } }),
    tx.parentLink.count({ where: { status: "ACTIVE" } }),
    tx.setupStepStatus.findMany({ where: { archivedAt: null } }),
    year ? tx.feeStructure.findMany({ where: { academicYearId: year.id, status: "PUBLISHED", archivedAt: null }, select: { classId: true }, distinct: ["classId"] }) : [],
    // Holidays and vacations typed in Events & Calendar (Calendar Entry) for this year.
    year ? tx.calendarEntry.count({ where: { academicYearId: year.id, type: { in: ["holiday", "vacation"] }, archivedAt: null } }) : 0,
  ]);
  const signedIn = staffWithLogin.length
    ? await tx.userLogin.count({ where: { id: { in: staffWithLogin.map((s) => s.userLoginId!) }, lastSignInAt: { not: null } } })
    : 0;

  const auto: Record<string, string | null> = {
    profile: school?.address && (school.logoUrl || school.logoFileId) ? [school.name, school.board, "logo added"].filter(Boolean).join(" · ") : null,
    year: year && terms > 0 && slots > 0 ? `${year.name} · ${plural(terms, "term")} · ${plural(slots, "period")}` : null,
    classes: sections > 0 ? `${plural(classes, "class", "classes")}, ${plural(sections, "section")}` : null,
    subjects: subjects > 0 ? plural(subjects, "subject") : null,
    staff: staffWithLogin.length > 0 ? `${plural(staff, "staff member")}, ${n(signedIn)} ${signedIn === 1 ? "has" : "have"} signed in` : null,
    students: students > 0 ? `${plural(students, "student")}, ${plural(guardians, "parent")}` : null,
    fees: feeClasses.length ? `${plural(feeClasses.length, "class", "classes")} with a published fee structure` : null,
    gateway: gateways > 0 ? plural(gateways, "gateway") + " connected" : null,
    messaging: channels.length ? channels.map((c) => (c.channel === "sms" ? "SMS" : "WhatsApp")).join(" and ") + " connected" : null,
    holidays: holidays > 0 ? `${plural(holidays, "holiday or vacation", "holidays and vacations")} in ${year!.name}` : null,
    "parent-link": links > 0 ? `${plural(links, "parent")} have their link` : null,
  };
  return shown.map((s) => {
    const mark = marks.find((m) => m.stepKey === s.key);
    const note = auto[s.key];
    const doneByHand = mark?.status === "DONE";
    return { ...s, done: Boolean(note) || doneByHand, doneNote: note ?? (doneByHand ? "Marked done" : null), skipped: !note && mark?.status === "SKIPPED" && Boolean(s.optional), marked: Boolean(mark) };
  });
}

export function setupProgress(steps: StepState[]) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done && !s.skipped) ?? null;
  return { done, total: steps.length, next, complete: steps.every((s) => s.done || s.skipped) };
}

export class SetupProblem extends Error {}

/** Marks a step done, or skips an optional one. Undo puts it back. */
export async function markStep(tx: Tx, ctx: SchoolContext, key: string, status: "DONE" | "SKIPPED") {
  const step = SETUP_STEPS.find((s) => s.key === key);
  if (!step) throw new SetupProblem("That setup step does not exist.");
  if (status === "SKIPPED" && !step.optional) throw new SetupProblem(`${step.label} cannot be skipped. It is needed before the school starts.`);
  const before = await tx.setupStepStatus.findUnique({ where: { schoolId_stepKey: { schoolId: ctx.schoolId, stepKey: key } } });
  const row = await tx.setupStepStatus.upsert({
    where: { schoolId_stepKey: { schoolId: ctx.schoolId, stepKey: key } },
    create: { schoolId: ctx.schoolId, stepKey: key, status, markedById: ctx.userId },
    update: { status, markedById: ctx.userId, markedAt: new Date(), archivedAt: null },
  });
  await writeAudit(tx, ctx, { action: status === "DONE" ? "setup step marked done" : "setup step skipped", recordType: "Setup Step Status", recordId: row.id, before: before && !before.archivedAt ? { status: before.status } : null, after: { step: step.label, status } });
  return row;
}

/** Takes back a hand-made mark (Undo). */
export async function unmarkStep(tx: Tx, ctx: SchoolContext, id: string) {
  const row = await tx.setupStepStatus.findFirst({ where: { id, archivedAt: null } });
  if (!row) return null;
  await tx.setupStepStatus.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "setup step mark taken back", recordType: "Setup Step Status", recordId: id, before: { status: row.status }, after: null });
  return row;
}
