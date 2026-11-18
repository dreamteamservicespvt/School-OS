import { RecordTitle } from "@/components/ui/record-title";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction } from "@/components/students/confirm-action";
import { STUDENT_IMPORT_KINDS } from "@/lib/students/import-kinds";
import { BASE, studentPage, NO_ACCESS } from "../../_lib/page";
import { undoImportAction } from "../../_actions/import";
import { Any, Words } from "@/lib/i18n/client";
import { PhoneMissing } from "../../_lib/phone-missing";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import") };
}

/** Import (P10), step 5: what was imported, the skipped rows to download, and Undo. */
export default async function ImportBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { current, can, tz } = await studentPage();
  if (!can.manage) redirect(NO_ACCESS);
  const { batchId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const batch = await tx.importBatch.findUnique({ where: { id: batchId } });
    if (!batch || !STUDENT_IMPORT_KINDS.includes(batch.kind)) return null;
    const ids = (batch.createdIds as string[]).slice(0, 30);
    // In the order they were imported (the file's order, so admission numbers run upwards).
    const order = new Map(ids.map((id, i) => [id, i]));
    const students = (await tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, admissionNo: true, archivedAt: true } }))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const who = batch.importedById ? await tx.userLogin.findUnique({ where: { id: batch.importedById }, select: { displayName: true } }) : null;
    // Parents brought in with no phone (owner decision 15): listed as "Phone missing", to add a phone later.
    const all = batch.createdIds as string[];
    const noPhone = all.length && !batch.undoneAt ? await tx.guardian.findMany({
      where: { phone: null, archivedAt: null, students: { some: { archivedAt: null, studentId: { in: all } } } },
      select: { id: true, name: true, students: { where: { archivedAt: null, studentId: { in: all } }, select: { student: { select: { fullName: true } } }, take: 2 } },
      orderBy: { name: "asc" }, take: 31,
    }) : [];
    return { batch, students, who, noPhone };
  });
  if (!data) notFound();
  const { batch } = data;
  const bad = batch.errorReport as { line: number; problems: string[]; row: Record<string, string> }[];

  return (
    <>
      <RecordTitle name={batch.fileName} />
      <BackLink href={`${BASE}/import/history`} label="Import history" />
      <PageHeader title={`Import of ${batch.fileName}`} href={`${BASE}/import/${batch.id}`} userId={current.user.id}>
        <ButtonLink href={`${BASE}/import/history`} size="sm"><Words k="Import history" /></ButtonLink>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`${batch.added} added · ${batch.updated} updated · ${batch.skipped} skipped`} description={`${formatDateTime(batch.createdAt, tz)} by ${data.who?.displayName ?? "someone"}`}
            action={batch.undoneAt ? <Badge><Words k="Undone" /></Badge> : <Badge tone="success"><Words k="Imported" /></Badge>} />
          <CardBody className="space-y-3">
            {data.students.length > 0 && (
              <ul className="space-y-1 text-[15px]">
                {data.students.map((s) => <li key={s.id}>{s.archivedAt ? <span className="text-ink2 line-through">{s.fullName}</span> : <Link className="hover:underline" href={`${BASE}/students/${s.id}`}>{s.fullName}</Link>} <span className="text-[13.5px] text-ink2">{s.admissionNo}</span></li>)}
                {batch.added > data.students.length && <li className="text-ink2"><Words k="and" /> {batch.added - data.students.length} <Words k="more" /></li>}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {!batch.undoneAt && <ButtonLink href={`${BASE}?new=1`} size="sm"><Words k="See them in the Student List" /></ButtonLink>}
              {!batch.undoneAt && (batch.added > 0 || batch.updated > 0) && (
                <ConfirmAction action={undoImportAction} fields={{ id: batch.id }} trigger="Undo this import" triggerVariant="danger-outline" title="Undo this import?" confirmLabel="Undo import" confirmVariant="danger">
                  {batch.added > 0 && <>{batch.added === 1 ? "The 1 student it added is archived, with their class and parent links, and their admission number is free for a corrected file." : `The ${batch.added} students it added are archived, with their class and parent links, and their admission numbers are free for a corrected file.`} <Words k="Parents with no other child are archived too." /> </>}
                  {batch.updated > 0 && <><Words k="The" /> {batch.updated} <Words k="students it updated get their earlier values back, except any changed again since." /> </>}
                  <Words k="The import stays in the history." />
                </ConfirmAction>
              )}
            </div>
            {batch.undoneAt && <p className="text-ink2"><Words k="Undone" /> {formatDateTime(batch.undoneAt, tz)}.</p>}
          </CardBody>
        </Card>
        {data.noPhone.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader title={data.noPhone.length > 30 ? "More than 30 parents have no phone" : `${data.noPhone.length} ${data.noPhone.length === 1 ? "parent has" : "parents have"} no phone`}
              description="Brought in and marked Phone missing. They get no Parent Link or messages until a phone is added."
              action={<ButtonLink href={`${BASE}/guardians?phone=missing`} size="sm"><Any text="See them all" /></ButtonLink>} />
            <CardBody>
              <ul className="divide-y divide-line text-[15px]">
                {data.noPhone.slice(0, 30).map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><Link className="font-medium hover:underline" href={`${BASE}/guardians/${g.id}`}>{g.name}</Link>{g.students.length > 0 && <span className="text-[13.5px] text-ink2"> · {g.students.map((x) => x.student.fullName).join(", ")}</span>}</span>
                    <PhoneMissing className="text-[13.5px]" editHref={`${BASE}/guardians/${g.id}/edit`} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Skipped rows" description={bad.length ? "Download them with their problems, fix and import again." : undefined} />
          <CardBody>
            {bad.length === 0 ? <p className="text-ink2"><Words k="Every row was imported." /></p> : (
              <>
                <a href={`${BASE}/import/${batch.id}/errors`} className="mb-3 inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-medium hover:bg-sunken"><Words k="Download skipped rows (CSV)" /></a>
                <ul className="max-h-96 divide-y divide-line overflow-y-auto text-[15px]">
                  {bad.slice(0, 100).map((b) => <li key={b.line} className="py-2"><strong><Words k="Row" /> {b.line}</strong>{b.row.fullName ? ` · ${b.row.fullName}` : ""}: <span className="text-bad">{b.problems.join(" ")}</span></li>)}
                </ul>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
