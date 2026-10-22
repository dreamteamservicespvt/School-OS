import type { Metadata } from "next";
import Link from "next/link";
import type { CertificateType, CertificateStatus, Prisma } from "@prisma/client";
import { FileBadge, FilePlus2, Hourglass, SearchX } from "lucide-react";
import { withSchool } from "@/lib/db";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { readListParams, orderByFor, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { canDecide } from "@/lib/approvals";
import { ListToolbar } from "@/components/list/list-toolbar";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Chips, Empty, ListFooter, Toolbar } from "@/components/ui/blocks";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { ConfirmAction } from "@/components/students/confirm-action";
import { CERTIFICATE_LABEL, CERT_STATUS_LABEL, CERT_STATUS_TONE } from "@/lib/students/labels";
import { classShort, shortDate, shownCount } from "@/lib/students/show";
import { BASE, studentPage } from "../_lib/page";
import { StudentsHead } from "../_lib/head";
import { sectionNames } from "../_lib/queries";
import { currentEnrolments } from "@/lib/academic/years";
import { decideCertificateAction } from "../_actions/certificates";
import { certificateTabs } from "./sub-tabs";
import { studentIdsForFilter } from "@/lib/students/find";
import { visibleStudentIds } from "@/lib/students/access";

export const metadata: Metadata = { title: "Certificates & ID Cards" };

const FILTERS = ["type", "status"] as const;
const STEP = 25;
const STATUSES = Object.keys(CERT_STATUS_LABEL) as CertificateStatus[];

/** Certificates issued and requested: number, type, student, date, status; requests waiting for approval on top. */
export default async function CertificatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, settings, can, tz, year, yearIds } = await studentPage();
  const raw = await searchParams;
  const params = readListParams(raw, FILTERS);
  const take = shownCount(raw, STEP);
  const range = periodFromSearch(raw, { timeZone: tz });
  const path = `${BASE}/certificates`;
  const data = await withSchool(current.ctx, async (tx) => {
    const f = params.filters;
    const nameIds = params.q ? await studentIdsForFilter(tx, params.q) : null;
    // A person limited to one campus: that campus's students' certificates only.
    const mine = await visibleStudentIds(tx, current, yearIds);
    const base: Prisma.CertificateWhereInput = {
      ...(mine ? { studentId: { in: mine } } : {}),
      ...(f.type && f.type in CERTIFICATE_LABEL ? { type: f.type as CertificateType } : {}),
      ...(range ? { issueDate: dateWhere(range) } : {}),
      ...(params.q ? { OR: [{ number: { contains: params.q, mode: "insensitive" as const } }, { studentId: { in: nameIds ?? [] } }] } : {}),
    };
    const where: Prisma.CertificateWhereInput = { ...base, ...(f.status && f.status in CERT_STATUS_LABEL ? { status: f.status as CertificateStatus } : {}) };
    const orderBy = orderByFor(params, { date: { issueDate: params.dir } }, [{ createdAt: "desc" }]);
    const [total, rows, waiting, byStatus] = await Promise.all([
      tx.certificate.count({ where }),
      tx.certificate.findMany({ where, orderBy: orderBy as object, take }),
      tx.certificate.findMany({ where: { status: "REQUESTED", ...(mine ? { studentId: { in: mine } } : {}) }, orderBy: { createdAt: "asc" }, take: 30 }),
      tx.certificate.groupBy({ by: ["status"], where: base, _count: true }),
    ]);
    const approvals = await tx.approval.findMany({ where: { id: { in: waiting.map((w) => w.approvalId).filter((x): x is string => Boolean(x)) } } });
    const mayDecide = new Set<string>();
    for (const a of approvals) if (await canDecide(tx, current.ctx, a)) mayDecide.add(a.id);
    const ids = [...rows, ...waiting].map((r) => r.studentId);
    const students = await tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, admissionNo: true } });
    // Each student's class this year, in their own campus's current year.
    const thisYear = await currentEnrolments(tx, students.map((s) => s.id));
    const names = await sectionNames(tx, [...thisYear.values()].map((e) => e.sectionId));
    const cls = new Map(students.map((s) => { const e = thisYear.get(s.id); const n = e ? names.get(e.sectionId) : null; return [s.id, n ? classShort(n.className, n.sectionName) : ""]; }));
    return { total, rows, waiting, mayDecide, students, cls, byStatus };
  });
  type Row = (typeof data.rows)[number];
  const who = (id: string) => data.students.find((s) => s.id === id);
  const types = (Object.keys(CERTIFICATE_LABEL) as CertificateType[]).filter((t) => t !== "MIGRATION" || settings.migrationOn);
  const typeName = (r: Row) => `${CERTIFICATE_LABEL[r.type]}${r.isDuplicate ? " (duplicate)" : ""}`;
  const count = (st: CertificateStatus) => data.byStatus.find((b) => b.status === st)?._count ?? 0;
  const all = data.byStatus.reduce((a, b) => a + b._count, 0);
  const statusHref = (st: string | null) => listHref(path, params, { status: st, n: null });

  const columns: DataColumn<Row>[] = [
    { key: "number", label: "Number", nowrap: true, render: (r) => r.number ? <span className="font-mono text-[12.5px]">{r.number}</span> : <span className="text-[12.5px] text-ink3">Not given yet</span> },
    { key: "type", label: "Type", render: (r) => <span className="text-[13.5px] whitespace-nowrap">{typeName(r)}</span> },
    { key: "student", label: "Student", render: (r) => {
      const s = who(r.studentId);
      return (
        <div className="flex items-center gap-2.5">
          <Avatar name={s?.fullName ?? "?"} size={30} />
          <div className="min-w-0"><p className="font-semibold leading-tight whitespace-nowrap">{s?.fullName}</p><p className="text-[12px] text-ink3">{data.cls.get(r.studentId) || s?.admissionNo}</p></div>
        </div>
      );
    } },
    { key: "purpose", label: "Purpose", className: "max-w-[260px]", render: (r) => <span className="text-[13.5px] line-clamp-1">{r.purpose ?? "–"}</span> },
    { key: "date", label: "Date", nowrap: true, sortHref: listHref(path, params, { sort: "date", dir: params.sort === "date" && params.dir === "desc" ? "asc" : "desc" }), sorted: params.sort === "date" ? params.dir : null, render: (r) => <span className="tnum text-[13.5px]">{shortDate(r.issueDate, tz)}</span> },
    { key: "status", label: "Status", render: (r) => <Pill tone={CERT_STATUS_TONE[r.status]}>{CERT_STATUS_LABEL[r.status]}</Pill> },
  ];
  const filtered = Boolean(params.q || Object.keys(params.filters).length || range);

  return (
    <>
      <StudentsHead page="Certificates & ID Cards" href={path} sub="TC, bonafide, study and character certificates, and student ID cards class by class"
        actions={can.manage ? <ButtonLink href={`${path}/new`} variant="primary" icon={FilePlus2}>Issue certificate</ButtonLink> : undefined}
        subTabs={await certificateTabs()} subLabel="Certificates & ID Cards" />
      <div className="flex flex-col gap-4">
        {data.waiting.length > 0 && (
          <Card>
            <CardHeader title={`Waiting for approval (${data.waiting.length})`} description="A TC always needs approval; other types as set in Student Settings." icon={Hourglass} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {data.waiting.map((c) => {
                const s = who(c.studentId);
                const mine = c.approvalId && data.mayDecide.has(c.approvalId);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-3">
                    <Avatar name={s?.fullName ?? "?"} size={36} />
                    <div className="min-w-0 flex-1">
                      <Link href={`${path}/${c.id}`} className="font-semibold text-[14.5px] hover:underline">{CERTIFICATE_LABEL[c.type]}{c.isDuplicate ? " (duplicate)" : ""} for {s?.fullName}</Link>
                      <p className="text-[12.5px] text-ink3">{data.cls.get(c.studentId) || s?.admissionNo} · asked {formatDateTime(c.createdAt, tz)}{c.purpose ? ` · ${c.purpose}` : ""}</p>
                    </div>
                    {mine ? (
                      <div className="flex flex-wrap gap-2">
                        <ConfirmAction action={decideCertificateAction} fields={{ id: c.id, decision: "approve" }} trigger="Approve" triggerVariant="primary" title={`Approve the ${CERTIFICATE_LABEL[c.type]} for ${s?.fullName}?`} confirmLabel="Approve">
                          It gets the next number in the series and can then be issued.
                        </ConfirmAction>
                        <ConfirmAction action={decideCertificateAction} fields={{ id: c.id, decision: "reject" }} trigger="Reject" triggerVariant="danger-outline" title="Reject this request?" confirmLabel="Reject" confirmVariant="danger" reason={{ label: "Reason", min: 5 }}>
                          The person who asked is told, with your reason.
                        </ConfirmAction>
                      </div>
                    ) : <Pill tone="warn">Waiting for the approver</Pill>}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <Chips label="Status" value={params.filters.status ?? "all"} options={[
          { value: "all", label: "All", count: all, href: statusHref(null) },
          ...STATUSES.map((st) => ({ value: st, label: CERT_STATUS_LABEL[st], count: count(st), href: statusHref(st) })),
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <ListToolbar placeholder="Student name, admission number or certificate number" showArchived={false} period={{ timeZone: tz, allLabel: "Any date" }}
              filters={[{ key: "type", label: "Type", allLabel: "Every type", options: types.map((t) => ({ value: t, label: CERTIFICATE_LABEL[t] })) }]}>
              {settings.digiLockerOn && can.manage && (
                <ButtonLink href={`${path}/digilocker${range ? `?period=${range.period}&from=${range.from}&to=${range.to}` : ""}`} icon={FileBadge}>DigiLocker file</ButtonLink>
              )}
            </ListToolbar>
          </Toolbar>
          <DataList caption="Certificates" rows={data.rows} columns={columns} rowKey={(r) => r.id} minWidth={940}
            rowHref={(r) => `${path}/${r.id}`} rowLabel={(r) => `Open ${typeName(r)} for ${who(r.studentId)?.fullName ?? ""}`}
            mobile={(r) => {
              const s = who(r.studentId);
              return { title: s?.fullName ?? "", sub: `${typeName(r)} · ${shortDate(r.issueDate, tz)}${r.number ? ` · ${r.number}` : ""}`, icon: FileBadge, iconTone: "brand",
                pills: [<Pill key="s" tone={CERT_STATUS_TONE[r.status]} className={cardPill}>{CERT_STATUS_LABEL[r.status]}</Pill>] };
            }}
            footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={data.rows.length < data.total ? listHref(path, params, { n: take + STEP }) : null} />}
            empty={filtered
              ? <Empty icon={SearchX} title="Nothing matches these filters" action={<ButtonLink href={path}>Clear filters</ButtonLink>} />
              : <Empty icon={FileBadge} title="No certificates yet" body={`Bonafide, study, character certificates and TCs show here with their number and status${year ? ` for ${year.name} and earlier years` : ""}.`}
                action={can.manage ? <ButtonLink href={`${path}/new`} variant="primary" icon={FilePlus2}>Issue certificate</ButtonLink> : undefined} />} />
        </Card>
      </div>
    </>
  );
}
