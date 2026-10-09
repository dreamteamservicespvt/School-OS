// Admission Dashboard numbers and Admission Reports (02 §2, §7): the funnel
// with counts, change since last week and oldest item, the pipeline board,
// and the reports: lead pipeline, sources, conversion, average processing
// time, pending applications, follow-ups and loss reasons. Every report is a
// plain table, so the screen and the Excel, CSV and PDF exports match.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { formatDate } from "../format";
import { CLOSED_STATUSES, classRules, label, stageOn, type Settings } from "./settings";
import { progressOf } from "./documents";
import { stageLabel, OPEN_STAGES } from "./applications";
import { enquiryScope, type Viewer } from "./access";

export type Filters = { yearId: string; classId?: string | null; source?: string | null; ownerStaffId?: string | null; campusId?: string | null };

const DAY = 86_400_000;

function enquiryBase(f: Filters, v: Viewer): Prisma.EnquiryWhereInput {
  return { AND: [enquiryScope(v)], archivedAt: null, academicYearId: f.yearId, ...(f.classId ? { classId: f.classId } : {}), ...(f.source ? { firstSource: f.source } : {}), ...(f.ownerStaffId ? { ownerStaffId: f.ownerStaffId } : {}), ...(f.campusId ? { campusId: f.campusId } : {}) };
}

function appBase(f: Filters): Prisma.ApplicationWhereInput {
  return { archivedAt: null, academicYearId: f.yearId, ...(f.classId ? { classId: f.classId } : {}), ...(f.source ? { enquiry: { firstSource: f.source } } : {}), ...(f.ownerStaffId ? { enquiry: { ownerStaffId: f.ownerStaffId } } : {}), ...(f.campusId ? { campusId: f.campusId } : {}) };
}

export type FunnelStage = { key: string; label: string; count: number; lastWeek: number; oldest: Date | null; href: string };

export async function funnel(tx: Tx, s: Settings, v: Viewer, f: Filters, now = new Date()): Promise<FunnelStage[]> {
  const week = new Date(now.getTime() - 7 * DAY);
  const e = enquiryBase(f, v);
  const a = appBase(f);
  const q = (extra: Record<string, string>) => `/admission-management/applications?${new URLSearchParams({ year: f.yearId, ...(f.classId ? { class: f.classId } : {}), ...extra })}`;
  const out: FunnelStage[] = [];
  const [eCount, eWeek, eOldest] = await Promise.all([
    tx.enquiry.count({ where: e }),
    tx.enquiry.count({ where: { ...e, createdAt: { gte: week } } }),
    tx.enquiry.findFirst({ where: { ...e, status: { notIn: [...CLOSED_STATUSES] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  out.push({ key: "enquiry", label: s.stageList.find((x) => x.key === "enquiry")!.label, count: eCount, lastWeek: eWeek, oldest: eOldest?.createdAt ?? null, href: `/admission-management/enquiries?${new URLSearchParams({ year: f.yearId, ...(f.classId ? { class: f.classId } : {}) })}` });
  if (v.see !== "all") return out;
  const [aCount, aWeek, aOldest] = await Promise.all([
    tx.application.count({ where: a }),
    tx.application.count({ where: { ...a, createdAt: { gte: week } } }),
    tx.application.findFirst({ where: { ...a, stage: { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  out.push({ key: "application", label: s.stageList.find((x) => x.key === "application")!.label, count: aCount, lastWeek: aWeek, oldest: aOldest?.createdAt ?? null, href: q({}) });
  if (stageOn(s, "documents")) {
    const [done, week1, oldest] = await Promise.all([
      tx.application.count({ where: { ...a, documents: { none: { required: true, status: { not: "VERIFIED" } } } } }),
      tx.application.count({ where: { ...a, documents: { none: { required: true, status: { not: "VERIFIED" } }, some: { verifiedAt: { gte: week } } } } }),
      tx.application.findFirst({ where: { ...a, stage: "DOCUMENTS" }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
    ]);
    out.push({ key: "documents", label: s.stageList.find((x) => x.key === "documents")!.label, count: done, lastWeek: week1, oldest: oldest?.updatedAt ?? null, href: q({ docs: "complete" }) });
  }
  if (stageOn(s, "payment")) {
    const [paid, week1] = await Promise.all([
      tx.application.count({ where: { ...a, OR: [{ feeDuePaise: null }, { payments: { some: { status: "CONFIRMED", cancelledAt: null } } }] } }),
      tx.application.count({ where: { ...a, payments: { some: { status: "CONFIRMED", cancelledAt: null, confirmedAt: { gte: week } } } } }),
    ]);
    out.push({ key: "payment", label: s.stageList.find((x) => x.key === "payment")!.label, count: paid, lastWeek: week1, oldest: null, href: q({ fee: "paid" }) });
  }
  if (stageOn(s, "test")) {
    const [n, w] = await Promise.all([
      tx.application.count({ where: { ...a, tests: { some: { archivedAt: null, OR: [{ marks: { not: null } }, { absent: true }] } } } }),
      tx.application.count({ where: { ...a, tests: { some: { archivedAt: null, scoredAt: { gte: week } } } } }),
    ]);
    const oldest = await tx.application.findFirst({ where: { ...a, stage: "TEST_INTERVIEW" }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } });
    out.push({ key: "test", label: s.stageList.find((x) => x.key === "test")!.label, count: n, lastWeek: w, oldest: oldest?.updatedAt ?? null, href: q({ stage: "TEST_INTERVIEW" }) });
  }
  if (stageOn(s, "interview")) {
    const [n, w] = await Promise.all([
      tx.application.count({ where: { ...a, interviews: { some: { cancelledAt: null, outcome: { not: null } } } } }),
      tx.application.count({ where: { ...a, interviews: { some: { cancelledAt: null, outcome: { not: null }, updatedAt: { gte: week } } } } }),
    ]);
    out.push({ key: "interview", label: s.stageList.find((x) => x.key === "interview")!.label, count: n, lastWeek: w, oldest: null, href: "/admission-management/tests?tab=interviews" });
  }
  const decided: Prisma.ApplicationWhereInput = { ...a, stage: { in: ["APPROVED", "REJECTED", "WAITING_LIST", "ADMITTED"] } };
  const [dCount, dWeek, dOldest] = await Promise.all([
    tx.application.count({ where: decided }),
    tx.application.count({ where: { ...decided, decidedAt: { gte: week } } }),
    tx.application.findFirst({ where: { ...a, stage: "DECISION" }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
  ]);
  out.push({ key: "decision", label: s.stageList.find((x) => x.key === "decision")!.label, count: dCount, lastWeek: dWeek, oldest: dOldest?.updatedAt ?? null, href: "/admission-management/decision" });
  const [adm, admWeek, waiting] = await Promise.all([
    tx.application.count({ where: { ...a, stage: "ADMITTED", studentId: { not: null } } }),
    tx.application.count({ where: { ...a, stage: "ADMITTED", admittedAt: { gte: week } } }),
    tx.application.findFirst({ where: { ...a, stage: "APPROVED" }, orderBy: { decidedAt: "asc" }, select: { decidedAt: true } }),
  ]);
  out.push({ key: "admitted", label: s.stageList.find((x) => x.key === "admitted")!.label, count: adm, lastWeek: admWeek, oldest: waiting?.decidedAt ?? null, href: q({ stage: "ADMITTED" }) });
  return out;
}

export type BoardColumn = { key: string; label: string; count: number; cards: { id: string; kind: "enquiry" | "application"; title: string; meta: string; href: string; stage?: string }[]; accepts: string[] };

/** The pipeline board: cards by stage. A card dragged to the next column moves with the same checks as the buttons. */
export async function board(tx: Tx, s: Settings, v: Viewer, f: Filters, classNames: Map<string, string>): Promise<BoardColumn[]> {
  const take = 12;
  const e: Prisma.EnquiryWhereInput = { ...enquiryBase(f, v), status: { notIn: [...CLOSED_STATUSES] } };
  const [eRows, eCount] = await Promise.all([tx.enquiry.findMany({ where: e, take, orderBy: { nextFollowUpAt: { sort: "asc", nulls: "last" } } }), tx.enquiry.count({ where: e })]);
  const cols: BoardColumn[] = [{
    key: "enquiry", label: "Enquiries", count: eCount, accepts: [],
    cards: eRows.map((r) => ({ id: r.id, kind: "enquiry", title: r.childName, meta: `${r.classId ? classNames.get(r.classId) ?? "" : "Class not set"} · ${label(s.statusList, r.status)}`, href: `/admission-management/enquiries/${r.id}` })),
  }];
  if (v.see !== "all") return cols;
  const a = appBase(f);
  const col = async (key: string, title: string, stages: Prisma.ApplicationWhereInput["stage"], accepts: string[]) => {
    const where = { ...a, stage: stages };
    const [rows, count] = await Promise.all([tx.application.findMany({ where, take, orderBy: { updatedAt: "asc" } }), tx.application.count({ where })]);
    cols.push({ key, label: title, count, accepts, cards: rows.map((r) => ({ id: r.id, kind: "application", title: r.fullName, meta: `${classNames.get(r.classId) ?? ""} · ${r.applicationNo}`, href: `/admission-management/applications/${r.id}`, stage: r.stage })) });
  };
  await col("application", "Applications", { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED"] }, ["enquiry"]);
  if (stageOn(s, "documents")) await col("documents", "Documents", "DOCUMENTS", ["application", "tests"]);
  if (stageOn(s, "test") || stageOn(s, "interview")) await col("tests", "Tests & interviews", "TEST_INTERVIEW", ["application", "documents"]);
  await col("approvals", "Approvals", "DECISION", ["application", "documents", "tests"]);
  await col("conversion", "Conversion", "APPROVED", []);
  return cols;
}

/** Today's follow-ups: overdue, due today, due tomorrow. */
export async function followUps(tx: Tx, v: Viewer, f: Filters, dayStart: Date, now = new Date()) {
  const e: Prisma.EnquiryWhereInput = { ...enquiryBase(f, v), status: { notIn: [...CLOSED_STATUSES] } };
  const pick = { id: true, childName: true, parentName: true, phone: true, nextFollowUpAt: true, nextAction: true, ownerStaffId: true } as const;
  const [overdue, today, tomorrow, overdueCount] = await Promise.all([
    tx.enquiry.findMany({ where: { ...e, nextFollowUpAt: { lt: now } }, orderBy: { nextFollowUpAt: "asc" }, take: 8, select: pick }),
    tx.enquiry.findMany({ where: { ...e, nextFollowUpAt: { gte: now, lt: new Date(dayStart.getTime() + DAY) } }, orderBy: { nextFollowUpAt: "asc" }, take: 8, select: pick }),
    tx.enquiry.findMany({ where: { ...e, nextFollowUpAt: { gte: new Date(dayStart.getTime() + DAY), lt: new Date(dayStart.getTime() + 2 * DAY) } }, orderBy: { nextFollowUpAt: "asc" }, take: 8, select: pick }),
    tx.enquiry.count({ where: { ...e, nextFollowUpAt: { lt: now } } }),
  ]);
  return { overdue, today, tomorrow, overdueCount };
}

export type Report = { key: string; title: string; about: string; columns: { key: string; label: string; align?: "right" }[]; rows: Record<string, string | number>[]; headline: string };

export const REPORTS = [
  { key: "pipeline", title: "Lead pipeline", about: "Enquiries at each status, by class and owner." },
  { key: "sources", title: "Sources", about: "Enquiries and admissions by first recorded source, with the conversion rate of each." },
  { key: "conversion", title: "Conversion", about: "Enquiry to application, application to admission, and overall, by class and month." },
  { key: "processing", title: "Average processing time", about: "Days from enquiry to admission and from application to decision." },
  { key: "pending", title: "Pending applications", about: "Applications not yet decided, with age in days and what is missing." },
  { key: "follow-ups", title: "Follow-up report", about: "Follow-ups done, due and overdue, by owner." },
  { key: "loss", title: "Loss reasons", about: "Lost enquiries by reason." },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

const pct = (a: number, b: number) => (b === 0 ? "0%" : `${Math.round((a / b) * 1000) / 10}%`);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((p, x) => p + x, 0) / xs.length) * 10) / 10 : 0);

export async function report(tx: Tx, s: Settings, v: Viewer, key: ReportKey, f: Filters, names: { classes: Map<string, string>; staff: Map<string, string> }, now = new Date()): Promise<Report> {
  const meta = REPORTS.find((r) => r.key === key)!;
  const cls = (id: string | null) => (id ? names.classes.get(id) ?? "?" : "Class not set");
  const owner = (id: string | null) => (id ? names.staff.get(id) ?? "?" : "No owner");
  const e = enquiryBase(f, v);
  const a = appBase(f);

  if (key === "pipeline") {
    const rows = await tx.enquiry.groupBy({ by: ["classId", "ownerStaffId", "status"], where: e, _count: { _all: true } });
    const statuses = s.statusList;
    const groups = new Map<string, Record<string, string | number>>();
    for (const r of rows) {
      const k = `${r.classId}|${r.ownerStaffId}`;
      const row = groups.get(k) ?? { class: cls(r.classId), owner: owner(r.ownerStaffId), total: 0, ...Object.fromEntries(statuses.map((st) => [st.key, 0])) };
      row[r.status] = Number(row[r.status] ?? 0) + r._count._all;
      row.total = Number(row.total) + r._count._all;
      groups.set(k, row);
    }
    const out = [...groups.values()].sort((x, y) => String(x.class).localeCompare(String(y.class)) || String(x.owner).localeCompare(String(y.owner)));
    const total = out.reduce((p, r) => p + Number(r.total), 0);
    return { ...meta, headline: `${total} enquiries`, columns: [{ key: "class", label: "Class" }, { key: "owner", label: "Owner" }, ...statuses.map((st) => ({ key: st.key, label: st.label, align: "right" as const })), { key: "total", label: "Total", align: "right" }], rows: out };
  }

  if (key === "sources") {
    const enquiries = await tx.enquiry.findMany({ where: e, select: { firstSource: true, applications: { where: { archivedAt: null }, select: { stage: true, studentId: true } } } });
    const by = new Map<string, { enquiries: number; applications: number; admitted: number }>();
    for (const q of enquiries) {
      const row = by.get(q.firstSource) ?? { enquiries: 0, applications: 0, admitted: 0 };
      row.enquiries++;
      if (q.applications.length) row.applications++;
      if (q.applications.some((x) => x.stage === "ADMITTED" && x.studentId)) row.admitted++;
      by.set(q.firstSource, row);
    }
    const rows = [...by.entries()].map(([k, r]) => ({ source: label(s.sourceList, k), enquiries: r.enquiries, applications: r.applications, admitted: r.admitted, rate: pct(r.admitted, r.enquiries) })).sort((x, y) => y.enquiries - x.enquiries);
    return { ...meta, headline: `${rows.length} sources`, columns: [{ key: "source", label: "Source (first recorded)" }, { key: "enquiries", label: "Enquiries", align: "right" }, { key: "applications", label: "Applications", align: "right" }, { key: "admitted", label: "Admitted", align: "right" }, { key: "rate", label: "Conversion rate", align: "right" }], rows };
  }

  if (key === "conversion") {
    const [enquiries, apps] = await Promise.all([
      tx.enquiry.findMany({ where: e, select: { classId: true, createdAt: true, applications: { where: { archivedAt: null }, select: { id: true } } } }),
      tx.application.findMany({ where: a, select: { classId: true, createdAt: true, stage: true, studentId: true } }),
    ]);
    const month = (d: Date) => d.toISOString().slice(0, 7);
    const groups = new Map<string, { cls: string; month: string; enquiries: number; withApp: number; applications: number; admitted: number }>();
    const get = (c: string | null, m: string) => {
      const k = `${c}|${m}`;
      const g = groups.get(k) ?? { cls: cls(c), month: m, enquiries: 0, withApp: 0, applications: 0, admitted: 0 };
      groups.set(k, g);
      return g;
    };
    for (const q of enquiries) { const g = get(q.classId, month(q.createdAt)); g.enquiries++; if (q.applications.length) g.withApp++; }
    for (const p of apps) { const g = get(p.classId, month(p.createdAt)); g.applications++; if (p.stage === "ADMITTED" && p.studentId) g.admitted++; }
    const rows = [...groups.values()].sort((x, y) => x.month.localeCompare(y.month) || x.cls.localeCompare(y.cls)).map((g) => ({
      class: g.cls, month: new Date(`${g.month}-01T00:00:00Z`).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }),
      enquiries: g.enquiries, applications: g.applications, admitted: g.admitted, enqToApp: pct(g.withApp, g.enquiries), appToAdm: pct(g.admitted, g.applications), overall: pct(g.admitted, g.enquiries),
    }));
    const admitted = apps.filter((p) => p.stage === "ADMITTED" && p.studentId).length;
    return { ...meta, headline: `${admitted} admitted from ${apps.length} applications and ${enquiries.length} enquiries (${pct(admitted, enquiries.length)} overall)`, columns: [{ key: "class", label: "Class" }, { key: "month", label: "Month" }, { key: "enquiries", label: "Enquiries", align: "right" }, { key: "applications", label: "Applications", align: "right" }, { key: "admitted", label: "Admitted", align: "right" }, { key: "enqToApp", label: "Enquiry to application", align: "right" }, { key: "appToAdm", label: "Application to admission", align: "right" }, { key: "overall", label: "Overall", align: "right" }], rows };
  }

  if (key === "processing") {
    const apps = await tx.application.findMany({ where: { ...a, OR: [{ admittedAt: { not: null } }, { decidedAt: { not: null } }] }, select: { classId: true, createdAt: true, decidedAt: true, admittedAt: true, enquiry: { select: { createdAt: true } } } });
    const by = new Map<string, { toAdmit: number[]; toDecide: number[] }>();
    for (const p of apps) {
      const g = by.get(p.classId) ?? { toAdmit: [], toDecide: [] };
      if (p.admittedAt) g.toAdmit.push((p.admittedAt.getTime() - (p.enquiry?.createdAt ?? p.createdAt).getTime()) / DAY);
      if (p.decidedAt) g.toDecide.push((p.decidedAt.getTime() - p.createdAt.getTime()) / DAY);
      by.set(p.classId, g);
    }
    const rows = [...by.entries()].map(([c, g]) => ({ class: cls(c), admitted: g.toAdmit.length, toAdmit: avg(g.toAdmit), decided: g.toDecide.length, toDecide: avg(g.toDecide) })).sort((x, y) => x.class.localeCompare(y.class));
    const all = { toAdmit: avg(apps.filter((p) => p.admittedAt).map((p) => (p.admittedAt!.getTime() - (p.enquiry?.createdAt ?? p.createdAt).getTime()) / DAY)), toDecide: avg(apps.filter((p) => p.decidedAt).map((p) => (p.decidedAt!.getTime() - p.createdAt.getTime()) / DAY)) };
    return { ...meta, headline: `${all.toAdmit} days from enquiry to admission · ${all.toDecide} days from application to decision`, columns: [{ key: "class", label: "Class" }, { key: "admitted", label: "Admitted", align: "right" }, { key: "toAdmit", label: "Days, enquiry to admission", align: "right" }, { key: "decided", label: "Decided", align: "right" }, { key: "toDecide", label: "Days, application to decision", align: "right" }], rows };
  }

  if (key === "pending") {
    const apps = await tx.application.findMany({ where: { ...a, stage: { in: OPEN_STAGES } }, orderBy: { createdAt: "asc" }, include: { documents: true, payments: true } });
    const rules = await classRules(tx);
    const rows = apps.map((p) => {
      const pr = progressOf(p.documents, rules.get(p.classId)?.documents ?? []);
      const missing = [...pr.unverifiedRequired];
      if (p.feeDuePaise && !p.payments.some((x) => x.status === "CONFIRMED" && !x.cancelledAt)) missing.push("Application fee");
      return { number: p.applicationNo, name: p.fullName, class: cls(p.classId), stage: stageLabel(p.stage), submitted: formatDate(p.createdAt), age: Math.floor((now.getTime() - p.createdAt.getTime()) / DAY), missing: missing.join(", ") || "Nothing" };
    });
    return { ...meta, headline: `${rows.length} applications not yet decided`, columns: [{ key: "number", label: "Application no." }, { key: "name", label: "Child's name" }, { key: "class", label: "Class" }, { key: "stage", label: "Stage" }, { key: "submitted", label: "Submitted" }, { key: "age", label: "Age (days)", align: "right" }, { key: "missing", label: "What is missing" }], rows };
  }

  if (key === "follow-ups") {
    const since = new Date(now.getTime() - 30 * DAY);
    const open = await tx.enquiry.groupBy({ by: ["ownerStaffId"], where: { ...e, status: { notIn: [...CLOSED_STATUSES] } }, _count: { _all: true } });
    const overdue = await tx.enquiry.groupBy({ by: ["ownerStaffId"], where: { ...e, status: { notIn: [...CLOSED_STATUSES] }, nextFollowUpAt: { lt: now } }, _count: { _all: true } });
    const done = await tx.enquiryActivity.findMany({ where: { kind: { in: ["call", "follow-up", "note", "message"] }, at: { gte: since }, enquiry: e }, select: { byId: true } });
    const staff = await tx.staff.findMany({ where: { userLoginId: { in: [...new Set(done.map((d) => d.byId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, userLoginId: true } });
    const doneBy = new Map<string, number>();
    for (const d of done) {
      const sid = staff.find((x) => x.userLoginId === d.byId)?.id ?? "none";
      doneBy.set(sid, (doneBy.get(sid) ?? 0) + 1);
    }
    const ids = new Set([...open.map((o) => o.ownerStaffId ?? "none"), ...doneBy.keys()]);
    const rows = [...ids].map((id) => ({ owner: owner(id === "none" ? null : id), open: open.find((o) => (o.ownerStaffId ?? "none") === id)?._count._all ?? 0, overdue: overdue.find((o) => (o.ownerStaffId ?? "none") === id)?._count._all ?? 0, done: doneBy.get(id) ?? 0 })).sort((x, y) => y.overdue - x.overdue || x.owner.localeCompare(y.owner));
    return { ...meta, headline: `${rows.reduce((p, r) => p + r.overdue, 0)} follow-ups overdue`, columns: [{ key: "owner", label: "Owner" }, { key: "open", label: "Open enquiries", align: "right" }, { key: "overdue", label: "Overdue", align: "right" }, { key: "done", label: "Follow-ups done (30 days)", align: "right" }], rows };
  }

  // loss
  const lost = await tx.enquiry.groupBy({ by: ["lostReason"], where: { ...e, status: "lost" }, _count: { _all: true } });
  const total = lost.reduce((p, r) => p + r._count._all, 0);
  const rows = lost.map((r) => ({ reason: label(s.lossList, r.lostReason) || "Not given", count: r._count._all, share: pct(r._count._all, total) })).sort((x, y) => y.count - x.count);
  return { ...meta, headline: `${total} enquiries lost`, columns: [{ key: "reason", label: "Reason" }, { key: "count", label: "Enquiries", align: "right" }, { key: "share", label: "Share", align: "right" }], rows };
}
