import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { ClipboardPen, Plus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listHref, readListParams, skipTake, PAGE_SIZE } from "@/lib/list";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { registerChoices } from "@/lib/attendance/register";
import { CORRECTION_WORDS, statusName, type CorrectionEntry } from "@/lib/attendance/corrections";
import { statusList } from "@/lib/attendance/settings";
import { REASONS_FEATURE } from "@/lib/attendance/absence-reasons";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips } from "@/components/ui/chips";
import { DataList, Pager } from "@/app/(school)/attendance-management/_components/data-list";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "../../_components/att-head";
import { CORRECTION_STATUS } from "../../_components/words";
import { pillTone } from "../../_components/status";

export const metadata: Metadata = { title: "Attendance corrections" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PILL: Record<string, "ok" | "warn" | "bad" | "neutral"> = { WAITING: "warn", APPROVED: "ok", REJECTED: "bad", WITHDRAWN: "neutral" };

export default async function CorrectionsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = readListParams(raw, ["status", "kind", "for"]);
  const { current, access, features } = await attendancePage();
  const path = `${BASE}/register/corrections`;

  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await registerChoices(tx, access);
    const names = new Map(sections.map((s) => [s.id, s.name]));
    const scope: Prisma.AttendanceCorrectionWhereInput[] = [];
    if (access.students !== "none") scope.push(access.students === "all" ? { forWhom: "student" } : { forWhom: "student", sectionId: { in: sections.map((s) => s.id) } });
    if (access.staff === "all") scope.push({ forWhom: "staff" });
    if (scope.length === 0) scope.push({ requestedById: current.user.id });
    const base: Prisma.AttendanceCorrectionWhereInput = {
      archivedAt: null,
      OR: scope,
      ...(params.filters.kind ? { kind: params.filters.kind } : {}),
      ...(params.filters.for ? { forWhom: params.filters.for } : {}),
      ...(params.q ? { reason: { contains: params.q, mode: "insensitive" as const } } : {}),
    };
    const where = { ...base, ...(params.filters.status && params.filters.status in CORRECTION_STATUS ? { status: params.filters.status } : {}) };
    const [rows, total, statuses, counts] = await Promise.all([
      tx.attendanceCorrection.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(params) }),
      tx.attendanceCorrection.count({ where }),
      statusList(tx, current.ctx, { includeArchived: true }),
      tx.attendanceCorrection.groupBy({ by: ["status"], where: base, _count: true }),
    ]);
    const askers = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.requestedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    const missing = rows.map((r) => r.sectionId).filter((x): x is string => Boolean(x) && !names.has(x!));
    if (missing.length) {
      const extra = await tx.section.findMany({ where: { id: { in: missing } }, include: { schoolClass: { select: { name: true } } } });
      for (const s of extra) names.set(s.id, `${s.schoolClass.name} ${s.name}`);
    }
    return { rows, total, statuses, names, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>, askers: new Map(askers.map((a) => [a.id, a.displayName])) };
  });

  type Row = (typeof data.rows)[number];
  const entries = (r: Row) => r.entries as CorrectionEntry[];
  const who = (r: Row) => (entries(r).length === 1 ? entries(r)[0].name : `${entries(r).length} ${r.forWhom === "staff" ? "staff" : "students"}`);
  const change = (r: Row) => {
    const e = entries(r);
    if (!e[0]) return "";
    const text = `${statusName(data.statuses, e[0].from)} → ${statusName(data.statuses, e[0].to)}`;
    return e.length > 1 ? `${text} and ${e.length - 1} more` : text;
  };
  const where = (r: Row) => (r.forWhom === "staff" ? "Staff" : data.names.get(r.sectionId ?? "") ?? "Class");
  const when = (r: Row) => `${formatDate(r.date, "UTC")}${r.periodNo ? `, period ${r.periodNo}` : ""}`;
  const pill = (r: Row) => <Pill tone={PILL[r.status] ?? pillTone(undefined)}>{CORRECTION_STATUS[r.status]?.label ?? r.status}</Pill>;
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const filtered = Boolean(params.q || params.filters.kind || params.filters.for || params.filters.status);

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={path} sub="Changes asked for after attendance locked, decided in Approvals"
        actions={access.change !== "none" ? <ButtonLink href={`${BASE}/register/correction`} variant="primary" icon={Plus}>Request a correction</ButtonLink> : undefined} />
      <div className="flex flex-col gap-4">
        <Chips label="Register views" value="corrections" options={[
          { value: "class", label: "Class register", href: `${BASE}/register` },
          { value: "student", label: "Student calendar", href: `${BASE}/register?view=student` },
          ...(features.has(REASONS_FEATURE) ? [{ value: "absences", label: "Absent list", href: `${BASE}/register/absences` }] : []),
          { value: "corrections", label: "Corrections", count: data.counts.WAITING || null, href: path },
        ]} />
        <Card className="overflow-hidden">
          <div className="p-4 flex flex-col gap-3 border-b border-line">
            <Chips label="Status" value={params.filters.status ?? ""} options={[
              { value: "", label: "All", count: all, href: listHref(path, params, { status: null, page: null }) },
              ...Object.entries(CORRECTION_STATUS).map(([value, s]) => ({ value, label: s.label, count: data.counts[value] ?? 0, href: listHref(path, params, { status: value, page: null }) })),
            ]} />
            <div className="flex flex-col sm:flex-row gap-2">
              <UrlSearch placeholder="Search reasons" />
              <UrlSelect param="kind" label="Type" className="sm:w-56" options={[{ value: "", label: "Any type" }, ...Object.entries(CORRECTION_WORDS).map(([value, label]) => ({ value, label }))]} />
              {access.staff === "all" && access.students !== "none" && (
                <UrlSelect param="for" label="For" className="sm:w-44" options={[{ value: "", label: "Students and staff" }, { value: "student", label: "Students" }, { value: "staff", label: "Staff" }]} />
              )}
            </div>
          </div>
          <DataList rows={data.rows} rowKey={(r) => r.id} href={(r) => `${path}/${r.id}`} caption="Attendance corrections" minWidth={860}
            columns={[
              { key: "date", label: "Date", nowrap: true, render: (r) => <span className="font-semibold">{when(r)}</span> },
              { key: "class", label: "Class", nowrap: true, render: where },
              { key: "who", label: "Who", render: who },
              { key: "change", label: "Change", render: change },
              { key: "kind", label: "Type", render: (r) => <span className="text-ink2">{CORRECTION_WORDS[r.kind] ?? r.kind}</span> },
              { key: "by", label: "Asked by", nowrap: true, render: (r) => data.askers.get(r.requestedById ?? "") ?? "Offline queue" },
              { key: "status", label: "Status", render: pill },
            ]}
            mobile={(r) => ({ icon: ClipboardPen, iconTone: r.status === "WAITING" ? "warn" : r.status === "APPROVED" ? "ok" : "neutral", title: `${who(r)} · ${where(r)}`, sub: `${when(r)} · ${change(r)}`, right: pill(r) })}
            footer={<Pager page={params.page} pageSize={PAGE_SIZE} total={data.total} href={(p) => listHref(path, params, { page: p })} />}
            empty={<EmptyState bare title={filtered ? "No corrections match" : "No corrections yet"} Icon={ClipboardPen}>
              {filtered ? "Try another search, or choose All." : "After attendance locks, a change is asked for here and decided in Approvals."}
            </EmptyState>} />
        </Card>
      </div>
    </>
  );
}
