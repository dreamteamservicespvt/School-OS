import type { Metadata } from "next";
import Link from "next/link";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { blockers, goLiveSummary, settleImports, warnings } from "@/lib/move-in/service";
import { isFinance, MONEY_KEYS, MONEY_WORDS, moneyFigure, moneyWarnings, paiseOf, rupeesText, type MoneyTotals } from "@/lib/move-in/money";
import { viewOf } from "@/lib/fees/before-go-live";
import { counterAllowed, feeSettings } from "@/lib/fees/settings";
import { feeViewer } from "@/lib/fees/access";
import { BeforeGoLivePanel } from "@/app/(school)/fee-management/ledger/import/before-go-live";
import { GO_LIVE_FORM_ANCHOR } from "@/lib/fees/go-live-date-hint";
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
  const see = { fees: can(current.permissions, "fee-management", "view"), finance: can(current.permissions, "finance-management", "view") };
  const { s, canSettle } = await withSchool(current.ctx, async (tx) => {
    await settleImports(tx);
    const sum = await goLiveSummary(tx, current.ctx);
    // Settling fees due before go-live is a change to students' fees (Fee Management, "Edit a student's fees").
    const viewer = see.fees && can(current.permissions, "fee-management", "edit") ? await feeViewer(tx, current.ctx, current) : null;
    const settle = Boolean(viewer && viewer.change === "all" && counterAllowed(await feeSettings(tx, current.ctx), viewer.roleKeys, "edit-student-fees"));
    return { s: sum, canSettle: settle };
  });
  const stop = blockers(s);
  const look = [...warnings(s), ...moneyWarnings(s.money, s.expected, see)];
  const canLive = can(current.permissions, "settings", "edit");
  const e = s.expected;
  const owedBefore = see.fees && s.money.before ? s.money.before.owed : null;
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
          {(see.fees || see.finance) && <MoneyCard m={s.money} expected={e} see={see} />}
          {see.fees && (
            <Card>
              <CardHeader title="Fees due before go-live" description="The fee plans cover the whole year. Months before the go-live date were the old software's, and are never billed twice." />
              <CardBody><BeforeGoLivePanel view={viewOf(s.money.before)} canSettle={canSettle} place={{ on: "go-live-check", canType: canLive }} /></CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card id={GO_LIVE_FORM_ANCHOR}>
            <CardHeader title="What your old software says" description="Type the totals from the old software or registers. School OS shows any difference." />
            <CardBody>
              {canLive ? <ExpectedForm money={see} values={{
                oldSoftware: s.plan?.oldSoftware ?? "", students: e.students?.toString() ?? "", staff: e.staff?.toString() ?? "", guardians: e.guardians?.toString() ?? "", goLiveDate: iso(s.plan?.goLiveDate),
                ...Object.fromEntries(MONEY_KEYS.filter((k) => (isFinance(k) ? see.finance : see.fees)).map((k) => [k, rupeesText(paiseOf(e[k]))])),
              }} />
                : <p className="text-ink-2">The Principal or School Admin fills these.</p>}
            </CardBody>
          </Card>
          {!live && (
            <Card>
              <CardHeader title="Go live" description="On going live, the move-in is marked done, and the go-live summary is kept. Records can still be added and imports undone." />
              <CardBody>
                {!canLive ? <p className="text-ink-2">The Principal or School Admin confirms going live.</p>
                  : stop.length ? <p className="text-ink-2">Clear the problems in red first.</p>
                  : <GoLiveButton students={s.students} staff={s.staff} guardians={s.guardians} owedBefore={owedBefore && owedBefore.rows ? { amount: formatRupees(owedBefore.paise), students: owedBefore.students } : null} />}
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

/** The money School OS holds from the old software beside what the old software says (workflow 15, step 9). */
function MoneyCard({ m, expected, see }: { m: MoneyTotals; expected: Record<string, unknown>; see: { fees: boolean; finance: boolean } }) {
  const counts = {
    oldDues: `${m.oldDues.students} ${m.oldDues.students === 1 ? "student" : "students"}`,
    pastReceipts: `${m.pastReceipts.receipts} ${m.pastReceipts.receipts === 1 ? "receipt" : "receipts"}, ${m.pastReceipts.students} ${m.pastReceipts.students === 1 ? "student" : "students"}`,
    advances: `${m.advances.students} ${m.advances.students === 1 ? "student" : "students"}`,
    cash: m.cash.accounts ? `${m.cash.accounts - m.cash.missing.length} of ${m.cash.accounts} set` : "No cash account",
    bank: m.bank.accounts ? `${m.bank.accounts - m.bank.missing.length} of ${m.bank.accounts} set` : "No bank account yet",
  } as const;
  const keys = MONEY_KEYS.filter((k) => (isFinance(k) ? see.finance : see.fees));
  return (
    <Card>
      <CardHeader title="Money brought in" description={m.goLive ? `As of the go-live date, ${formatDate(m.goLive)}. Compare with the old software's balance and collection reports.` : "Compare with the old software's balance and collection reports."} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-[15px]">
          <caption className="sr-only">Money in School OS beside the old software</caption>
          <thead className="bg-surface-2 text-sm"><tr>
            <th scope="col" className="px-4 py-2 text-left font-medium">What</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">School OS</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">Old software</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {keys.map((k) => {
              const have = moneyFigure(m, k);
              const said = paiseOf(expected[k] as string | null | undefined);
              const diff = said === null ? null : have - said;
              return (
                <tr key={k}>
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    <Link href={MONEY_WORDS[k].href} className="underline-offset-2 hover:underline">{MONEY_WORDS[k].label}</Link>
                    <span className="block text-sm font-normal text-ink-2">{counts[k]}</span>
                  </th>
                  <td className="px-4 py-2 text-right font-semibold">{formatRupees(have)}</td>
                  <td className="px-4 py-2 text-right">
                    {said === null ? <span className="text-ink-2">Not typed</span> : <>{formatRupees(said)}
                      <span className={`block text-sm ${diff === BigInt(0) ? "text-success" : "text-danger"}`}>{diff === BigInt(0) ? "Matches" : `${formatRupees(diff! > BigInt(0) ? diff! : -diff!)} ${diff! > BigInt(0) ? "more here" : "less here"}`}</span></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
