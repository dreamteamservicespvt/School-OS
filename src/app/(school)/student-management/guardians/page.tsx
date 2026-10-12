import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, orderByFor } from "@/lib/list";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { UserIcon } from "@/components/icons";
import { BulkBar } from "@/components/students/bulk-bar";
import { studentScope } from "@/lib/students/access";
import { consentRows, consentState } from "@/lib/students/consent";
import { parentLinkProvider, parentLinkStatus } from "@/lib/students/guardians";
import { CONSENT_STATUS_LABEL } from "@/lib/students/labels";
import { BASE, studentPage } from "../_lib/page";
import { sectionNames } from "../_lib/queries";

export const metadata: Metadata = { title: "Parents & Guardians" };

const FILTERS = ["consent", "photo", "link", "relation"] as const;
const TONE = { GIVEN: "success", WITHDRAWN: "danger", REQUESTED: "warning", NONE: "neutral" } as const;

export default async function GuardiansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, year, can } = await studentPage();
  const params = readListParams(await searchParams, FILTERS);
  const provider = parentLinkProvider();
  const path = `${BASE}/guardians`;

  const data = await withSchool(current.ctx, async (tx) => {
    const scope = await studentScope(tx, current, year?.id);
    const and: Prisma.GuardianWhereInput[] = [{ archivedAt: params.archived ? { not: null } : null }];
    if (can.reach === "own") and.push({ students: { some: { archivedAt: null, student: scope } } });
    const f = params.filters;
    if (f.relation) and.push({ relationship: f.relation });
    // Consent states are read once and turned into id lists for the filters.
    const idsBy = new Map<string, string[]>();
    if (f.consent || f.photo) {
      const rows = await consentRows(tx, current.ctx);
      const byGuardian = new Map<string, { consentType: string; status: string }[]>();
      for (const r of rows) { const list = byGuardian.get(r.guardianId) ?? []; list.push({ consentType: r.consentType, status: r.status }); byGuardian.set(r.guardianId, list); }
      for (const type of ["data-processing", "photo"]) {
        for (const st of ["GIVEN", "WITHDRAWN"]) idsBy.set(`${type}:${st}`, [...byGuardian.entries()].filter(([, l]) => consentState(l, type) === st).map(([g]) => g));
      }
    }
    const consentFilter = (type: string, v: string): Prisma.GuardianWhereInput =>
      v === "withdrawn" ? { id: { in: idsBy.get(`${type}:WITHDRAWN`) ?? [] } } : { id: { notIn: idsBy.get(`${type}:GIVEN`) ?? [] } };
    if (f.consent) and.push(consentFilter("data-processing", f.consent));
    if (f.photo) and.push(consentFilter("photo", f.photo));
    if (params.q) {
      const digits = params.q.replace(/\D/g, "");
      and.push({ OR: [{ name: { contains: params.q, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []), { students: { some: { archivedAt: null, student: { fullName: { contains: params.q, mode: "insensitive" } } } } }] });
    }
    let where: Prisma.GuardianWhereInput = { AND: and };
    let linkStates = new Map<string, { status: string; lastOpenedAt: Date | null }>();
    if (provider && f.link === "not-opened") {
      const all = await tx.guardian.findMany({ where, select: { id: true }, take: 5000 });
      linkStates = await parentLinkStatus(tx, current.ctx, all.map((g) => g.id));
      where = { AND: [where, { id: { in: all.filter((g) => !linkStates.get(g.id)?.lastOpenedAt).map((g) => g.id) } }] };
    }
    const orderBy = orderByFor(params, { name: { name: params.dir }, phone: { phone: params.dir } }, { name: "asc" });
    const [total, rows] = await Promise.all([
      tx.guardian.count({ where }),
      tx.guardian.findMany({
        where, orderBy: orderBy as object, ...skipTake(params),
        include: { students: { where: { archivedAt: null }, include: { student: { include: { enrolments: { where: { archivedAt: null, ...(year ? { academicYearId: year.id } : {}) }, take: 1 } } } } } },
      }),
    ]);
    const consents = await consentRows(tx, current.ctx, { guardianIds: rows.map((r) => r.id) });
    const names = await sectionNames(tx, rows.flatMap((r) => r.students.flatMap((s) => s.student.enrolments.map((e) => e.sectionId))));
    if (provider && !linkStates.size) linkStates = await parentLinkStatus(tx, current.ctx, rows.map((r) => r.id));
    return {
      total,
      rows: rows.map((g) => ({
        ...g,
        children: g.students.map((l) => ({ id: l.studentId, name: l.student.fullName, cls: l.student.enrolments[0] ? names.get(l.student.enrolments[0].sectionId)?.label ?? "" : "", restricted: Boolean(l.restriction) })),
        data: consentState(consents.filter((c) => c.guardianId === g.id), "data-processing"),
        photo: consentState(consents.filter((c) => c.guardianId === g.id), "photo"),
        link: linkStates.get(g.id) ?? null,
      })),
    };
  });
  type Row = (typeof data.rows)[number];

  const columns: Column<Row>[] = [
    { key: "name", label: "Name", sortable: true, phone: "title", cell: (g) => g.name },
    { key: "relation", label: "Relation", cell: (g) => g.relationship },
    { key: "phone", label: "Phone", sortable: true, phone: "meta", cell: (g) => g.phone },
    { key: "children", label: "Children", phone: "meta", cell: (g) => g.children.length ? g.children.map((c) => `${c.name}${c.cls ? ` (${c.cls})` : ""}`).join(", ") : <span className="text-ink-2">No children linked</span> },
    { key: "occupation", label: "Occupation", cell: (g) => g.occupation ?? "" },
    { key: "optedOut", label: "Opted out", cell: (g) => (g.optedOut ? <Badge tone="warning">Yes</Badge> : "No") },
    { key: "consent", label: "Data consent", phone: "badge", cell: (g) => <Badge tone={TONE[g.data]}>{CONSENT_STATUS_LABEL[g.data]}</Badge> },
    ...(provider ? [{ key: "link", label: "Parent Link", cell: (g: Row) => g.link ? <Badge tone={g.link.status === "Active" ? "success" : g.link.status === "Revoked" ? "danger" : "neutral"}>{g.link.status}</Badge> : <Badge>Not sent</Badge> }] : []),
  ];

  return (
    <>
      <PageHeader title="Parents & Guardians" href={path} userId={current.user.id}>
        {can.manage && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`${path}/consent`}>Send consent request</ButtonLink>
            <ButtonLink href={`${path}/new`} variant="primary">Add parent</ButtonLink>
          </div>
        )}
      </PageHeader>
      <ListToolbar placeholder="Search by name, phone or child's name" showArchived={can.manage}
        filters={[
          { key: "consent", label: "Data consent", options: [{ value: "not-given", label: "Consent not given" }, { value: "withdrawn", label: "Consent withdrawn" }] },
          { key: "photo", label: "Photo consent", options: [{ value: "not-given", label: "Photo consent not given" }, { value: "withdrawn", label: "Photo consent withdrawn" }] },
        ]}
        more={[
          { key: "relation", label: "Relation", options: ["Father", "Mother", "Guardian", "Other"].map((r) => ({ value: r, label: r })) },
          ...(provider ? [{ key: "link", label: "Parent Link", options: [{ value: "not-opened", label: "Not opened yet" }] }] : []),
        ]} />
      <DataTable rows={data.rows} columns={columns} rowKey={(g) => g.id} rowHref={(g) => `${path}/${g.id}`} total={data.total} params={params} path={path} caption="Parents and guardians"
        select={can.manage ? { form: "guardian-bulk", label: (g) => `Choose ${g.name}`, value: (g) => g.id } : undefined}
        empty={
          <EmptyState title={Object.keys(params.filters).length || params.q ? "No parents match these filters" : "No parents yet"} icon={<UserIcon />}>
            {Object.keys(params.filters).length || params.q ? <p><Link className="font-medium text-brand-text underline" href={path}>Show all parents</Link></p> : <p>Parents are added with their children, on Add student or the import.</p>}
          </EmptyState>
        } />
      {can.manage && <BulkBar form="guardian-bulk" noun="parent" actions={[{ label: "Send consent request", href: `${path}/consent`, primary: true }]} />}
    </>
  );
}
