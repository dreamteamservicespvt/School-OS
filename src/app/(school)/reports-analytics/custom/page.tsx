import Link from "next/link";
import { Archive, CalendarClock, Check, Database, Download, Filter, Inbox, ListChecks, Plus, Table2 } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { catalogueFor } from "@/lib/reports/catalogue";
import { reportAccess } from "@/lib/reports/access";
import { AREAS, areasFor, CustomProblem, cleanSpec, frequencyWords, isArea, PRESETS, runCustom, specOf, specWords, type AreaKey, type CustomSpec } from "@/lib/reports/custom";
import { viewerOf, cellText } from "@/lib/reports/run";
import type { Row, Table } from "@/lib/reports/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Chips, Col, DataList, IconTile, Split } from "@/components/ui/kit";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty, SimpleTable } from "@/components/money/kit";
import { UrlSegmented, UrlSelect, UrlSwitch } from "@/components/money/url-filters";
import { SheetForm } from "@/components/ui/url-sheet";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/chips";
import { RepHead, CAT_ICON } from "../_components/head";
import { ColumnPicker, SaveCustomSheet, ScheduleMenu, ScheduleSheet, type Person, type ReportOption, type ScheduleStart } from "../_components/custom-ui";
import { archiveCustomAction, archiveScheduleAction, customFeatureAction } from "../actions";
import { QuickButton } from "../_components/bits";
import { BASE, one, qs, repGuard, withQ, type SearchParams } from "../_lib/page";

export const metadata = { title: "Custom & Scheduled Reports" };

const HREF = `${BASE}/custom`;
const PREVIEW_ROWS = 12;
const STATUS_FILTERS = ["Active", "Paused", "Archived"] as const;
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Custom & Scheduled Reports (19 §4, mod-reports.jsx CustomReports): build your own report, and have any report emailed. */
export default async function CustomReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await repGuard("custom");
  const sp = await searchParams;
  const canEdit = can(p.current.permissions, "reports-analytics", "create");
  const view = one(sp.view) === "build" ? "build" : "mine";
  const filter = STATUS_FILTERS.find((s) => s === one(sp.filter)) ?? "Active";
  const myAreas = areasFor(p.current);
  const scheduleKey = one(sp.schedule) === "new" ? "" : one(sp.schedule);
  const scheduleOpen = canEdit && (Boolean(one(sp.schedule)) || Boolean(one(sp.edit)));

  // The builder's choices, from the page address.
  const area: AreaKey = isArea(one(sp.area)) && myAreas.includes(one(sp.area) as AreaKey) ? (one(sp.area) as AreaKey) : myAreas[0] ?? "students";
  const fields = AREAS[area].fields;
  const cols = many(sp.col);
  const chosen = cols.length ? fields.map((f) => f.key).filter((k) => cols.includes(k)) : fields.slice(0, 4).map((f) => f.key);
  const raw = { area, columns: chosen, classId: one(sp.class) || null, show: one(sp.show) || "all", group: one(sp.group) || "none", totals: one(sp.nototals) !== "1" };

  const data = await withSchool(p.current.ctx, async (tx) => {
    const [schedules, customs, classes] = await Promise.all([
      tx.reportSchedule.findMany({ orderBy: { createdAt: "desc" } }),
      tx.customReport.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" } }),
      tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    ]);
    const userIds = [...new Set([...schedules.flatMap((s) => s.recipientIds), ...customs.map((c) => c.ownerId)])];
    const names = new Map((await tx.userLogin.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const customWords = new Map(await Promise.all(customs.map(async (c) => [c.id, await specWords(tx, specOf(c))] as const)));

    let preview: Table | null = null;
    let problem: string | null = null;
    let spec: CustomSpec | null = null;
    if (view === "build") {
      try {
        spec = cleanSpec(raw, p.current);
        preview = await runCustom(tx, p.current, spec, p.today);
      } catch (e) {
        if (e instanceof CustomProblem) problem = e.message;
        else throw e;
      }
    }
    const filterText = spec ? await specWords(tx, spec) : "";

    // The people a schedule may go to, and which reports each may see (the same rule as opening them).
    let people: Person[] = [];
    if (scheduleOpen) {
      const rows = await tx.schoolAccess.findMany({ where: { archivedAt: null, userLogin: { status: "ACTIVE", archivedAt: null } }, include: { userLogin: { select: { id: true, displayName: true } }, roles: { include: { role: { select: { key: true, name: true } } } } } });
      const staffRows = rows.filter((r) => r.roles.some((x) => x.role.key !== "parent" && x.role.key !== "student")).slice(0, 60);
      people = (await Promise.all(staffRows.map(async (r) => {
        const who = await viewerOf(tx, r.userLogin.id, p.current.ctx.schoolId);
        if (!who) return null;
        const a = reportAccess(who);
        const ar = areasFor(who);
        const keys = a.own ? [] : [...catalogueFor(a, who).map((e) => e.key), ...customs.filter((c) => ar.includes(c.area as AreaKey)).map((c) => `c:${c.id}`)];
        return { id: r.userLogin.id, name: r.userLogin.displayName, role: r.roles.map((x) => x.role.name).join(", "), me: r.userLogin.id === p.current.user.id, keys };
      }))).filter((x): x is Person => Boolean(x) && (x as Person).keys.length > 0).sort((x, y) => (x.me ? -1 : y.me ? 1 : x.name.localeCompare(y.name)));
    }
    return { schedules, customs, classes, names, customWords, preview, problem, spec, filterText, people };
  }, { timeout: 60_000 });

  const statusOf = (s: { status: string; archivedAt: Date | null }) => (s.archivedAt ? "Archived" : s.status === "ACTIVE" ? "Active" : "Paused");
  const rows = data.schedules.filter((s) => statusOf(s) === filter);
  const nameOf = (id: string) => data.names.get(id) ?? "Someone";
  const catalogue = catalogueFor(p.a, p.current);
  const keyLabel = (k: string) => (k.startsWith("c:") ? { src: "Custom", area: AREAS[(data.customs.find((c) => `c:${c.id}` === k)?.area ?? "students") as AreaKey]?.label ?? "" } : { src: "Catalogue", area: catalogue.find((e) => e.key === k)?.category ?? "" });
  const close = withQ(HREF, sp, { schedule: null, edit: null, archive: null, archiveReport: null, save: null });
  const viewHref = (v: "mine" | "build") => (v === "mine" ? qs(HREF, { filter: filter === "Active" ? null : filter }) : qs(HREF, { view: "build" }));

  // The schedule sheet's starting values.
  const editing = one(sp.edit) ? data.schedules.find((s) => s.id === one(sp.edit) && !s.archivedAt) ?? null : null;
  const start: ScheduleStart = editing
    ? { id: editing.id, reportKey: editing.reportKey, datePreset: editing.datePreset, frequency: editing.frequency, day: editing.day, timeMin: editing.timeMin, format: editing.format, recipientIds: editing.recipientIds }
    : { id: null, reportKey: scheduleKey, datePreset: "default", frequency: "WEEKLY", day: 1, timeMin: 480, format: "pdf", recipientIds: [p.current.user.id] };
  const reportOptions: ReportOption[] = [
    ...data.customs.filter((c) => myAreas.includes(c.area as AreaKey)).map((c) => ({ value: `c:${c.id}`, label: `${c.name} (custom)`, group: "Custom" as const })),
    ...catalogue.map((e) => ({ value: e.key, label: e.name, group: "Catalogue" as const })),
  ];
  const archiving = one(sp.archive) ? data.schedules.find((s) => s.id === one(sp.archive) && !s.archivedAt) ?? null : null;
  const archivingReport = one(sp.archiveReport) ? data.customs.find((c) => c.id === one(sp.archiveReport)) ?? null : null;

  const specParams = (c: { area: string; columns: string[]; filters: unknown }) => {
    const s = specOf(c);
    const u = new URLSearchParams({ view: "build", area: s.area });
    for (const col of s.columns) u.append("col", col);
    if (s.classId) u.set("class", s.classId);
    if (s.show !== "all") u.set("show", s.show);
    if (s.group !== "none") u.set("group", s.group);
    if (!s.totals) u.set("nototals", "1");
    return `${HREF}?${u.toString()}`;
  };

  return (
    <div>
      <RepHead pageName="Custom & Scheduled Reports" href={HREF} sub="Build your own report, and have any report emailed every day, week or month"
        actions={canEdit ? <>
          <ButtonLink href={withQ(HREF, sp, { schedule: "new" })} scroll={false} variant="secondary" icon={CalendarClock}>Schedule a report</ButtonLink>
          <ButtonLink href={qs(HREF, { view: "build" })} variant="primary" icon={Plus}>Build a report</ButtonLink>
        </> : null} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <LinkTabs value={view} label="Views" className="self-start" tabs={[{ id: "mine", label: "My reports and schedules", href: viewHref("mine") }, { id: "build", label: "Build a report", href: viewHref("build") }]} />
        {view === "mine" ? (
          <>
            <Card className="overflow-hidden">
              <CardHeader title="Scheduled emails" description="Sent by email · recipients must be allowed to see the data" icon={CalendarClock} />
              <div className="px-3 pb-3">
                <Chips value={filter} label="Schedule status" options={STATUS_FILTERS.map((s) => ({ value: s, label: s, count: data.schedules.filter((x) => statusOf(x) === s).length, href: qs(HREF, { filter: s === "Active" ? null : s }) }))} />
              </div>
              <DataList rows={rows} rowKey={(s) => s.id} minWidth={820}
                empty={<Empty icon={filter === "Archived" ? Archive : CalendarClock} title={filter === "Archived" ? "Nothing archived" : filter === "Paused" ? "No paused schedules" : "No scheduled reports yet"}
                  body={filter === "Active" ? "Schedule any report to arrive by email every day, week or month." : "Archived schedules stay here, with their send history."}
                  action={filter === "Active" && canEdit ? <ButtonLink href={`${HREF}?schedule=new`} scroll={false} variant="secondary" icon={Plus}>Schedule a report</ButtonLink> : undefined} />}
                columns={[
                  { key: "n", label: "Report", render: (s) => { const k = keyLabel(s.reportKey); return <><b className="font-semibold block leading-tight">{s.reportName}</b><span className="text-[12.5px] text-ink3">{k.src} · {k.area} · {PRESETS.find((x) => x.value === s.datePreset)?.label ?? s.datePreset}</span></>; } },
                  { key: "f", label: "Sends", render: (s) => <><span className="block whitespace-nowrap">{frequencyWords(s)}</span><span className="text-[12.5px] text-ink3">{s.format === "xlsx" ? "Excel" : "PDF"}</span></> },
                  { key: "t", label: "To", render: (s) => <span className="flex items-center gap-2"><span className="flex -space-x-2">{s.recipientIds.slice(0, 4).map((id) => <Avatar key={id} name={nameOf(id)} size={28} ring />)}</span><span className="text-[12.5px] text-ink3 truncate max-w-[140px]">{s.recipientIds.map((id) => nameOf(id).split(" ")[0]).join(", ")}</span></span> },
                  { key: "l", label: "Last sent", nowrap: true, render: (s) => <span className="text-[13px]">{s.lastSentAt ? formatDateTime(s.lastSentAt, p.tz) : "Not sent yet"}</span> },
                  { key: "s", label: "Status", nowrap: true, render: (s) => <Pill tone={statusOf(s) === "Active" ? "ok" : "neutral"} dot>{statusOf(s)}</Pill> },
                  { key: "m", label: "", render: (s) => canEdit ? <ScheduleMenu id={s.id} active={s.status === "ACTIVE"} archived={Boolean(s.archivedAt)} editHref={withQ(HREF, sp, { edit: s.id })} archiveHref={withQ(HREF, sp, { archive: s.id })} /> : null },
                ]}
                mobile={(s) => ({
                  title: s.reportName, sub: `${frequencyWords(s)} · ${s.format === "xlsx" ? "Excel" : "PDF"} · to ${s.recipientIds.map((id) => nameOf(id).split(" ")[0]).join(", ")}`, icon: CalendarClock, iconTone: statusOf(s) === "Active" ? "brand" : "neutral",
                  right: canEdit ? <ScheduleMenu id={s.id} active={s.status === "ACTIVE"} archived={Boolean(s.archivedAt)} editHref={withQ(HREF, sp, { edit: s.id })} archiveHref={withQ(HREF, sp, { archive: s.id })} /> : undefined,
                })}
                footer={`${rows.length} ${filter.toLowerCase()}`} />
            </Card>
            <Card className="overflow-hidden">
              <CardHeader title="My custom reports" description="Built here, with only the fields each person may see" icon={Table2} />
              {data.customs.length === 0 ? (
                <Empty icon={Table2} title="No custom reports yet" body="Pick a data area, columns and filters, then save." action={<ButtonLink href={qs(HREF, { view: "build" })} variant="secondary">Build a report</ButtonLink>} />
              ) : (
                <ul className="px-2 pb-2">
                  {data.customs.map((c) => {
                    const ar = AREAS[c.area as AreaKey];
                    return (
                      <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                        <IconTile icon={ar ? CAT_ICON[ar.category] : Table2} size={36} />
                        <span className="min-w-0 flex-1"><b className="font-semibold text-[14px] block truncate">{c.name}</b><span className="text-[12.5px] text-ink3 block truncate">{ar?.label ?? c.area} · {c.columns.length} columns · {data.customWords.get(c.id)} · saved by {nameOf(c.ownerId)}, {formatDate(c.createdAt, p.tz)}</span></span>
                        {myAreas.includes(c.area as AreaKey) && <ButtonLink href={specParams(c)} size="sm" variant="ghost">Open</ButtonLink>}
                        {canEdit && myAreas.includes(c.area as AreaKey) && <ButtonLink href={`${HREF}?schedule=c:${c.id}`} scroll={false} size="sm" variant="secondary" icon={CalendarClock} className="hidden sm:inline-flex">Schedule</ButtonLink>}
                        {canEdit && c.ownerId === p.current.user.id && <ButtonLink href={withQ(HREF, sp, { archiveReport: c.id })} scroll={false} size="sm" variant="ghost" aria-label={`Archive ${c.name}`}><Archive size={15} aria-hidden="true" /></ButtonLink>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        ) : (
          <Split side={340} className="[&>*]:min-w-0">
            <Col>
              <Card className="overflow-hidden">
                <CardHeader title="Preview" description={data.preview ? `${AREAS[area].label} · ${data.filterText} · ${data.preview.rows.length} ${data.preview.rows.length === 1 ? "row" : "rows"}` : AREAS[area].label} icon={Table2}
                  action={data.preview && <div className="flex gap-1.5">
                    <a href={qs(`${HREF}/export`, { area, class: raw.classId, show: raw.show === "all" ? null : raw.show, group: raw.group === "none" ? null : raw.group, nototals: raw.totals ? null : "1" }) + chosen.map((c) => `&col=${c}`).join("")} download className={buttonClass("secondary", "sm")}><Download size={15} aria-hidden="true" />Export</a>
                    {canEdit && <ButtonLink href={withQ(HREF, sp, { save: "1" })} scroll={false} size="sm" variant="primary" icon={Check}>Save</ButtonLink>}
                  </div>} />
                {data.problem ? (
                  <Empty icon={Table2} title="Pick at least one column" body={data.problem === "Pick at least one column." ? "Tick the columns you want on the right. The preview updates as you go." : data.problem} />
                ) : data.preview && data.preview.rows.length === 0 ? (
                  <Empty icon={Inbox} title="No rows for these filters" body="Try another class or loosen the filter." action={<Link href={qs(HREF, { view: "build", area })} className={buttonClass("secondary")}>Clear filters</Link>} />
                ) : data.preview && (
                  <>
                    <SimpleTable minWidth={Math.max(480, data.preview.columns.length * 130)} caption="Preview" rows={data.preview.rows.slice(0, PREVIEW_ROWS)}
                      cols={data.preview.columns.map((c) => ({ label: c.label, right: c.kind !== undefined && c.kind !== "text" && c.kind !== "date", render: (r: Row) => cellText(r[c.key], c.kind) }))}
                      foot={data.preview.totals ? data.preview.columns.map((c) => cellText(data.preview?.totals?.[c.key] ?? null, c.kind)) : undefined} />
                    <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3 tnum">Showing {Math.min(PREVIEW_ROWS, data.preview.rows.length)} of {data.preview.rows.length.toLocaleString("en-IN")} rows · the saved report has every row{data.preview.note ? ` · ${data.preview.note}` : ""}</p>
                  </>
                )}
              </Card>
            </Col>
            <Col>
              <Card>
                <CardHeader title="1. What is it about" icon={Database} />
                <div className="px-5 pb-4">
                  <UrlSegmented param="area" fallback={myAreas[0] ?? "students"} label="Data area" size="sm" className="flex-wrap w-full" options={myAreas.map((k) => ({ value: k, label: AREAS[k].label }))} />
                </div>
              </Card>
              <Card>
                <CardHeader title="2. Columns" description="Only fields you may see are offered" icon={ListChecks} />
                <ColumnPicker key={area} fields={fields} chosen={chosen} />
              </Card>
              <Card>
                <CardHeader title="3. Filters and totals" icon={Filter} />
                <div className="px-5 pb-5 flex flex-col gap-3">
                  {area !== "staff" && <Labelled label="Class"><UrlSelect id="bd-cls" param="class" label="Class" className="w-full" options={[{ value: "", label: "All classes" }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))]} /></Labelled>}
                  <Labelled label="Show"><UrlSelect id="bd-extra" param="show" label="Show" className="w-full" options={AREAS[area].show.map((s) => ({ value: s.value === "all" ? "" : s.value, label: s.label }))} /></Labelled>
                  {area !== "staff" && <Labelled label="Group by"><UrlSelect id="bd-grp" param="group" label="Group by" className="w-full" options={[{ value: "", label: "No grouping (one row per student)" }, { value: "class", label: "Class" }, { value: "gender", label: "Boys and girls" }]} /></Labelled>}
                  <UrlSwitch id="bd-tot" param="nototals" label="Leave out the totals row" />
                </div>
              </Card>
            </Col>
          </Split>
        )}
      </div>

      {p.a.full && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink3">
          <span>Custom & Scheduled Reports is on for this school. Switching it off keeps saved reports and pauses schedules.</span>
          <QuickButton variant="ghost" run={customFeatureAction.bind(null, false)}>Switch off</QuickButton>
        </div>
      )}
      {one(sp.save) === "1" && canEdit && data.spec && (
        <SaveCustomSheet spec={{ area: data.spec.area, columns: data.spec.columns, classId: data.spec.classId ?? "", show: data.spec.show, group: data.spec.group, totals: data.spec.totals ? "1" : "0" }}
          sub={`${AREAS[area].label} · ${data.spec.columns.length} columns · ${data.filterText}`} closeHref={withQ(HREF, sp, { save: null })} doneHref={qs(HREF, {})} start="" />
      )}
      {scheduleOpen && (editing || !one(sp.edit)) && (
        <ScheduleSheet start={start} reports={reportOptions} presets={PRESETS.map((x) => ({ value: x.value, label: x.label }))} people={data.people} closeHref={close} editName={editing?.reportName} />
      )}
      {archiving && canEdit && (
        <SheetForm title={`Archive “${archiving.reportName}”?`} sub="It stops sending. Its send history is kept, and you can start it again from Archived." closeHref={close} action={archiveScheduleAction}
          hidden={{ scheduleId: archiving.id }} submitLabel="Archive schedule" submitVariant="danger"><span className="sr-only">Confirm</span></SheetForm>
      )}
      {archivingReport && canEdit && (
        <SheetForm title={`Archive “${archivingReport.name}”?`} sub="It leaves My custom reports and its schedules are paused. Nothing is deleted." closeHref={close} action={archiveCustomAction}
          hidden={{ reportId: archivingReport.id }} submitLabel="Archive report" submitVariant="danger"><span className="sr-only">Confirm</span></SheetForm>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[13px] font-semibold text-ink2" aria-hidden="true">{label}</span>
      {children}
    </div>
  );
}
