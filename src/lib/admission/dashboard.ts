// Admission Dashboard (02 §2): the headline numbers, where everyone is now
// (count at each stage, new this week, oldest waiting), the pipeline board
// whose cards move one step at a time, and seats left for new joiners.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { CLOSED_STATUSES, label, stageOn, type Settings } from "./settings";
import { enquiryScope, type Viewer } from "./access";
import { progressOf } from "./documents";
import { classRules } from "./settings";
import { seatsFor } from "./seats";
import type { Filters } from "./reports";

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
  return { AND: [enquiryScope(v)], archivedAt: null, academicYearId: f.yearId, ...(f.classId ? { classId: f.classId } : {}), ...(f.source ? { firstSource: f.source } : {}), ...(f.ownerStaffId ? { ownerStaffId: f.ownerStaffId } : {}), ...(f.campusId ? { campusId: f.campusId } : {}) };
}
function appWhere(f: Filters): Prisma.ApplicationWhereInput {
  const enquiry: Prisma.EnquiryWhereInput = { ...(f.source ? { firstSource: f.source } : {}), ...(f.ownerStaffId ? { ownerStaffId: f.ownerStaffId } : {}) };
  return { archivedAt: null, academicYearId: f.yearId, ...(f.classId ? { classId: f.classId } : {}), ...(f.campusId ? { campusId: f.campusId } : {}), ...(Object.keys(enquiry).length ? { enquiry } : {}) };
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
  const yearQ = `year=${f.yearId}`;
  const [eCount, eWeek, eOld] = await Promise.all([
    tx.enquiry.count({ where: e }),
    tx.enquiry.count({ where: { ...e, createdAt: { gte: week } } }),
    tx.enquiry.findFirst({ where: e, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const stageName = (key: string, fallback: string) => s.stageList.find((x) => x.key === key)?.label ?? fallback;
  const rows: StageRow[] = [{ key: "enq", label: stageName("enquiry", "Enquiry"), count: eCount, week: eWeek, oldest: eOld?.createdAt ?? null, href: `/admission-management/enquiries?${yearQ}` }];
  if (v.see !== "all") return rows;
  const base = appWhere(f);
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

export type PipeCard = { id: string; name: string; cls: string; meta: string; href: string };
export type PipeColumn = { key: ColumnKey; label: string; count: number; cards: PipeCard[]; href: string };

/** The pipeline board: the first few cards of each column, oldest waiting first. */
export async function pipeline(tx: Tx, s: Settings, v: Viewer, f: Filters, names: { classes: Map<string, string>; staff: Map<string, string> }, take = 3): Promise<PipeColumn[]> {
  const cls = (id: string | null) => (id ? names.classes.get(id) ?? "" : "Class not set");
  const cols = boardColumns(s);
  const e: Prisma.EnquiryWhereInput = { ...enquiryWhere(f, v), status: { notIn: [...CLOSED_STATUSES] } };
  const [eRows, eCount] = await Promise.all([tx.enquiry.findMany({ where: e, take, orderBy: { createdAt: "desc" } }), tx.enquiry.count({ where: e })]);
  const out: PipeColumn[] = [{
    key: "enq", label: "Enquiries", count: eCount, href: `/admission-management/enquiries?year=${f.yearId}`,
    cards: eRows.map((r) => ({ id: r.id, name: r.childName, cls: cls(r.classId), meta: `${label(s.sourceList, r.source)} · ${r.ownerStaffId ? names.staff.get(r.ownerStaffId) ?? "" : label(s.statusList, r.status)}`, href: `/admission-management/enquiries?id=${r.id}` })),
  }];
  if (v.see !== "all") return out;
  const base = appWhere(f);
  const rules = await classRules(tx);
  for (const c of cols.filter((c) => c.key !== "enq")) {
    const where = { ...base, ...stageWhere(c.key, s) };
    const [rows, count] = await Promise.all([
      tx.application.findMany({
        where, take, orderBy: c.key === "done" ? { admittedAt: "desc" } : { createdAt: "asc" },
        include: { documents: { select: { docType: true, status: true } }, payments: { where: { status: "CONFIRMED", cancelledAt: null }, select: { amountPaise: true } }, interviews: { where: { cancelledAt: null }, orderBy: { startsAt: "desc" }, take: 1 }, tests: { where: { archivedAt: null }, include: { test: true }, take: 1 } },
      }),
      tx.application.count({ where }),
    ]);
    out.push({
      key: c.key, label: c.label, count, href: c.key === "done" ? `/admission-management/applications?year=${f.yearId}&stage=ADMITTED` : c.key === "appr" ? "/admission-management/decision" : c.key === "docs" ? "/admission-management/documents" : c.key === "test" || c.key === "int" ? `/admission-management/tests${c.key === "int" ? "?tab=interviews" : ""}` : `/admission-management/applications?year=${f.yearId}`,
      cards: rows.map((r) => {
        const p = progressOf(r.documents, rules.get(r.classId)?.documents ?? []);
        const paid = r.payments.reduce((x, y) => x + y.amountPaise, BigInt(0));
        let meta: string = r.applicationNo;
        if (c.key === "app") meta = r.feeDuePaise && paid < r.feeDuePaise && stageOn(s, "payment") ? "Fee not paid" : r.stage === "SUBMITTED_ONLINE" ? "Submitted online" : r.stage === "REVIEWED" ? "Reviewed" : "Not reviewed yet";
        if (c.key === "docs") meta = `${p.requiredVerified} of ${p.required} verified`;
        if (c.key === "test") meta = r.tests[0] ? (r.tests[0].marks !== null ? `Scored ${Number(r.tests[0].marks)} of ${r.tests[0].test.maxMarks}` : "Test booked") : "No test booked";
        if (c.key === "int") meta = r.interviews[0] ? "Interview booked" : "No interview booked";
        if (c.key === "appr") meta = r.stage === "APPROVED" ? "Approved · confirm admission" : r.approvalId ? "With the Principal" : "Ready for decision";
        if (c.key === "done") meta = r.applicationNo;
        return { id: r.id, name: r.fullName, cls: cls(r.classId), meta, href: `/admission-management/applications/${r.id}` };
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
  const a = appWhere(f);
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
    seatsFor(tx, f.yearId, f.classId ? [f.classId] : undefined),
  ]);
  // Seats for new joiners: those already taken by new admissions, held for approved children, and still free.
  let free = 0;
  for (const c of seats.values()) free += c.free + c.held;
  return { enquiries, enqWeek, enqOpen, overdue, today, applications, waiting, admitted, seats: free + admitted };
}
