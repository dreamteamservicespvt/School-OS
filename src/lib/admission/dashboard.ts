// Admission Dashboard (02 §2): the headline numbers, where everyone is now
// (count at each stage, new this week, oldest waiting), the people at each
// step with their next step (the pipeline), and seats left for new joiners.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { CLOSED_STATUSES, stageOn, type Settings } from "./settings";
import { applicationScope, enquiryScope, type Viewer } from "./access";
import { progressOf } from "./documents";
import { classRules } from "./settings";
import { seatsFor } from "./seats";
import { yearParam, yearWhere, type Filters } from "./reports";
import { formatDate } from "../format";
import type { MessageKey, Vars } from "../i18n/t";

const DAY = 86_400_000;

export const BOARD_COLUMNS = [
  { key: "enq", label: "Enquiries" },
  { key: "app", label: "Applications" },
  { key: "docs", label: "Documents" },
  { key: "test", label: "Tests" },
  { key: "int", label: "Interviews" },
  { key: "appr", label: "Approvals" },
  { key: "done", label: "Admitted" },
] as const;
export type ColumnKey = (typeof BOARD_COLUMNS)[number]["key"];

/** The columns this school uses: tests and interviews only when switched on. */
export function boardColumns(s: Settings) {
  return BOARD_COLUMNS.filter((c) => (c.key === "test" ? stageOn(s, "test") : c.key === "int" ? stageOn(s, "interview") : c.key === "docs" ? stageOn(s, "documents") : true));
}

function enquiryWhere(f: Filters, v: Viewer): Prisma.EnquiryWhereInput {
  return { AND: [enquiryScope(v)], archivedAt: null, academicYearId: yearWhere(f.yearId), ...(f.classId ? { classId: f.classId } : {}), ...(f.source ? { firstSource: f.source } : {}), ...(f.ownerStaffId ? { ownerStaffId: f.ownerStaffId } : {}), ...(f.campusId ? { campusId: f.campusId } : {}), ...(f.created ? { createdAt: f.created } : {}) };
}
/** Applications for the filters, within the viewer's campus when they are limited to one. */
function appWhere(f: Filters, v: Viewer): Prisma.ApplicationWhereInput {
  const enquiry: Prisma.EnquiryWhereInput = { ...(f.source ? { firstSource: f.source } : {}), ...(f.ownerStaffId ? { ownerStaffId: f.ownerStaffId } : {}) };
  return { AND: [applicationScope(v)], archivedAt: null, academicYearId: yearWhere(f.yearId), ...(f.classId ? { classId: f.classId } : {}), ...(f.campusId ? { campusId: f.campusId } : {}), ...(f.created ? { createdAt: f.created } : {}), ...(Object.keys(enquiry).length ? { enquiry } : {}) };
}

/** Applications in Test & Interview with an interview booked and no outcome yet are "at the interview"; the rest are at the test. */
const atInterview: Prisma.ApplicationWhereInput = { stage: "TEST_INTERVIEW", interviews: { some: { cancelledAt: null, outcome: null } } };
const atTest: Prisma.ApplicationWhereInput = { stage: "TEST_INTERVIEW", interviews: { none: { cancelledAt: null, outcome: null } } };

function stageWhere(key: ColumnKey, s: Settings): Prisma.ApplicationWhereInput {
  const tests = stageOn(s, "test");
  const interviews = stageOn(s, "interview");
  switch (key) {
    case "app": return { stage: { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED"] } };
    case "docs": return { stage: "DOCUMENTS" };
    case "test": return interviews ? atTest : { stage: "TEST_INTERVIEW" };
    case "int": return tests ? atInterview : { stage: "TEST_INTERVIEW" };
    case "appr": return { stage: { in: ["DECISION", "APPROVED"] } };
    case "done": return { stage: "ADMITTED", studentId: { not: null } };
    default: return {};
  }
}

export type StageRow = { key: ColumnKey; label: string; count: number; week: number; oldest: Date | null; href: string };

/** Where everyone is now: how many are at each step, how many arrived this week and the oldest one waiting. */
export async function whereNow(tx: Tx, s: Settings, v: Viewer, f: Filters, now = new Date()): Promise<StageRow[]> {
  const week = new Date(now.getTime() - 7 * DAY);
  const e: Prisma.EnquiryWhereInput = { ...enquiryWhere(f, v), status: { notIn: [...CLOSED_STATUSES] } };
  const yearQ = new URLSearchParams(yearParam(f.yearId)).toString();
  const [eCount, eWeek, eOld] = await Promise.all([
    tx.enquiry.count({ where: e }),
    tx.enquiry.count({ where: { ...e, createdAt: { gte: week } } }),
    tx.enquiry.findFirst({ where: e, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const stageName = (key: string, fallback: string) => s.stageList.find((x) => x.key === key)?.label ?? fallback;
  const rows: StageRow[] = [{ key: "enq", label: stageName("enquiry", "Enquiry"), count: eCount, week: eWeek, oldest: eOld?.createdAt ?? null, href: `/admission-management/enquiries?${yearQ}` }];
  if (v.see !== "all") return rows;
  const base = appWhere(f, v);
  const hrefs: Record<ColumnKey, string> = {
    enq: "", app: `/admission-management/applications?${yearQ}&stage=new`, docs: `/admission-management/documents?${yearQ}`, test: `/admission-management/tests?${yearQ}`,
    int: `/admission-management/tests?${yearQ}&tab=interviews`, appr: `/admission-management/decision?${yearQ}`, done: `/admission-management/applications?${yearQ}&stage=ADMITTED`,
  };
  const labels: Record<ColumnKey, string> = { enq: "", app: stageName("application", "Application"), docs: stageName("documents", "Documents"), test: stageName("test", "Test"), int: stageName("interview", "Interview"), appr: stageName("decision", "Decision"), done: stageName("admitted", "Admitted") };
  for (const c of boardColumns(s).filter((c) => c.key !== "enq")) {
    const where = { ...base, ...stageWhere(c.key, s) };
    const [count, inWeek, old] = await Promise.all([
      tx.application.count({ where }),
      tx.application.count({ where: { ...where, [c.key === "done" ? "admittedAt" : "updatedAt"]: { gte: week } } }),
      c.key === "done" ? Promise.resolve(null) : tx.application.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ]);
    rows.push({ key: c.key, label: labels[c.key], count, week: inWeek, oldest: old?.createdAt ?? null, href: hrefs[c.key] });
  }
  return rows;
}

/** One plain fact on a card (the words are catalogue keys, so each screen says them in its language). */
export type PipeFact = { k: MessageKey; vars?: Vars; tone?: "bad" | "warn" | "ok" };
/** The card's next step: move it on with the same checks as the buttons, or open the page where that step is done. */
export type PipeAct = { kind: "move" } | { kind: "link"; k: MessageKey; href: string };
export type PipeCard = { id: string; name: string; cls: string | null; fact: PipeFact; href: string; act?: PipeAct };
export type PipeColumn = { key: ColumnKey; label: string; count: number; cards: PipeCard[]; href: string };

/** The pipeline board: the first few people at each step (oldest waiting first), each with one useful fact and the next step. */
export async function pipeline(tx: Tx, s: Settings, v: Viewer, f: Filters, names: { classes: Map<string, string>; staff: Map<string, string> }, take = 3, tz = "Asia/Kolkata", now = new Date()): Promise<PipeColumn[]> {
  const cls = (id: string | null) => (id ? names.classes.get(id) ?? null : null);
  const yearQ = new URLSearchParams(yearParam(f.yearId)).toString();
  const cols = boardColumns(s);
  const e: Prisma.EnquiryWhereInput = { ...enquiryWhere(f, v), status: { notIn: [...CLOSED_STATUSES] } };
  const [eRows, eCount] = await Promise.all([tx.enquiry.findMany({ where: e, take, orderBy: { createdAt: "desc" } }), tx.enquiry.count({ where: e })]);
  const out: PipeColumn[] = [{
    key: "enq", label: "Enquiries", count: eCount, href: `/admission-management/enquiries?${yearQ}`,
    cards: eRows.map((r) => {
      const due = r.nextFollowUpAt;
      const fact: PipeFact = due
        ? due < now ? { k: "Follow-up overdue, was due {date}", vars: { date: formatDate(due, tz) }, tone: "bad" } : { k: "Follow up {date}", vars: { date: formatDate(due, tz) } }
        : { k: "No follow-up set", tone: "warn" };
      return { id: r.id, name: r.childName, cls: cls(r.classId), fact, href: `/admission-management/enquiries?id=${r.id}`, act: { kind: "link", k: "Start application", href: `/admission-management/applications/new?enquiry=${r.id}` } };
    }),
  }];
  if (v.see !== "all") return out;
  const base = appWhere(f, v);
  const rules = await classRules(tx);
  for (const [ci, c] of cols.entries()) {
    if (c.key === "enq") continue;
    const next = cols[ci + 1]?.key;
    const where = { ...base, ...stageWhere(c.key, s) };
    const [rows, count] = await Promise.all([
      tx.application.findMany({
        where, take, orderBy: c.key === "done" ? { admittedAt: "desc" } : { createdAt: "asc" },
        include: { documents: { select: { docType: true, status: true } }, payments: { where: { status: "CONFIRMED", cancelledAt: null }, select: { amountPaise: true } }, interviews: { where: { cancelledAt: null }, orderBy: { startsAt: "desc" }, take: 1 }, tests: { where: { archivedAt: null }, include: { test: true }, take: 1 } },
      }),
      tx.application.count({ where }),
    ]);
    out.push({
      key: c.key, label: c.label, count, href: c.key === "done" ? `/admission-management/applications?${new URLSearchParams({ ...yearParam(f.yearId), stage: "ADMITTED" })}` : c.key === "appr" ? "/admission-management/decision" : c.key === "docs" ? "/admission-management/documents" : c.key === "test" || c.key === "int" ? `/admission-management/tests${c.key === "int" ? "?tab=interviews" : ""}` : `/admission-management/applications?${yearQ}`,
      cards: rows.map((r) => {
        const p = progressOf(r.documents, rules.get(r.classId)?.documents ?? []);
        const paid = r.payments.reduce((x, y) => x + y.amountPaise, BigInt(0));
        let fact: PipeFact = { k: "Not reviewed yet" };
        // Moving on: the same move (and checks) as before; where that move is always refused, the page that does the step.
        let act: PipeAct | undefined = next ? { kind: "move" } : undefined;
        if (c.key === "app") fact = r.feeDuePaise && paid < r.feeDuePaise && stageOn(s, "payment") ? { k: "Fee not paid", tone: "warn" } : r.stage === "SUBMITTED_ONLINE" ? { k: "Submitted online" } : r.stage === "REVIEWED" ? { k: "Reviewed" } : { k: "Not reviewed yet" };
        if (c.key === "docs") fact = p.required ? { k: "{done} of {total} documents checked", vars: { done: p.requiredVerified, total: p.required }, tone: p.requiredVerified < p.required ? "warn" : "ok" } : { k: "No documents needed" };
        if (c.key === "test") fact = r.tests[0] ? (r.tests[0].marks !== null ? { k: "Scored {marks} of {max}", vars: { marks: Number(r.tests[0].marks), max: r.tests[0].test.maxMarks } } : { k: "Test booked" }) : { k: "No test booked", tone: "warn" };
        if (c.key === "test" && next === "int") act = { kind: "link", k: "Book interview", href: "/admission-management/tests?tab=interviews" };
        if (c.key === "int") fact = r.interviews[0] ? { k: "Interview booked" } : { k: "No interview booked", tone: "warn" };
        if (c.key === "appr") {
          fact = r.stage === "APPROVED" ? { k: "Approved", tone: "ok" } : r.approvalId ? { k: "Waiting for approval" } : { k: "Ready for decision" };
          act = r.stage === "APPROVED"
            ? { kind: "link", k: "Confirm admission", href: `/admission-management/decision?tab=approved&focus=${r.id}` }
            : { kind: "link", k: "Decide", href: `/admission-management/decision?focus=${r.id}` };
        }
        if (c.key === "done") fact = r.admittedAt ? { k: "Admitted on {date}", vars: { date: formatDate(r.admittedAt, tz) }, tone: "ok" } : { k: "Admitted" };
        return { id: r.id, name: r.fullName, cls: cls(r.classId), fact, href: `/admission-management/applications/${r.id}`, act };
      }),
    });
  }
  return out;
}

/** Headline numbers for the band at the top. */
export async function headline(tx: Tx, v: Viewer, f: Filters, dayStart: Date, now = new Date()) {
  const week = new Date(now.getTime() - 7 * DAY);
  const e = enquiryWhere(f, v);
  const open: Prisma.EnquiryWhereInput = { ...e, status: { notIn: [...CLOSED_STATUSES] } };
  const a = appWhere(f, v);
  const [enquiries, enqWeek, enqOpen, overdue, today] = await Promise.all([
    tx.enquiry.count({ where: e }),
    tx.enquiry.count({ where: { ...e, createdAt: { gte: week } } }),
    tx.enquiry.count({ where: open }),
    tx.enquiry.count({ where: { ...open, nextFollowUpAt: { lt: now } } }),
    tx.enquiry.count({ where: { ...open, nextFollowUpAt: { gte: now, lt: new Date(dayStart.getTime() + DAY) } } }),
  ]);
  if (v.see !== "all") return { enquiries, enqWeek, enqOpen, overdue, today, applications: 0, waiting: 0, admitted: 0, seats: 0 };
  const [applications, waiting, admitted, seats] = await Promise.all([
    tx.application.count({ where: a }),
    tx.application.count({ where: { ...a, stage: "DECISION" } }),
    tx.application.count({ where: { ...a, stage: "ADMITTED", studentId: { not: null } } }),
    // Each campus's year has its own sections and seats.
    Promise.all((Array.isArray(f.yearId) ? f.yearId : [f.yearId]).map((y) => seatsFor(tx, y, f.classId ? [f.classId] : undefined))),
  ]);
  // Seats for new joiners: those already taken by new admissions, held for approved children, and still free.
  let free = 0;
  for (const m of seats) for (const c of m.values()) free += c.free + c.held;
  return { enquiries, enqWeek, enqOpen, overdue, today, applications, waiting, admitted, seats: free + admitted };
}
