import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { DataTable, type Column } from "@/components/list/data-table";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { STUDENT_IMPORT, UDISE_IMPORT } from "@/lib/students/import";
import { BASE, studentPage } from "../../_lib/page";

export const metadata: Metadata = { title: "Import history" };

/** Every student import: file, who, when, added, skipped; open one to undo it or download its skipped rows. */
export default async function ImportHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, can, tz } = await studentPage();
  if (!can.manage) redirect(BASE);
  const params = readListParams(await searchParams);
  const path = `${BASE}/import/history`;
  const data = await withSchool(current.ctx, async (tx) => {
    const where = { kind: { in: [STUDENT_IMPORT, UDISE_IMPORT] } };
    const [total, rows] = await Promise.all([tx.importBatch.count({ where }), tx.importBatch.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(params) })]);
    const people = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.importedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { total, rows, people };
  });
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "file", label: "File", phone: "title", cell: (r) => r.fileName },
    { key: "kind", label: "Kind", cell: (r) => (r.kind === UDISE_IMPORT ? "UDISE+" : "Students") },
    { key: "when", label: "When", phone: "meta", cell: (r) => formatDateTime(r.createdAt, tz) },
    { key: "who", label: "By", cell: (r) => data.people.find((p) => p.id === r.importedById)?.displayName ?? "" },
    { key: "added", label: "Added", phone: "meta", cell: (r) => `${r.added} added, ${r.skipped} skipped` },
    { key: "status", label: "Status", phone: "badge", cell: (r) => (r.undoneAt ? <Badge>Undone</Badge> : <Badge tone="success">Imported</Badge>) },
  ];
  return (
    <>
      <PageHeader title="Import history" href={path} userId={current.user.id}>
        <ButtonLink href={`${BASE}/import`} variant="primary">Import students</ButtonLink>
      </PageHeader>
      <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} rowHref={(r) => `${BASE}/import/${r.id}`} total={data.total} params={params} path={path} caption="Student imports"
        empty={<EmptyState title="No imports yet">Imports of students show here, and each can be undone.</EmptyState>} />
    </>
  );
}
