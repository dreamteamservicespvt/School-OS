import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { blockers, goLiveSummary, settleImports, warnings } from "@/lib/move-in/service";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ExpectedForm } from "../forms";
import { GoLiveButton } from "../parts";

export const metadata: Metadata = { title: "Go-live check · Switching to School OS" };

const BASE = "/settings/data-security/switching";

/** Workflow 15, step 9: the go-live summary beside the old software's numbers, then the Principal goes live. */
export default async function GoLiveCheckPage() {
  const { current } = await requireSettingsPage("data-security");
  const tz = current.school.timeZone;
  const s = await withSchool(current.ctx, async (tx) => { await settleImports(tx); return goLiveSummary(tx, current.ctx); });
  const stop = blockers(s);
  const look = warnings(s);
  const canLive = can(current.permissions, "settings", "edit");
  const e = s.expected;
  const live = s.plan?.wentLiveAt;
  const kept = s.plan?.liveSummary as { students: number; staff: number; guardians: number } | null | undefined;
  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <>
      <div className="mb-4">
        <Link href={BASE} className="text-sm font-medium text-brand-text hover:underline">← Switching to School OS</Link>
        <h2 className="mt-1 text-xl font-semibold">Go-live check</h2>
        <p className="text-ink-2">{s.year ? `Academic year ${s.year.name}.` : "No academic year is set up yet."} Each number opens the list behind it.</p>
      </div>

      {live && kept && (
        <Alert tone="success" className="mb-5" title={`Live on School OS since ${formatDate(s.plan!.goLiveDate ?? live, tz)}.`}>
          Confirmed {formatDateTime(live, tz)} with {kept.students} students, {kept.staff} staff and {kept.guardians} parents.
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Total label="Students" value={s.students} expected={e.students} href="/student-management" />
        <Total label="Staff" value={s.staff} expected={e.staff} href="/staff-hr-management" />
        <Total label="Parents" value={s.guardians} expected={e.guardians} href="/student-management" />
        <Total label="Families" value={s.families} hint="Parents grouped by phone number" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Students in each class" description="Compare with the class registers or your old software's class strength report." />
            {s.classes.length === 0 ? <CardBody><p className="text-ink-2">No classes this year yet. <Link href="/academic-management" className="font-medium text-brand-text underline">Set them up</Link>.</p></CardBody> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-[15px]">
                  <caption className="sr-only">Students in each class and section</caption>
                  <thead className="bg-surface-2 text-sm"><tr><th scope="col" className="px-4 py-2 text-left font-medium">Class</th><th scope="col" className="px-4 py-2 text-left font-medium">Sections</th><th scope="col" className="px-4 py-2 text-right font-medium">Students</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {s.classes.map((c) => (
                      <tr key={c.id}>
                        <th scope="row" className="px-4 py-2 text-left font-medium">{c.name}</th>
                        <td className="px-4 py-2">
                          <span className="flex flex-wrap gap-x-3 gap-y-1">
                            {c.sections.map((x) => (
                              <Link key={x.id} href={`/student-management?section=${x.id}`} className={`underline-offset-2 hover:underline ${x.students > x.seats ? "text-danger" : ""}`}>{x.name}: {x.students}{x.students > x.seats ? ` of ${x.seats} seats` : ""}</Link>
                            ))}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">{c.sections.reduce((n, x) => n + x.students, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-line-strong"><tr><th scope="row" colSpan={2} className="px-4 py-2 text-left">Total</th><td className="px-4 py-2 text-right font-semibold">{s.students}</td></tr></tfoot>
                </table>
              </div>
            )}
          </Card>
          {(stop.length > 0 || look.length > 0) && (
            <Card>
              <CardHeader title="Worth a look" description="Problems in red stop going live; the others do not." />
              <CardBody>
                <ul className="space-y-2">
                  {stop.map((t) => <li key={t} className="text-danger">{t}</li>)}
                  {look.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </CardBody>
            </Card>
          )}
          {stop.length === 0 && look.length === 0 && <Alert tone="success" title="Everything matches." />}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="What your old software says" description="Type the totals from the old software or registers. School OS shows any difference." />
            <CardBody>
              {canLive ? <ExpectedForm values={{ oldSoftware: s.plan?.oldSoftware ?? "", students: e.students?.toString() ?? "", staff: e.staff?.toString() ?? "", guardians: e.guardians?.toString() ?? "", goLiveDate: iso(s.plan?.goLiveDate) }} />
                : <p className="text-ink-2">The Principal or School Admin fills these.</p>}
            </CardBody>
          </Card>
          {!live && (
            <Card>
              <CardHeader title="Go live" description="On going live, the move-in is marked done, and the go-live summary is kept. Records can still be added and imports undone." />
              <CardBody>
                {!canLive ? <p className="text-ink-2">The Principal or School Admin confirms going live.</p>
                  : stop.length ? <p className="text-ink-2">Clear the problems in red first.</p>
                  : <GoLiveButton students={s.students} staff={s.staff} guardians={s.guardians} />}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Total({ label, value, expected, href, hint }: { label: string; value: number; expected?: number | null; href?: string; hint?: string }) {
  const diff = expected == null ? null : value - expected;
  const inner = (
    <>
      <p className="text-sm text-ink-2">{label}</p>
      <p className="text-2xl font-semibold">{value.toLocaleString("en-IN")}</p>
      {diff !== null ? <p className={`text-sm ${diff === 0 ? "text-success" : "text-danger"}`}>{diff === 0 ? "Matches the old software" : `Old software: ${expected!.toLocaleString("en-IN")} (${diff > 0 ? "+" : ""}${diff})`}</p>
        : hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
    </>
  );
  return href
    ? <Link href={href} className="block rounded-2xl border border-line bg-surface px-4 py-3 shadow-card hover:border-line-strong">{inner}</Link>
    : <div className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">{inner}</div>;
}
