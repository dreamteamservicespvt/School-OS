import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { isoDay } from "@/lib/staff/dates";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { registerChoices } from "@/lib/attendance/register";
import { rangePeople, readReportInput, reportsFor, runReport, type ReportKey } from "@/lib/attendance/reports";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { ExportLinks } from "../../staff-hr-management/_components/bits";
import { UrlFilters, type UrlField } from "../_components/url-filters";

export const metadata: Metadata = { title: "Attendance Reports" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const ym = (d: Date) => isoDay(d).slice(0, 7);
const TONE_ROW: Record<string, string> = { danger: "bg-danger-soft/50", warning: "bg-warn-bg/50" };

export default async function ReportsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, features, today } = await attendancePage();
  const list = reportsFor(access, features as Set<string>);
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const input = readReportInput(get, today, list.map((r) => r.key as ReportKey));
  const info = list.find((r) => r.key === input.report);

  const data = await withSchool(current.ctx, async (tx) => {
    const sections = access.students !== "none" ? await registerChoices(tx, access) : [];
    const people = input.report === "range" ? await rangePeople(tx, access, input.sectionId ?? sections[0]?.id ?? null) : [];
    const table = list.length ? await runReport(tx, current.ctx, access, { ...input, person: input.report === "range" ? input.person ?? people[0]?.value ?? null : input.person }) : null;
    return { sections, people, table };
  }, { timeout: 60_000 });

  const fields: UrlField[] = [{ name: "report", label: "Report", type: "select", value: input.report, options: list.map((r) => ({ value: r.key, label: r.label })) }];
  const r = input.report;
  if (r === "daily") fields.push({ name: "date", label: "Date", type: "date", value: isoDay(input.date), max: isoDay(today) });
  if (["monthly", "staff-monthly", "late", "overtime"].includes(r) || (r === "leave" && input.period === "month")) fields.push({ name: "month", label: "Month", type: "month", value: ym(input.month), max: ym(today) });
  if (r === "monthly") fields.push({ name: "section", label: "Class and section", type: "select", value: input.sectionId ?? "", allLabel: "Every class", options: data.sections.map((s) => ({ value: s.id, label: s.name })) });
  if (r === "leave") fields.push({ name: "period", label: "Period", type: "select", value: input.period, options: [{ value: "month", label: "One month" }, { value: "year", label: "Whole year" }] });
  if (r === "range") {
    if (data.sections.length) fields.push({ name: "section", label: "Class and section", type: "select", value: input.sectionId ?? data.sections[0]?.id ?? "", options: data.sections.map((s) => ({ value: s.id, label: s.name })) });
    fields.push({ name: "person", label: "Student or staff member", type: "select", value: input.person ?? data.people[0]?.value ?? "", options: data.people });
  }
  if (r === "range" || r === "devices") {
    fields.push({ name: "from", label: "From", type: "date", value: isoDay(input.from), max: isoDay(today) });
    fields.push({ name: "to", label: "To", type: "date", value: isoDay(input.to), max: isoDay(today) });
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "format") qs.set(k, v);
  qs.set("report", input.report);
  if (input.report === "range" && !qs.get("person") && data.people[0]) qs.set("person", data.people[0].value);
  const t = data.table;

  return (
    <>
      <PageHeader title="Attendance Reports" href={`${BASE}/reports`} userId={current.user.id}>
        {t && t.rows.length > 0 && <ExportLinks href={`${BASE}/reports/export?${qs}`} />}
      </PageHeader>
      {list.length === 0 ? (
        <EmptyState title="No reports for your role">Attendance reports are for teachers of a class, HR, the School Admin and the Principal.</EmptyState>
      ) : (
        <>
          <UrlFilters fields={fields} reset={{ report: ["section", "person", "period"], section: ["person"] }} />
          {info && <p className="-mt-2 mb-4 text-sm text-ink-2">{info.about} Holidays, Sundays and other non-working days are left out.</p>}
          {t && (t.rows.length === 0 || t.columns.length === 0 ? (
            <EmptyState title="Nothing to show">{t.empty}</EmptyState>
          ) : (
            <section aria-label={t.title}>
              <h2 className="mb-2 text-lg font-semibold">{t.title}</h2>
              <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
                <table className="w-full text-left text-[15px]">
                  <caption className="sr-only">{t.title}</caption>
                  <thead className="border-b border-line bg-surface-2 text-sm text-ink-2">
                    <tr>{t.columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-3 font-medium ${c.numeric ? "text-right" : ""}`}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {t.rows.map((row, i) => (
                      <tr key={i} className={row._tone ? TONE_ROW[row._tone] ?? "" : ""}>
                        {t.columns.map((c, j) => j === 0
                          ? <th key={c.key} scope="row" className="px-4 py-2.5 text-left font-medium">{row[c.key] ?? ""}</th>
                          : <td key={c.key} className={`px-4 py-2.5 ${c.numeric ? "text-right tabular-nums" : ""}`}>{row[c.key] ?? ""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 md:hidden" aria-label={t.title}>
                {t.rows.map((row, i) => {
                  const title = t.columns.find((c) => c.phone === "title") ?? t.columns[0];
                  const badge = t.columns.find((c) => c.phone === "badge");
                  return (
                    <li key={i} className={`rounded-xl border border-line bg-surface p-4 ${row._tone ? TONE_ROW[row._tone] ?? "" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{row[title.key]}</span>
                        {badge && <span className="shrink-0 rounded-full bg-surface-3 px-2.5 py-0.5 text-sm font-medium">{row[badge.key]}</span>}
                      </div>
                      <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
                        {t.columns.filter((c) => c !== title && c !== badge && row[c.key] !== "" && row[c.key] !== null).map((c) => (
                          <div key={c.key} className="flex justify-between gap-2 border-b border-line/60 py-0.5"><dt className="text-ink-2">{c.label}</dt><dd className="tabular-nums">{row[c.key]}</dd></div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
              </ul>
              {t.footer && <p className="mt-3 text-sm text-ink-2">{t.footer}</p>}
            </section>
          ))}
        </>
      )}
    </>
  );
}
