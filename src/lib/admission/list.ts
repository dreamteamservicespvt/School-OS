// The Enquiries and Applications list queries, shared by the screens and
// their exports, so both use the same filters and the same limits (P1, P8).
import "server-only";

import type { ApplicationStage, Prisma } from "@prisma/client";
import type { ListParams } from "../list";
import { orderByFor } from "../list";
import { enquiryScope, type Viewer } from "./access";
import { CLOSED_STATUSES } from "./settings";
import { STAGES } from "./applications";
import { instantToLocal, zonedToInstant } from "./act";

export const ENQUIRY_FILTERS = ["quick", "source", "status", "class", "owner", "campaign", "from", "to", "year", "view"] as const;
export const QUICK = [
  { value: "mine", label: "My enquiries" },
  { value: "today", label: "Follow-up today" },
  { value: "overdue", label: "Overdue" },
  { value: "new-week", label: "New this week" },
  { value: "lost", label: "Lost" },
] as const;

const UUID = /^[0-9a-f-]{36}$/i;

export function enquiryWhere(params: ListParams, v: Viewer, opts: { yearId: string | string[]; timeZone: string; now?: Date }): Prisma.EnquiryWhereInput {
  const f = params.filters;
  const now = opts.now ?? new Date();
  const and: Prisma.EnquiryWhereInput[] = [enquiryScope(v)];
  if (params.q) {
    const q = params.q;
    const digits = q.replace(/\D/g, "");
    and.push({ OR: [
      { childName: { contains: q, mode: "insensitive" } },
      { parentName: { contains: q, mode: "insensitive" } },
      { enquiryNo: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      { email: { contains: q, mode: "insensitive" } },
    ] });
  }
  const today = instantToLocal(now, opts.timeZone).slice(0, 10);
  const dayStart = zonedToInstant(`${today}T00:00`, opts.timeZone);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  if (f.quick === "mine") and.push({ ownerStaffId: v.staffId ?? "00000000-0000-0000-0000-000000000000" });
  if (f.quick === "today") and.push({ status: { notIn: [...CLOSED_STATUSES] }, nextFollowUpAt: { gte: dayStart, lt: dayEnd } });
  if (f.quick === "overdue") and.push({ status: { notIn: [...CLOSED_STATUSES] }, nextFollowUpAt: { lt: now } });
  if (f.quick === "new-week") and.push({ createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } });
  if (f.quick === "lost") and.push({ status: "lost" });
  if (f.view === "whatsapp") and.push({ OR: [{ source: "whatsapp" }, { firstSource: "whatsapp" }, { activities: { some: { kind: "message", data: { path: ["channel"], equals: "whatsapp" } } } }] });
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) and.push({ createdAt: { gte: zonedToInstant(`${f.from}T00:00`, opts.timeZone) } });
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) and.push({ createdAt: { lt: new Date(zonedToInstant(`${f.to}T00:00`, opts.timeZone).getTime() + 86_400_000) } });
  return {
    AND: and,
    archivedAt: params.archived ? { not: null } : null,
    academicYearId: f.year && UUID.test(f.year) ? f.year : f.year === "all" ? undefined : Array.isArray(opts.yearId) ? { in: opts.yearId } : opts.yearId,
    ...(f.source ? { source: f.source } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.class && UUID.test(f.class) ? { classId: f.class } : {}),
    ...(f.owner === "none" ? { ownerStaffId: null } : f.owner && UUID.test(f.owner) ? { ownerStaffId: f.owner } : {}),
    ...(f.campaign && UUID.test(f.campaign) ? { campaignId: f.campaign } : {}),
  };
}

export function enquiryOrder(params: ListParams) {
  return orderByFor(params, {
    child: { childName: params.dir },
    parent: { parentName: params.dir },
    followup: { nextFollowUpAt: { sort: params.dir, nulls: "last" } },
    created: { createdAt: params.dir },
    status: { status: params.dir },
  }, [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]) as Prisma.EnquiryOrderByWithRelationInput | Prisma.EnquiryOrderByWithRelationInput[];
}

export const APPLICATION_FILTERS = ["stage", "class", "year", "docs", "fee", "channel"] as const;

export function applicationWhere(params: ListParams, opts: { yearId: string | string[] }): Prisma.ApplicationWhereInput {
  const f = params.filters;
  const and: Prisma.ApplicationWhereInput[] = [];
  if (params.q) {
    const q = params.q;
    const digits = q.replace(/\D/g, "");
    and.push({ OR: [
      { fullName: { contains: q, mode: "insensitive" } },
      { applicationNo: { contains: q, mode: "insensitive" } },
      { fatherName: { contains: q, mode: "insensitive" } },
      { motherName: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ] });
  }
  if (f.docs === "complete") and.push({ documents: { none: { required: true, status: { not: "VERIFIED" } } } });
  if (f.docs === "missing") and.push({ documents: { some: { required: true, status: { not: "VERIFIED" } } } });
  if (f.fee === "paid") and.push({ feeDuePaise: { gt: 0 }, payments: { some: { status: "CONFIRMED", cancelledAt: null } } });
  if (f.fee === "unpaid") and.push({ feeDuePaise: { gt: 0 }, payments: { none: { status: "CONFIRMED", cancelledAt: null } } });
  if (f.fee === "none") and.push({ feeDuePaise: null });
  const stage = STAGES.some((s) => s.value === f.stage) ? (f.stage as ApplicationStage) : undefined;
  return {
    AND: and,
    archivedAt: params.archived ? { not: null } : null,
    academicYearId: f.year && UUID.test(f.year) ? f.year : f.year === "all" ? undefined : Array.isArray(opts.yearId) ? { in: opts.yearId } : opts.yearId,
    ...(stage ? { stage } : f.stage === "open" ? { stage: { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "DECISION"] } } : {}),
    ...(f.class && UUID.test(f.class) ? { classId: f.class } : {}),
    ...(f.channel === "online" || f.channel === "counter" ? { channel: f.channel } : {}),
  };
}

type Names = { classes: Map<string, string>; staff: Map<string, string>; years?: Map<string, string> };

/** The filters in words, printed on every export (P8). */
export function describeEnquiryFilters(params: ListParams, s: { statusList: { key: string; label: string }[]; sourceList: { key: string; label: string }[] }, n: Names) {
  const f = params.filters;
  const parts: string[] = [];
  if (params.q) parts.push(`Search "${params.q}"`);
  if (f.quick) parts.push(QUICK.find((q) => q.value === f.quick)?.label ?? f.quick);
  if (f.status) parts.push(`Status: ${s.statusList.find((x) => x.key === f.status)?.label ?? f.status}`);
  if (f.source) parts.push(`Source: ${s.sourceList.find((x) => x.key === f.source)?.label ?? f.source}`);
  if (f.class) parts.push(`Class: ${n.classes.get(f.class) ?? "?"}`);
  if (f.owner) parts.push(`Owner: ${f.owner === "none" ? "No owner" : n.staff.get(f.owner) ?? "?"}`);
  if (f.year) parts.push(`Year: ${f.year === "all" ? "All" : n.years?.get(f.year) ?? "?"}`);
  if (f.from || f.to) parts.push(`Added ${f.from ?? "…"} to ${f.to ?? "…"}`);
  if (params.archived) parts.push("Archived");
  return parts.join(", ") || "All enquiries this admission year";
}

export function describeApplicationFilters(params: ListParams, n: Names) {
  const f = params.filters;
  const parts: string[] = [];
  if (params.q) parts.push(`Search "${params.q}"`);
  if (f.stage) parts.push(`Stage: ${f.stage === "open" ? "Not yet decided" : STAGES.find((x) => x.value === f.stage)?.label ?? f.stage}`);
  if (f.class) parts.push(`Class: ${n.classes.get(f.class) ?? "?"}`);
  if (f.year) parts.push(`Year: ${f.year === "all" ? "All" : n.years?.get(f.year) ?? "?"}`);
  if (f.docs) parts.push(f.docs === "complete" ? "Documents complete" : "Documents missing");
  if (f.fee) parts.push(f.fee === "paid" ? "Fee paid" : f.fee === "unpaid" ? "Fee not paid" : "No fee");
  if (f.channel) parts.push(f.channel === "online" ? "Online" : "At the counter");
  if (params.archived) parts.push("Archived");
  return parts.join(", ") || "All applications this admission year";
}

export function exportFormatOf(url: URL): "csv" | "xlsx" | "pdf" {
  const f = url.searchParams.get("format");
  return f === "csv" || f === "pdf" ? f : "xlsx";
}

export function applicationOrder(params: ListParams) {
  return orderByFor(params, {
    number: { applicationNo: params.dir },
    name: { fullName: params.dir },
    submitted: { createdAt: params.dir },
    stage: { stage: params.dir },
  }, [{ createdAt: "desc" }]) as Prisma.ApplicationOrderByWithRelationInput | Prisma.ApplicationOrderByWithRelationInput[];
}
