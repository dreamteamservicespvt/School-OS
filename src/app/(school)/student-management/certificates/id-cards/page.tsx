import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ActionForm, FormText, ResultLink } from "@/components/students/action-form";
import { StudentPicker } from "@/components/students/student-picker";
import { ID_BATCH_SIZE, idCardsHtml, sectionCards } from "@/lib/students/id-cards";
import { StudentProblem } from "@/lib/students/students";
import { BASE, studentPage } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { replaceCardAction, saveRfidAction } from "../../_actions/certificates";

export const metadata: Metadata = { title: "ID cards" };

const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));

/** ID cards (03 §2): class tiles; per class the total, batches of up to 50, missing photos, a single-card preview and batch PDFs; replacements and RFID. */
export default async function IdCardsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { current, settings, year, can, tz } = await studentPage();
  const sp = await searchParams;
  const path = `${BASE}/certificates/id-cards`;
  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await sectionOptions(tx, current, year?.id);
    let chosen: (Awaited<ReturnType<typeof sectionCards>> & { preview: string | null }) | null = null;
    let problem: string | null = null;
    if (isId(sp.section)) {
      try {
        const c = await sectionCards(tx, sp.section!);
        const first = c.students.find((s) => s.photoFileId) ?? c.students[0];
        const preview = first ? await idCardsHtml(tx, current.ctx, [first], { classLabel: c.label, yearName: c.section.academicYear.name, validUntil: settings.idCardValidUntil ?? c.section.academicYear.endDate }) : null;
        chosen = { ...c, preview };
      } catch (e) {
        if (e instanceof StudentProblem) problem = e.message; else throw e;
      }
    }
    const replacements = await tx.idCardPrint.findMany({ where: { isReplacement: true }, orderBy: { createdAt: "desc" }, take: 15 });
    const printedThisYear = year ? await tx.idCardPrint.groupBy({ by: ["sectionId"], where: { academicYearId: year.id, replacedAt: null }, _count: true }) : [];
    const names = await tx.student.findMany({ where: { id: { in: replacements.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
    return { sections, chosen, problem, replacements, printedThisYear, names };
  });
  const printed = new Map(data.printedThisYear.map((p) => [p.sectionId, p._count]));
  const c = data.chosen;
  const missing = c ? c.students.filter((s) => !s.photoFileId) : [];

  return (
    <>
      <PageHeader title="ID cards" href={path} userId={current.user.id} />
      {data.problem && <Alert tone="warning" className="mb-4">{data.problem}</Alert>}
      {!c ? (
        data.sections.length === 0 ? <EmptyState title="No classes this year">Set up classes and sections in Academic Management, then print ID cards class by class.</EmptyState> : (
          <>
            <p className="mb-3 text-ink-2">Pick a class. Cards print in batches of up to {ID_BATCH_SIZE} as a print-ready PDF.</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {data.sections.map((s) => (
                <li key={s.value}>
                  <Link href={`?section=${s.value}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-brand">
                    <span className="block text-lg font-semibold">{s.label}</span>
                    <span className="block text-sm text-ink-2">{s.filled} students</span>
                    <span className="block text-sm text-ink-2">{printed.get(s.value) ?? 0} cards printed</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <Card>
            <CardHeader title={`${c.label} · ${c.section.academicYear.name}`} description={`${c.students.length} students · up to ${ID_BATCH_SIZE} per batch · ${c.batches} ${c.batches === 1 ? "batch" : "batches"} · valid until ${formatDate(settings.idCardValidUntil ?? c.section.academicYear.endDate, tz)}`}
              action={<Link href={path} className="text-sm font-medium text-brand-text underline">All classes</Link>} />
            <CardBody className="space-y-4">
              {c.students.length === 0 ? <p className="text-ink-2">No students in this class yet.</p> : (
                <>
                  {missing.length > 0 && (
                    <Alert tone="warning" title={`${missing.length} ${missing.length === 1 ? "student has" : "students have"} no photo`}
                      action={<Link className="font-medium underline" href={`${BASE}/bulk-photos`}>Upload photos</Link>}>
                      <ul className="mt-1 flex flex-wrap gap-x-3">{missing.map((s) => <li key={s.id}><Link className="underline" href={`${BASE}/students/${s.id}`}>{s.fullName}</Link></li>)}</ul>
                      <p className="mt-1">Their cards print with an empty photo box. Print anyway, or add photos first.</p>
                    </Alert>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: c.batches }, (_, b) => {
                      const from = b * ID_BATCH_SIZE + 1;
                      const to = Math.min(c.students.length, (b + 1) * ID_BATCH_SIZE);
                      return (
                        <a key={b} href={`${path}/print?section=${c.section.id}&batch=${b}`} target="_blank" rel="noreferrer" className={buttonClass(b === 0 ? "primary" : "secondary")}>
                          {missing.length ? "Print anyway" : "Print"}{c.batches > 1 ? ` batch ${b + 1} (${from} to ${to})` : ` ${c.students.length} cards`}
                        </a>
                      );
                    })}
                  </div>
                  <ul className="divide-y divide-line">
                    {c.students.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>{s.rollNo ? `${s.rollNo}. ` : ""}{s.fullName} <span className="text-sm text-ink-2">{s.admissionNo}</span></span>
                        <span className="flex gap-1">{!s.photoFileId && <Badge tone="warning">No photo</Badge>}{s.printed ? <Badge tone="success">Printed</Badge> : <Badge>Not printed</Badge>}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
          {c.preview && (
            <Card className="self-start">
              <CardHeader title="Preview a card" description="The fields shown are set in Student Settings, ID cards." />
              <CardBody>
                <iframe title="ID card preview" srcDoc={c.preview} sandbox="" className="h-[60mm] w-full rounded-lg border border-line bg-surface-2" />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {can.manage && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Reprint a replacement card" description="Lost, damaged or details changed. The old card is kept on record as replaced." />
            <CardBody>
              <ActionForm action={replaceCardAction} submitLabel="Record and print" pendingText="Saving…" resetOnSuccess>
                <StudentPicker name="studentId" label="Student" sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} />
                <FormText name="reason" label="Reason" required maxLength={300} help="For example: lost on the school bus." />
                <ResultLink label="Print the replacement card" />
              </ActionForm>
              {data.replacements.length > 0 && (
                <>
                  <h3 className="mb-1 mt-5 font-medium">Replacement log</h3>
                  <ul className="divide-y divide-line text-[15px]">
                    {data.replacements.map((r) => (
                      <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <span>{data.names.find((n) => n.id === r.studentId)?.fullName} · {r.reason}</span>
                        <span className="text-sm text-ink-2">{formatDateTime(r.createdAt, tz)} · <a className="text-brand-text underline" href={`${path}/print?replacement=${r.id}`} target="_blank" rel="noreferrer">Print</a></span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>
          {settings.rfidOn && (
            <Card className="self-start">
              <CardHeader title="RFID card number" description="Recorded on the student for attendance devices." />
              <CardBody>
                <ActionForm action={saveRfidAction} submitLabel="Save" pendingText="Saving…" resetOnSuccess>
                  <StudentPicker name="studentId" label="Student" sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} />
                  <FormText name="rfidNo" label="RFID number" required maxLength={32} autoCapitalize="characters" help="As printed on the card, for example 04A3B2C1." />
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
