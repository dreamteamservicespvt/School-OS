import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { fullPage, BASE } from "@/lib/admission/page";
import { progressOf } from "@/lib/admission/documents";
import { classRules } from "@/lib/admission/settings";
import { names } from "@/lib/admission/choices";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { DocProgress, StageBadge, SubNav, linkClass } from "../_components/bits";

export const metadata: Metadata = { title: "Documents & Verification" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DocumentsPage({ searchParams }: Search) {
  const { current, year, tz } = await fullPage();
  const params = readListParams(await searchParams, ["docs", "class"]);
  const yearId = year?.id ?? "00000000-0000-0000-0000-000000000000";
  const f = params.filters;
  const where: Prisma.ApplicationWhereInput = {
    archivedAt: null, academicYearId: yearId,
    stage: { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "DECISION", "APPROVED", "WAITING_LIST"] },
    ...(f.class ? { classId: f.class } : {}),
    ...(f.docs === "complete" ? { documents: { none: { required: true, status: { not: "VERIFIED" } } } } : {}),
    ...(f.docs !== "complete" && f.docs !== "all" ? { documents: { some: { required: true, status: { not: "VERIFIED" } } } } : {}),
    ...(params.q ? { OR: [{ fullName: { contains: params.q, mode: "insensitive" } }, { applicationNo: { contains: params.q, mode: "insensitive" } }] } : {}),
  };
  const data = await withSchool(current.ctx, async (tx) => {
    const [rows, total, rules, n, toVerify] = await Promise.all([
      tx.application.findMany({ where, orderBy: { createdAt: "asc" }, ...skipTake(params), include: { documents: { select: { docType: true, status: true } } } }),
      tx.application.count({ where }),
      classRules(tx),
      names(tx),
      tx.applicationDocument.count({ where: { status: "RECEIVED", application: { archivedAt: null, academicYearId: yearId } } }),
    ]);
    return { rows, total, rules, n, toVerify };
  });
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "name", label: "Applicant", phone: "title", cell: (r) => <Link href={`${BASE}/applications/${r.id}`} className="font-medium text-brand-text hover:underline">{r.fullName}</Link> },
    { key: "number", label: "Application no.", phone: "meta", cell: (r) => r.applicationNo },
    { key: "class", label: "Class", phone: "meta", cell: (r) => data.n.classes.get(r.classId) ?? "" },
    { key: "stage", label: "Stage", phone: "badge", cell: (r) => <StageBadge stage={r.stage} /> },
    {
      key: "docs", label: "Documents", cell: (r) => {
        const p = progressOf(r.documents, data.rules.get(r.classId)?.documents ?? []);
        return <DocProgress verified={p.requiredVerified} required={p.required} missing={p.unverifiedRequired} />;
      },
    },
    { key: "submitted", label: "Submitted", cell: (r) => formatDate(r.createdAt, tz) },
  ];
  const chip = (v: string | null) => listHref(`${BASE}/documents`, params, { docs: v, page: null });
  return (
    <>
      <PageHeader title="Documents & Verification" href={`${BASE}/documents`} userId={current.user.id} />
      <p className="mb-4 text-ink-2">{data.toVerify} {data.toVerify === 1 ? "paper is" : "papers are"} received and waiting to be verified. The papers needed for each class are set in Admission Settings.</p>
      <SubNav current={f.docs ?? "missing"} items={[
        { key: "missing", label: "Papers missing", href: chip(null) },
        { key: "complete", label: "Complete", href: chip("complete") },
        { key: "all", label: "All", href: chip("all") },
      ]} />
      <ListToolbar placeholder="Search by name or application number" filters={[{ key: "class", label: "Class", options: [...data.n.classes.entries()].map(([value, label]) => ({ value, label })) }]} showArchived={false} />
      <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} total={data.total} params={params} path={`${BASE}/documents`} caption="Applicants and their papers"
        actions={(r) => <Link href={`${BASE}/applications/${r.id}#documents`} className={linkClass}>Papers</Link>}
        empty={<EmptyState title={f.docs === "complete" ? "No applicant has every paper verified yet" : "No papers are missing"}><p>Applicants still being processed appear here with their checklist.</p></EmptyState>} />
    </>
  );
}
