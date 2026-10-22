// Admission, staff and HR, communication and front office reports. The
// admission reports are Admission Management's own (report() in
// lib/admission/reports.ts); the others read their module's records.
import "server-only";

import { viewerFor, type ViewerSource } from "../../admission/access";
import { admissionYear, loadSettings } from "../../admission/settings";
import { REPORTS as ADMISSION_REPORTS, report as admissionReport, type ReportKey as AdmissionKey } from "../../admission/reports";
import { names as admissionNames } from "../../admission/choices";
import { formatDate } from "../../format";
import { momentWhere } from "../../periods";
import type { ReportEntry, Row, Table } from "../types";
import { fromAdmission, totalsOf } from "./util";

const AD_LOOK: Record<string, { key: string; name: string; sub: string }> = {
  sources: { key: "ad-funnel", name: "Enquiries to admissions", sub: "How many enquiries became admissions, by where they came from" },
  conversion: { key: "ad-conversion", name: "Conversion by class and month", sub: "Enquiry to application to admission" },
  pipeline: { key: "ad-pipeline", name: "Lead pipeline", sub: "Enquiries at each status, by class and owner" },
  pending: { key: "ad-pending", name: "Pending applications", sub: "Not decided yet, with age in days and what is missing" },
  processing: { key: "ad-processing", name: "Processing time", sub: "Days from enquiry to admission, and application to decision" },
  "follow-ups": { key: "ad-follow-ups", name: "Follow-ups", sub: "Done, due and overdue, by owner" },
  loss: { key: "ad-loss", name: "Loss reasons", sub: "Lost enquiries by reason" },
};

const ADMISSIONS: ReportEntry[] = Object.keys(AD_LOOK).map((k) => {
  const meta = ADMISSION_REPORTS.find((r) => r.key === k)!;
  const look = AD_LOOK[k];
  const dated = k !== "pending";
  return {
    key: look.key, category: "Admissions", name: look.name, sub: look.sub, byClass: true, dated, fallback: dated ? "acyear" : undefined,
    async run(rc) {
      const v = await viewerFor(rc.tx, rc.ctx, rc.who as unknown as ViewerSource);
      if (v.see !== "all") return { columns: [], rows: [], empty: "Admission reports are for the admission team." };
      const s = await loadSettings(rc.tx, rc.ctx);
      const year = (await admissionYear(rc.tx, rc.ctx, s)) ?? rc.f.year;
      if (!year) return { columns: [], rows: [], empty: "No academic year is set up yet." };
      const created = dated && rc.f.range ? momentWhere(rc.f.range, rc.tz) : null;
      const r = await admissionReport(rc.tx, s, v, meta.key as AdmissionKey, { yearId: year.id, classId: rc.f.classId, campusId: rc.f.campusId, created }, await admissionNames(rc.tx));
      const t = fromAdmission(r);
      t.note = [`Admissions for ${year.name}.`, t.note].filter(Boolean).join(" ");
      return t;
    },
  };
});

const ACTIVE = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;
const STAFF_STATUS: Record<string, string> = { ACTIVE: "Active", ON_LEAVE: "On leave", SUSPENDED: "Suspended", RESIGNED: "Resigned", RETIRED: "Retired", TERMINATED: "Left" };

const STAFF: ReportEntry[] = [
  {
    key: "hr-list", category: "Staff and HR", name: "Staff list", sub: "All staff with department, role and date of joining",
    async run(rc) {
      const staff = await rc.tx.staff.findMany({ where: { archivedAt: null, status: { in: [...ACTIVE] }, ...(rc.f.campusId ? { campusId: rc.f.campusId } : {}) }, include: { department: { select: { name: true } } }, orderBy: [{ fullName: "asc" }] });
      return {
        columns: [{ key: "name", label: "Name" }, { key: "code", label: "Staff ID" }, { key: "dept", label: "Department" }, { key: "role", label: "Designation" }, { key: "type", label: "Type" }, { key: "employment", label: "Employment" }, { key: "joined", label: "Joined", kind: "date" }, { key: "status", label: "Status" }],
        rows: staff.map((s) => ({ name: s.fullName, code: s.staffCode, dept: s.department?.name ?? "", role: s.designation, type: s.staffType, employment: s.employmentType, joined: s.joiningDate, status: STAFF_STATUS[s.status] ?? s.status })),
      };
    },
  },
  {
    key: "hr-leave", category: "Staff and HR", name: "Leave taken", sub: "Days of each kind of leave used by each person", dated: true, fallback: "acyear",
    async run(rc) {
      // One campus: that campus's staff only.
      const onCampus = rc.f.campusId ? (await rc.tx.staff.findMany({ where: { campusId: rc.f.campusId }, select: { id: true } })).map((x) => x.id) : null;
      const [types, leave] = await Promise.all([
        rc.tx.leaveType.findMany({ where: { forWhom: "staff" }, orderBy: { name: "asc" } }),
        rc.tx.leaveRequest.findMany({ where: { staffId: onCampus ? { in: onCampus } : { not: null }, status: "APPROVED", archivedAt: null, fromDate: { lte: rc.f.to }, toDate: { gte: rc.f.from } }, select: { staffId: true, leaveTypeId: true, days: true } }),
      ]);
      const staff = new Map((await rc.tx.staff.findMany({ where: { id: { in: [...new Set(leave.map((l) => l.staffId!))] } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
      const used = types.filter((t) => leave.some((l) => l.leaveTypeId === t.id));
      const by = new Map<string, Row>();
      for (const l of leave) {
        const row = by.get(l.staffId!) ?? { name: staff.get(l.staffId!) ?? "", ...Object.fromEntries(used.map((t) => [t.id, 0])), total: 0 };
        row[l.leaveTypeId] = Number(row[l.leaveTypeId] ?? 0) + Number(l.days);
        row.total = Number(row.total) + Number(l.days);
        by.set(l.staffId!, row);
      }
      const t: Table = { columns: [{ key: "name", label: "Staff" }, ...used.map((x) => ({ key: x.id, label: x.name, kind: "number" as const })), { key: "total", label: "Total days", kind: "number" }], rows: [...by.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))) };
      return { ...t, totals: t.rows.length ? totalsOf(t, "All staff") : null, note: "Approved leave that falls in the dates chosen." };
    },
  },
  {
    key: "hr-moves", category: "Staff and HR", name: "Joiners and leavers", sub: "Who joined and who left in the dates chosen", dated: true, fallback: "acyear",
    async run(rc) {
      const [joined, left] = await Promise.all([
        rc.tx.staff.findMany({ where: { archivedAt: null, joiningDate: { gte: rc.f.from, lte: rc.f.to }, ...(rc.f.campusId ? { campusId: rc.f.campusId } : {}) }, include: { department: { select: { name: true } } } }),
        rc.tx.staff.findMany({ where: { leavingDate: { gte: rc.f.from, lte: rc.f.to }, ...(rc.f.campusId ? { campusId: rc.f.campusId } : {}) }, include: { department: { select: { name: true } } } }),
      ]);
      const rows: Row[] = [
        ...joined.map((s) => ({ name: s.fullName, what: "Joined", date: s.joiningDate, role: s.designation, dept: s.department?.name ?? "", reason: "" })),
        ...left.map((s) => ({ name: s.fullName, what: "Left", date: s.leavingDate, role: s.designation, dept: s.department?.name ?? "", reason: s.leavingReason ?? STAFF_STATUS[s.status] ?? "" })),
      ].sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime());
      return { columns: [{ key: "name", label: "Name" }, { key: "what", label: "Joined or left" }, { key: "date", label: "Date", kind: "date" }, { key: "role", label: "Designation" }, { key: "dept", label: "Department" }, { key: "reason", label: "Reason" }], rows, note: `${joined.length} joined, ${left.length} left.` };
    },
  },
];

const COMMUNICATION: ReportEntry[] = [
  {
    key: "co-delivery", category: "Communication", name: "Message delivery", sub: "Sent, delivered, read and failed messages, month by month", dated: true, fallback: "last6m",
    async run(rc) {
      const range = rc.f.range ? momentWhere(rc.f.range, rc.tz) : { gte: rc.f.from, lt: rc.f.to };
      const list = await rc.tx.messageRecipient.groupBy({ by: ["status", "channel"], where: { queuedAt: range }, _count: { _all: true } });
      // Month by month (in UTC, as stored), counted by the database: a big school sends hundreds of thousands a term (G37).
      const at = (d: Date) => d.toISOString().slice(0, 23);
      const counted = await rc.tx.$queryRaw<{ k: string; status: string; provider: string | null; n: bigint }[]>`
        SELECT to_char(queued_at, 'YYYY-MM') AS k, status::text AS status, provider, count(*) AS n
        FROM message_recipient WHERE queued_at >= ${at(range.gte)}::timestamp AND queued_at < ${at(range.lt)}::timestamp
        GROUP BY 1, 2, 3`;
      const by = new Map<string, { sent: number; delivered: number; read: number; failed: number; waiting: number }>();
      for (const r of counted) {
        const n = Number(r.n);
        const v = by.get(r.k) ?? { sent: 0, delivered: 0, read: 0, failed: 0, waiting: 0 };
        v.sent += n;
        // Test mode only records a message: nobody received it, so it is not delivered (COMM-04).
        if ((r.status === "DELIVERED" || r.status === "READ") && r.provider !== "sandbox") v.delivered += n;
        if (r.status === "READ") v.read += n;
        if (r.status === "FAILED") v.failed += n;
        if (r.status === "QUEUED" || r.status === "SENDING") v.waiting += n;
        by.set(r.k, v);
      }
      const month = (k: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${k}-01T00:00:00Z`));
      const t: Table = {
        columns: [{ key: "month", label: "Month" }, { key: "sent", label: "Sent", kind: "number" }, { key: "delivered", label: "Delivered", kind: "number" }, { key: "read", label: "Read", kind: "number" }, { key: "failed", label: "Failed", kind: "number" }, { key: "waiting", label: "Still sending", kind: "number" }],
        rows: [...by.keys()].sort().map((k) => ({ month: month(k), ...by.get(k)! })),
      };
      const channels = [...new Set(list.map((l) => l.channel))].map((c) => `${c === "whatsapp" ? "WhatsApp" : c === "sms" ? "SMS" : c === "email" ? "Email" : "App"} ${list.filter((l) => l.channel === c).reduce((s, l) => s + l._count._all, 0)}`);
      return { ...t, totals: t.rows.length ? totalsOf(t, "All months") : null, note: channels.length ? `By channel: ${channels.join(", ")}.` : null };
    },
  },
];

const FRONT_OFFICE: ReportEntry[] = [
  {
    key: "fo-visitors", category: "Front Office", name: "Visitor log summary", sub: "Visitors by day and why they came", dated: true, fallback: "last30",
    async run(rc) {
      const list = await rc.tx.visitorEntry.findMany({ where: { archivedAt: null, visitDate: { gte: rc.f.from, lte: rc.f.to } }, select: { visitDate: true, purpose: true, peopleCount: true, timeIn: true, timeOut: true } });
      const by = new Map<string, typeof list>();
      for (const v of list) { const k = v.visitDate.toISOString().slice(0, 10); by.set(k, [...(by.get(k) ?? []), v]); }
      const rows: Row[] = [...by.keys()].sort().reverse().map((k) => {
        const day = by.get(k)!;
        const purposes = new Map<string, number>();
        for (const v of day) purposes.set(v.purpose, (purposes.get(v.purpose) ?? 0) + 1);
        const top = [...purposes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
        const stays = day.filter((v) => v.timeOut).map((v) => (v.timeOut!.getTime() - v.timeIn.getTime()) / 60_000);
        return { day: new Date(`${k}T00:00:00Z`), visits: day.length, people: day.reduce((s, v) => s + v.peopleCount, 0), top, stay: stays.length ? `${Math.round(stays.reduce((a, b) => a + b, 0) / stays.length)} min` : "" };
      });
      const t: Table = { columns: [{ key: "day", label: "Day", kind: "date" }, { key: "visits", label: "Visits", kind: "number" }, { key: "people", label: "People", kind: "number" }, { key: "top", label: "Most came for" }, { key: "stay", label: "Average time in school" }], rows };
      return { ...t, totals: rows.length ? totalsOf(t, "All days") : null, note: rows.length ? `${formatDate(rc.f.from, "UTC")} to ${formatDate(rc.f.to, "UTC")}.` : null };
    },
  },
];

export const PEOPLE_REPORTS: ReportEntry[] = [...ADMISSIONS, ...STAFF, ...COMMUNICATION, ...FRONT_OFFICE];
