import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { findModule } from "@/lib/modules";
import { formatDate, formatDateTime } from "@/lib/format";
import { canBring, canUndo, goLiveSummary, kindInfo, kindModule, moveInKinds, settleImports } from "@/lib/move-in/service";
import { fileBatchIds } from "@/lib/move-in/batches";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { AutoRefresh } from "../parts";
import { UploadForm } from "@/components/import/file-forms";
import { OWN_RULES, PLACES } from "@/lib/imports/places";
import { placeRefusal } from "@/lib/imports/place-access";
import { RemoveFileButton } from "@/components/import/file-buttons";

export const metadata: Metadata = { title: "Switching to School OS · Data Backup & Security" };

const BASE = "/settings/data-security/switching";

/**
 * Steps of workflow 15 that are typed on a screen, not brought in from a file:
 * they sit between the imports, in the order the school does them.
 */
const SCREEN_STEPS = [
  { key: "fee-structures", order: 5, title: "Set this year's fee structures", module: "fee-management" as const, href: "/fee-management/structure", button: "Open Fee Structure", about: "The Accountant sets each class's fees for this year before bringing in old dues, so dues and receipts land on the right fee heads." },
  { key: "opening-balances", order: 8, title: "Opening cash and bank balances", module: "finance-management" as const, href: "/finance-management/cash-bank", button: "Open Cash & Bank", about: "The Accountant enters the cash book and each bank account on the go-live date, and the financial year (April to March unless changed)." },
];

/** Where each import also has its own page in its module, for people who do not use Settings (the Accountant): the same engine there. */
const MODULE_PAGE: Record<string, string> = Object.fromEntries(
  Object.values(PLACES).filter((p) => p.key !== "settings").flatMap((p) => (p.kinds ?? []).map((k) => [k, `${p.base}?kind=${k}`])),
);

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Switching to School OS (workflow 15): the plan, the files being brought in, and the go-live check. */
export default async function SwitchingPage({ searchParams }: Search) {
  const { current } = await requireSettingsPage("data-security");
  const sp = await searchParams;
  const wantKind = typeof sp.kind === "string" ? sp.kind : undefined;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    await settleImports(tx);
    const [files, summary, counts] = await Promise.all([
      tx.moveInFile.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
      goLiveSummary(tx, current.ctx),
      Promise.all([
        tx.department.count({ where: { archivedAt: null } }),
        tx.studentFeeDue.count({ where: { broughtIn: true, kind: "OLD_DUES", state: { not: "REMOVED" } } }),
        tx.payment.count({ where: { broughtIn: true, status: { not: "CANCELLED" } } }),
        tx.expense.count({ where: { broughtIn: true, status: { not: "CANCELLED" } } }),
        tx.feeStructure.count({ where: { archivedAt: null } }),
        tx.openingBalance.count({ where: { archivedAt: null, kind: { not: "STUDENT_DUES" } } }),
        tx.openingAttendance.count({ where: { archivedAt: null } }),
        tx.staff.count({ where: { archivedAt: null, OR: [{ bankAccountEnc: { not: null } }, { panEnc: { not: null } }, { uan: { not: null } }] } }),
        tx.leaveBalance.count({ where: { archivedAt: null, adjustments: { array_contains: [{ kind: "brought-in" }] } } }),
      ]),
    ]);
    const batches = await tx.importBatch.findMany({ where: { id: { in: files.flatMap((f) => fileBatchIds(f)) } } });
    return { files, summary, counts, batches: new Map(batches.map((b) => [b.id, b])) };
  });
  const { summary } = data;
  const kinds = moveInKinds(current.modulesOn);
  // A kind whose own module page has a narrower rule (attendance so far, pay details) keeps it here.
  const refused = new Set<string>();
  for (const k of Object.keys(OWN_RULES)) {
    if (await placeRefusal(current, PLACES.settings, k, "create")) refused.add(k);
  }
  const mayBring = (key: string) => !refused.has(key) && canBring(current.permissions, key, current.modulesOn);
  const mayUndo = (key: string) => !refused.has(key) && canUndo(current.permissions, key, current.modulesOn);
  const mine = kinds.filter((k) => mayBring(k.key));
  // Files of records the person may not see in their own module (salary details, for example) are not listed.
  const files = data.files.filter((f) => can(current.permissions, kindModule(f.kind), "view") && !refused.has(f.kind));
  const importing = files.some((f) => f.status === "importing");
  const live = summary.plan?.wentLiveAt;
  const [departments, oldDues, receipts, expenses, structures, openings, attendanceSoFar, payDetails, leaveBalances] = data.counts;
  const have: Record<string, number> = {
    departments, staff: summary.staff, students: summary.students, "fee-old-dues": oldDues, "fee-past-receipts": receipts, "finance-past-expenses": expenses,
    "fee-structures": structures, "opening-balances": openings, "attendance-so-far": attendanceSoFar, "staff-leave-balances": leaveBalances, "staff-pay-details": payDetails,
  };
  // The steps after setting up the year: each import, and the steps typed on a screen, in workflow 15 order.
  const steps = [
    ...kinds.map((k) => ({ kind: k, screen: null, order: k.order })),
    ...SCREEN_STEPS.map((s) => ({ kind: null, screen: s, order: s.order })),
  ].sort((a, b) => a.order - b.order);
  const setUp = Boolean(summary.year && summary.classes.length);
  const sectionCount = summary.classes.reduce((n, c) => n + c.sections.length, 0);

  return (
    <>
      <h2 className="sr-only">Switching to School OS</h2>
      {importing && <AutoRefresh seconds={5} />}
      {live && (
        <Alert tone="success" className="mb-5" title={`Your school went live on School OS on ${formatDate(summary.plan!.goLiveDate ?? live, tz)}.`}>
          You can still bring in records you missed. <Link href={`${BASE}/check`} className="font-medium underline">See the go-live summary</Link>
        </Alert>
      )}
      {!live && summary.plan && (
        <Alert tone="info" className="mb-5" title="Your school is moving in.">
          Automatic messages to parents, fee reminders and late fees wait until the Principal presses Go live on the <Link href={`${BASE}/check`} className="font-medium underline">go-live check</Link>. Messages sent by hand still go.
        </Alert>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Your move to School OS" description="Bring in what your old software, Excel sheets or registers hold, in this order. You can start on any day of the year." />
          <CardBody className="p-0">
            <ol className="divide-y divide-line">
              <Step n={1} title="Set up the school year" done={setUp}
                status={setUp ? `${summary.year!.name}: ${summary.classes.length} classes, ${sectionCount} sections` : summary.year ? "Add this year's classes and sections" : "Add the current academic year"}
                about="School profile, the current academic year, classes, sections and subjects. Students are matched to these.">
                <ButtonLink href="/academic-management" size="sm">{setUp ? "Open Academic Management" : "Set up classes"}</ButtonLink>
              </Step>
              {steps.map(({ kind: k, screen: s }, i) => k ? (
                <Step key={k.key} n={i + 2} title={k.label} done={(have[k.key] ?? 0) > 0}
                  status={have[k.key] !== undefined ? `${have[k.key]} in School OS` : undefined} about={k.about}>
                  {mayBring(k.key) && <ButtonLink href={`${BASE}?kind=${k.key}#bring-in`} size="sm">Bring in</ButtonLink>}
                  {!refused.has(k.key) && <a href={`${BASE}/template/${k.key}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2">Ready Excel sheet</a>}
                  {MODULE_PAGE[k.key] && <span className="text-sm text-ink-2">Also on {findModule(k.module)?.name ?? "its module"}, for the person who does it.</span>}
                </Step>
              ) : s && (
                <Step key={s.key} n={i + 2} title={s.title} done={(have[s.key] ?? 0) > 0} about={s.about}>
                  {can(current.permissions, s.module, "view") && <ButtonLink href={s.href} size="sm">{s.button}</ButtonLink>}
                </Step>
              ))}
              <Step n={steps.length + 2} title="Check and go live" done={Boolean(live)}
                status={live ? `Live since ${formatDate(summary.plan!.goLiveDate ?? live, tz)}` : "Compare the totals with your old software, then go live"}
                about="Students per class, staff, parents and the money brought in, beside what your old software says. The Principal confirms going live, and automatic messages and late fees start.">
                <ButtonLink href={`${BASE}/check`} size="sm" variant={live ? "secondary" : "primary"}>Open the go-live check</ButtonLink>
              </Step>
            </ol>
          </CardBody>
        </Card>

        <Card id="bring-in" className="self-start">
          <CardHeader title="Bring in a file" description="School OS finds the headings, works out what the file holds, matches the columns and tidies dates, phones and names. You check every row before anything is saved." />
          <CardBody>
            {mine.length ? <UploadForm place="settings" kinds={mine.map((k) => ({ value: k.key, label: k.label }))} kind={wantKind && mine.some((k) => k.key === wantKind) ? wantKind : undefined} />
              : <p className="text-ink-2">Your role can see this page but not add records. Ask your School Admin.</p>}
            <details className="mt-4 text-sm text-ink-2">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-ink">Records on paper?</summary>
              <p>Download the ready Excel sheet next to each step. It has drop-down lists of your own classes, sections and designations, so typing from the register is quick and the rows are right the first time.</p>
            </details>
            <details className="text-sm text-ink-2">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-ink">Old Excel file (.xls)?</summary>
              <p>Open it in Excel and use Save As, Excel Workbook (.xlsx), then upload that.</p>
            </details>
          </CardBody>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Files</h2>
      {importing && <p className="mb-3 text-ink-2" role="status">An import is running now. This page updates by itself.</p>}
      {files.length === 0 ? (
        <EmptyState title="No files yet">Upload your first file above. Staff usually come first, then students and parents.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {files.map((f) => {
            const sheet = (f.sheets as { name: string; rows: number }[])[f.sheetIndex];
            const batch = f.batchId ? data.batches.get(f.batchId) : undefined;
            const part = fileBatchIds(f).map((b) => data.batches.get(b)).filter((b) => b !== undefined);
            const added = part.reduce((n, b) => n + b.added, 0);
            const label = kindInfo(f.kind)?.label ?? f.kind;
            return (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`${BASE}/${f.id}`} className="font-medium text-brand-text underline-offset-2 hover:underline break-all">{f.fileName}{(f.sheets as unknown[]).length > 1 && sheet ? ` · ${sheet.name}` : ""}</Link>
                  <p className="text-sm text-ink-2">{label} · uploaded {formatDateTime(f.createdAt, tz)}{part.length ? ` · ${added} added` : ""}{f.status === "open" && part.length && f.waiting ? ` · ${f.waiting} ${f.waiting === 1 ? "row" : "rows"} not brought in yet` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FileStatus status={f.status} undone={Boolean(batch?.undoneAt)} part={part.length > 0} />
                  {f.status !== "importing" && mayBring(f.kind) && <RemoveFileButton place="settings" id={f.id} imported={f.status === "imported" || part.length > 0} back={BASE} />}
                  {f.status === "imported" && batch && !batch.undoneAt && mayUndo(f.kind) && <ButtonLink href={`${BASE}/${f.id}`} size="sm">See result</ButtonLink>}
                  {f.status === "open" && mayBring(f.kind) && <ButtonLink href={`${BASE}/${f.id}`} size="sm" variant="primary">Continue</ButtonLink>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!can(current.permissions, "settings", "edit") && <p className="mt-4 text-sm text-ink-2">The Principal or School Admin confirms going live.</p>}
    </>
  );
}

function Step({ n, title, done, status, about, children }: { n: number; title: string; done: boolean; status?: string; about: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? "bg-success-soft text-success" : "bg-surface-2 text-ink-2"}`}>{done ? "✓" : n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{title} <span className="sr-only">{done ? "(done)" : "(to do)"}</span></h3>
        {status && <p className="text-sm font-medium text-ink">{status}</p>}
        <p className="text-sm text-ink-2">{about}</p>
        {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </li>
  );
}

function FileStatus({ status, undone, part }: { status: string; undone: boolean; part: boolean }) {
  if (status === "importing") return <Badge tone="brand">Importing</Badge>;
  if (status === "imported") return undone ? <Badge>Undone</Badge> : <Badge tone="success">Imported</Badge>;
  return <Badge tone="warning">{part ? "Part brought in" : "Being checked"}</Badge>;
}
