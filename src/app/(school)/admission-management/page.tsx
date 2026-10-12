import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { admissionPage, BASE } from "@/lib/admission/page";
import { zonedToInstant, UUID_RE } from "@/lib/admission/act";
import { board, followUps, funnel, type Filters } from "@/lib/admission/reports";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { openYears } from "@/lib/admission/settings";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Board } from "./_components/board";
import { Stat } from "./_components/bits";
import { AddEnquiry } from "./enquiries/enquiry-forms";
import { moveBoardCard } from "./applications/actions";

export const metadata: Metadata = { title: "Admission Dashboard" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const idOrNull = (v: string) => (UUID_RE.test(v) ? v : null);

export default async function AdmissionDashboard({ searchParams }: Search) {
  const { current, viewer, settings, year, tz, today } = await admissionPage();
  const raw = await searchParams;
  const now = new Date();
  const dayStart = zonedToInstant(`${today}T00:00`, tz);
  const full = viewer.see === "all";

  const data = await withSchool(current.ctx, async (tx) => {
    const years = await openYears(tx);
    const yearId = idOrNull(one(raw.year)) ?? year?.id ?? null;
    const n = await names(tx);
    const choices = await enquiryChoices(tx, current.ctx, current, settings, tz);
    const campuses = full ? await tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
    if (!yearId) return { years, n, choices, campuses, yearId, stages: [], cols: [], fu: null };
    const source = one(raw.source);
    const f: Filters = {
      yearId,
      classId: idOrNull(one(raw.class)),
      source: settings.sourceList.some((s) => s.key === source) ? source : null,
      ownerStaffId: full ? idOrNull(one(raw.owner)) : null,
      campusId: full ? idOrNull(one(raw.campus)) : null,
    };
    const [stages, cols, fu] = await Promise.all([funnel(tx, settings, viewer, f, now), board(tx, settings, viewer, f, n.classes), followUps(tx, viewer, f, dayStart, now)]);
    return { years, n, choices, campuses, yearId, stages, cols, fu };
  });

  const canChange = viewer.change !== "none";
  const selectCls = "h-11 max-w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px]";
  const filterSelect = (name: string, labelText: string, options: { value: string; label: string }[], value: string, allLabel: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-2">{labelText}</span>
      <select name={name} defaultValue={value} className={selectCls}>
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  const fuList = (title: string, rows: NonNullable<typeof data.fu>["overdue"], tone?: "danger") => (
    <div>
      <h3 className={`mb-2 font-medium ${tone === "danger" ? "text-danger" : ""}`}>{title} ({rows.length})</h3>
      {rows.length === 0 ? <p className="text-sm text-ink-2">None.</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Link href={`${BASE}/enquiries/${r.id}`} className="font-medium text-brand-text hover:underline">{r.childName}</Link>
                <span className="block text-sm text-ink-2">{r.parentName} · {r.nextFollowUpAt ? formatDateTime(r.nextFollowUpAt, tz) : ""}{r.nextAction ? ` · ${r.nextAction}` : ""}</span>
              </span>
              <a href={`tel:+91${r.phone}`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-brand-text hover:bg-surface-2" aria-label={`Call ${r.parentName}`}>Call</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <PageHeader title="Admission Dashboard" href={BASE} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {full && canChange && <ButtonLink href={`${BASE}/applications/new`}>New application</ButtonLink>}
          {canChange && data.yearId && <AddEnquiry c={data.choices} />}
        </div>
      </PageHeader>

      {!data.yearId ? (
        <p className="rounded-xl border border-warn/40 bg-warn-bg p-3 text-warn-text">No academic year is set up yet. Add one in Academic Management to start taking admissions.</p>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filters">
            {filterSelect("year", "Admission year", data.years.map((y) => ({ value: y.id, label: y.name })), data.yearId, "")}
            {filterSelect("class", "Class applied for", data.choices.classes, one(raw.class), "All classes")}
            {filterSelect("source", "Source", settings.sourceList.map((s) => ({ value: s.key, label: s.label })), one(raw.source), "All sources")}
            {full && filterSelect("owner", "Owner", data.choices.owners, one(raw.owner), "All owners")}
            {full && data.campuses.length > 1 && filterSelect("campus", "Campus", data.campuses.map((c) => ({ value: c.id, label: c.name })), one(raw.campus), "All campuses")}
            <Button type="submit" variant="secondary">Apply</Button>
            <Link href={BASE} className="inline-flex min-h-11 items-center px-2 text-sm text-brand-text hover:underline">Reset</Link>
          </form>

          {data.fu && data.fu.overdueCount > 0 && (
            <p className="mb-4 rounded-xl border border-danger/40 bg-danger-soft p-3 text-danger">
              <Link href={`${BASE}/enquiries?quick=overdue`} className="font-medium underline">{data.fu.overdueCount} {data.fu.overdueCount === 1 ? "follow-up is" : "follow-ups are"} overdue</Link>
            </p>
          )}

          <section aria-labelledby="funnel-h" className="mb-6">
            <h2 id="funnel-h" className="mb-3 text-lg font-semibold">Funnel</h2>
            <ol className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {data.stages.map((st) => (
                <li key={st.key}>
                  <Stat label={st.label} value={st.count} href={st.href}
                    note={<>{st.lastWeek > 0 ? `+${st.lastWeek} since last week` : "None new this week"}{st.oldest ? <><br />Oldest waiting: {formatDate(st.oldest, tz)}</> : null}</>} />
                </li>
              ))}
            </ol>
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <section aria-labelledby="board-h" className="min-w-0 xl:col-span-2">
              <h2 id="board-h" className="mb-3 text-lg font-semibold">Pipeline board</h2>
              <Board label="Admissions by stage" move={full && viewer.change === "all" ? moveBoardCard : undefined}
                columns={data.cols.map((c) => ({ key: c.key, label: c.label, count: c.count, accepts: c.accepts.length > 0, cards: c.cards.map((x) => ({ id: x.id, title: x.title, meta: x.meta, href: x.href })) }))} />
            </section>
            <Card>
              <CardHeader title="Today's follow-ups" action={<Link href={`${BASE}/enquiries?quick=today`} className="text-sm text-brand-text hover:underline">All</Link>} />
              <CardBody className="space-y-5">
                {data.fu && fuList("Overdue", data.fu.overdue, "danger")}
                {data.fu && fuList("Due today", data.fu.today)}
                {data.fu && fuList("Due tomorrow", data.fu.tomorrow)}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
