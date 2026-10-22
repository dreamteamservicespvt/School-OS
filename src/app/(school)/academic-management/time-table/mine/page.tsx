import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { periodsForStaffOnDate } from "@/lib/academic/timetable";
import { DAY_NAMES, addDays, isoDay, parseDay, plural, time12, weekday } from "@/lib/academic/common";
import { EmptyState } from "@/components/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { academicPage, one, type SearchParams } from "../../_lib/page";
import { PageTop } from "../../_components/page-top";
import { DateParam } from "../../_components/pickers";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "My Time Table" };
const PATH = "/academic-management/time-table/mine";

export default async function MyTimeTablePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw);
  const date = parseDay(one(raw.date)) ?? page.today;
  const staffId = page.scope.staffId;

  const data = staffId ? await withSchool(page.current.ctx, (tx) => periodsForStaffOnDate(tx, page.current.ctx, staffId, date)) : null;

  const isToday = isoDay(date) === isoDay(page.today);
  const link = (d: Date) => `${PATH}?date=${isoDay(d)}`;
  const teaching = data?.periods.filter((p) => !p.isBreak) ?? [];

  return (
    <>
      <PageTop page={page} title="My Time Table" href={PATH} showYear={false} />
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <DateParam current={isoDay(date)} />
        <div className="flex gap-2">
          <Link href={link(addDays(date, -1))} className={buttonClass("secondary", "md")} aria-label="Previous day"><Words k="Previous" /></Link>
          {!isToday && <Link href={PATH} className={buttonClass("secondary", "md")}><Words k="Today" /></Link>}
          <Link href={link(addDays(date, 1))} className={buttonClass("secondary", "md")} aria-label="Next day"><Words k="Next" /></Link>
        </div>
        <Link href="/academic-management/time-table?view=teacher" className="min-h-11 py-2.5 font-medium text-brand-text hover:underline"><Words k="The whole week" /></Link>
      </div>
      <h2 className="mb-3 text-lg font-semibold">{isToday ? "Today, " : ""}{DAY_NAMES[weekday(date)]} {formatDate(date)}</h2>

      {!staffId || !data ? (
        <EmptyState title="Your login is not linked to a staff record"><Words k={"Ask the office to link your login to your staff record in Staff & HR. Your periods then show here."} /></EmptyState>
      ) : data.off ? (
        <Alert tone="info" title={data.off.kind === "holiday" ? `Holiday: ${data.off.title}` : `${data.off.title}: no school`}><Words k="No periods on this day." /></Alert>
      ) : (
        <>
          {data.exam && (
            <Alert tone="warning" className="mb-3" title={`Exam day: ${data.exam.title}`}>
              {data.exam.classNames.length ? `The datesheet replaces your periods with ${data.exam.classNames.join(", ")}.` : "The datesheet replaces the periods of the classes sitting a paper."}
              {data.duties.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {data.duties.map((p, i) => <li key={i}><Words k="Invigilate" /> {p.className} {p.subjectName}, {time12(p.startTime)} <Words k="to" /> {time12(p.endTime)}{p.room ? ` · ${p.room}` : ""}</li>)}
                </ul>
              )}
            </Alert>
          )}
          {data.halfDayEnd && <Alert tone="info" className="mb-3" title={`Half day: school ends at ${time12(data.halfDayEnd)}`}><Words k="Periods after that are not held today." /></Alert>}
          {teaching.length === 0 ? (
            <EmptyState title="No periods on this day"><Words k="Nothing in the published Time Table for you. If that looks wrong, ask the office." /></EmptyState>
          ) : (
            <>
              <p className="mb-3 text-ink-2">{plural(teaching.length, "period")}{teaching.some((p) => p.isSubstitute) ? `, ${plural(teaching.filter((p) => p.isSubstitute).length, "substitution")}` : ""}.</p>
              <ol className="space-y-2">
                {data.periods.map((p) => (
                  <li key={`${p.id}-${p.isSubstitute ? "s" : "o"}`} className={`flex gap-3 rounded-2xl border p-3 ${p.isBreak ? "border-line bg-surface-2" : p.isSubstitute ? "border-brand bg-brand-soft" : p.substitution ? "border-line bg-surface opacity-75" : "border-line bg-surface"}`}>
                    <div className="w-20 shrink-0 text-sm">
                      <span className="block font-semibold">{p.isBreak ? "" : `Period ${p.periodNo}`}</span>
                      <span className="block text-ink-2">{time12(p.startTime)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {p.isBreak ? <p className="font-medium text-ink-2">{p.label ?? "Break"}</p> : (
                        <>
                          <p className="font-semibold">{p.sectionLabel} · {p.subjectName ?? p.label}</p>
                          <p className="text-sm text-ink-2">{time12(p.startTime)} <Words k="to" /> {time12(p.endTime)}{p.room ? ` · ${p.room}` : ""}</p>
                          {p.isSubstitute && <p className="mt-1"><Badge tone="brand"><Words k="Substitution" /></Badge> <span className="text-sm"><Words k="for" /> {p.substitution?.forStaffName ?? "a colleague"}</span></p>}
                          {!p.isSubstitute && p.substitution && <p className="mt-1 text-sm text-ink-2">{p.substitution.substituteName ? `${p.substitution.substituteName} takes this period.` : "You are away; a substitute is being arranged."}</p>}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </>
  );
}
