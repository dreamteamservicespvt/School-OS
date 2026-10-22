import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { findStudents } from "@/lib/students/find";
import { formatDate, formatDateTime } from "@/lib/format";
import { DELETION_PARTS, personTypesFor, retentionRules, type PersonType } from "@/lib/data-security/privacy";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClearRetentionButton, DeletionForm, RetentionForm } from "./forms";
import { AUTO_WORDS, CLEARABLE, countWords, NEVER_CLEARED, retentionOverview, type Counts, type Due } from "@/lib/data-security/retention";
import { loginNames } from "@/lib/settings/common";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Privacy · Data Backup & Security") };
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPE_LABEL: Record<PersonType, string> = { student: "Student", guardian: "Parent or guardian", staff: "Staff member" };
const STATUS: Record<string, { label: string; tone: "warning" | "success" | "neutral" | "danger" }> = {
  waiting: { label: "Waiting for approval", tone: "warning" },
  completed: { label: "Removed", tone: "success" },
  rejected: { label: "Not approved", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export default async function PrivacyPage({ searchParams }: Search) {
  const { current, may } = await requireSettingsPage("data-security");
  const sp = await searchParams;
  const tz = current.school.timeZone;
  const types = personTypesFor(current.permissions);
  const type = (types.includes(one(sp.type) as PersonType) ? one(sp.type) : types[0]) as PersonType | undefined;
  const q = one(sp.q).slice(0, 80);
  const personId = UUID.test(one(sp.person)) ? one(sp.person) : null;
  const canAsk = may.create;
  const canEdit = may.edit;
  const canExport = may.export;

  const data = await withSchool(current.ctx, async (tx) => {
    const rules = await retentionRules(tx);
    const retention = await retentionOverview(tx);
    const clearers = await loginNames(tx, retention.history.map((h) => h.clearedById));
    const requests = await tx.deletionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
    let found: { id: string; name: string; detail: string }[] = [];
    if (type && q.length >= 2) {
      const contains = { contains: q, mode: "insensitive" as const };
      // Students: the one student search, every status, archived records too.
      if (type === "student") found = (await findStudents(tx, q, { scope: {}, yearId: null, statuses: "any", archived: "include", byParent: false, take: 10 })).map((s) => ({ id: s.id, name: s.name, detail: `Admission no. ${s.admissionNo}` }));
      else if (type === "guardian") found = (await tx.guardian.findMany({ where: { OR: [{ name: contains }, { phone: { contains: q } }] }, take: 10, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } })).map((g) => ({ id: g.id, name: g.name, detail: g.phone ? `Phone ending ${g.phone.slice(-4)}` : "" }));
      else found = (await tx.staff.findMany({ where: { OR: [{ fullName: contains }, { staffCode: contains }] }, take: 10, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } })).map((s) => ({ id: s.id, name: s.fullName, detail: `Staff ID ${s.staffCode}` }));
    }
    let chosen: { id: string; name: string } | null = null;
    if (type && personId) {
      if (type === "student") chosen = await tx.student.findUnique({ where: { id: personId }, select: { id: true, fullName: true } }).then((s) => (s ? { id: s.id, name: s.fullName } : null));
      else if (type === "guardian") chosen = await tx.guardian.findUnique({ where: { id: personId }, select: { id: true, name: true } });
      else chosen = await tx.staff.findUnique({ where: { id: personId }, select: { id: true, fullName: true } }).then((s) => (s ? { id: s.id, name: s.fullName } : null));
    }
    return { rules, requests, found, chosen, retention, clearers };
  });

  return (
    <div className="space-y-5">
      <h2 className="sr-only"><Words k="Privacy" /></h2>
      <Card>
        <CardHeader title="How long records are kept" description="Under the DPDP Act 2023, personal data is kept only as long as it is needed. Some records must be kept by law." />
        <CardBody><RetentionForm rules={data.rules} canEdit={canEdit} /></CardBody>
      </Card>

      <Card id="retention">
        <CardHeader title="Records past their keeping period" description="Every night School OS looks for records older than the periods above. They are listed here for the School Admin; nothing is cleared until you say yes. Clearing removes the personal details and keeps the record." />
        <CardBody className="space-y-4">
          {data.retention.waiting ? (() => {
            const due = data.retention.waiting.due as Due;
            const entries = Object.entries(due) as [keyof typeof CLEARABLE, { count: number; before: string }][];
            const total = entries.reduce((n, [, v]) => n + v.count, 0);
            const lines = entries.map(([k, v]) => `${countWords(k, v.count)} from before ${formatDate(new Date(v.before), tz)}: ${CLEARABLE[k].how.toLowerCase()}`);
            return (
              <div className="space-y-3">
                <p className="font-medium"><Words k="Found on" /> {formatDate(data.retention.waiting.runOn, tz)}:</p>
                <ul className="list-disc space-y-1 pl-5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
                {canEdit ? <ClearRetentionButton runId={data.retention.waiting.id} total={total} lines={lines} /> : <p className="text-sm text-ink-2"><Words k="Only the School Admin can clear these." /></p>}
              </div>
            );
          })() : (
            <p className="text-ink-2">{data.retention.latest ? `Nothing is past its period. Last checked ${formatDate(data.retention.latest.runOn, tz)}.` : "The first check runs tonight."}</p>
          )}
          <p className="text-sm text-ink-2"><Words k="Never cleared here:" /> {NEVER_CLEARED.join("; ")}<Words k=". One-time codes older than 30 days and full data exports whose link has expired are cleared by themselves." /></p>
          {data.retention.history.length > 0 && (
            <>
              <h3 className="pt-2 font-semibold"><Words k="What was cleared" /></h3>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.retention.history.map((h) => {
                  const cleared = Object.entries(h.cleared as Counts).map(([k, n]) => countWords(k, n));
                  const auto = Object.entries(h.autoCleared as Counts).map(([k, n]) => `${n} ${(AUTO_WORDS[k] ?? [k, k])[n === 1 ? 0 : 1]}`);
                  return (
                    <li key={h.id} className="p-3">
                      {cleared.length > 0 && <p><span className="font-medium">{cleared.join(", ")}</span> <span className="text-ink-2"><Words k="· cleared" /> {h.clearedAt ? formatDateTime(h.clearedAt, tz) : ""}{h.clearedById ? ` by ${data.clearers.get(h.clearedById) ?? "a School Admin"}` : ""}</span></p>}
                      {auto.length > 0 && <p className="text-sm text-ink-2">{formatDate(h.runOn, tz)}: {auto.join(", ")} <Words k="cleared by themselves" /></p>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      <Card id="deletion">
        <CardHeader title="A person's data" description="When a parent, student or staff member asks to see or remove their data. Removal needs approval and is written to the audit log." />
        <CardBody className="space-y-4">
          {types.length === 0 ? (
            <p className="text-ink-2"><Words k="Your role cannot see student or staff records, so you cannot look a person up here." /></p>
          ) : (
            <form method="get" action="/settings/data-security/privacy#deletion" className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="p-type" className="mb-1 block text-sm font-medium"><Words k="Who" /></label>
                <select id="p-type" name="type" defaultValue={type} className="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-base text-ink">
                  {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="min-w-0 flex-1 basis-56">
                <label htmlFor="p-q" className="mb-1 block text-sm font-medium"><Words k="Name, admission no., staff ID or phone" /></label>
                <input id="p-q" name="q" type="search" defaultValue={q} className="min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base text-ink" />
              </div>
              <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-medium text-brand-ink hover:bg-brand-hover"><Words k="Find" /></button>
            </form>
          )}

          {q.length === 1 && <p className="text-ink-2"><Words k="Type at least 2 letters or digits." /></p>}
          {q.length >= 2 && !data.chosen && (
            data.found.length === 0 ? <p className="text-ink-2"><Words k="Nobody matches “" />{q}<Words k="”. Check the spelling, or search by number." /></p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {data.found.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div><p className="font-medium">{p.name}</p><p className="text-sm text-ink-2">{p.detail}</p></div>
                    <Link href={`/settings/data-security/privacy?type=${type}&person=${p.id}#deletion`} className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2"><Words k="Choose" /></Link>
                  </li>
                ))}
              </ul>
            )
          )}

          {data.chosen && type && (
            <div className="space-y-4 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{data.chosen.name} <span className="font-normal text-ink-2">· {TYPE_LABEL[type]}</span></p>
                <div className="flex flex-wrap gap-2">
                  {canExport && <a href={`/settings/data-security/privacy/person-export?type=${type}&id=${data.chosen.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 font-medium hover:bg-surface-2"><Words k="Export this person's data" /></a>}
                  <Link href="/settings/data-security/privacy#deletion" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2"><Words k="Choose someone else" /></Link>
                </div>
              </div>
              {canAsk ? <DeletionForm personType={type} personId={data.chosen.id} personName={data.chosen.name} parts={DELETION_PARTS} /> : <p className="text-ink-2"><Words k="Your role cannot ask for data to be removed. Ask your School Admin." /></p>}
            </div>
          )}

          <h3 className="pt-2 font-semibold"><Words k="Requests to remove data" /></h3>
          {data.requests.length === 0 ? <p className="text-ink-2"><Words k="No requests yet." /></p> : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {data.requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.personName} <span className="font-normal text-ink-2">· {TYPE_LABEL[r.personType as PersonType] ?? r.personType}</span></p>
                    <p className="text-sm text-ink-2">
                      {r.scope === "all" ? "All personal details" : r.scope.split(",").map((k) => DELETION_PARTS.find((p) => p.key === k)?.label.split(" (")[0] ?? k).join("; ")}
                      {" · "}<Words k="Asked by" /> {r.askedBy} · {formatDate(r.createdAt, tz)}
                    </p>
                    {r.completedAt && <p className="text-sm text-ink-2"><Words k="Removed" /> {formatDateTime(r.completedAt, tz)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                    {r.status === "waiting" && r.approvalId && <Link href="/approvals" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-brand-text hover:bg-surface-2"><Words k="Open in Approvals" /></Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
