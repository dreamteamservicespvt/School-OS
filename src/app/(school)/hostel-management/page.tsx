// Roll Call & Incidents (15 §2): the morning and night roll call of one
// hostel (everyone present to start with, students out on an approved pass
// already marked On outing or On leave, tap the exceptions, save; same
// pattern as Take Attendance), compared with the class register of the day,
// a month calendar of roll calls that pages back, the roll call history, and
// the incident log (discipline, medical, maintenance). A warden works in
// their own hostel; leaders read the roll calls and remind the warden.
import type { Metadata } from "next";
import { AlertTriangle, ClipboardList, Moon, Plus, Search, ShieldAlert, Sun } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { momentWhere } from "@/lib/periods";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlDate, UrlSearch } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { MonthGrid, type MonthCell } from "@/components/ui/month-grid";
import { MonthSelect } from "@/components/attendance/month-select";
import { Banner, DataList, Empty, Legend, Split, Col, Stack, Toolbar } from "@/components/money/kit";
import { clockAt } from "@/lib/front-office/time";
import { getStudentSettings } from "@/lib/students/settings";
import { studentsInfo } from "@/lib/hostel/allocation";
import { defaultSession, rollHistory, rollHref, rollSheet } from "@/lib/hostel/rollcall";
import { INCIDENT_TYPE, SESSION, isoOf, minuteWords, plural, type IncidentType, type RollSession } from "@/lib/hostel/words";
import { HostelHead } from "./_components/head";
import { ActButton, RollCallForm, type RollRow } from "./_components/client";
import { IncidentSheet } from "./_components/sheets";
import { remindRollCallAction, type FoundStudent } from "./actions";
import { BASE, chosenHostel, hostelGuard, hostelPeriod, idParam, one, qs, type Raw, type SearchParams } from "./_lib/page";

export const metadata: Metadata = { title: "Roll Call & Incidents · Hostel Management" };

type P = Awaited<ReturnType<typeof hostelGuard>>;
const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function RollCallPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await hostelGuard("rollcall");
  return one(sp.view) === "incidents" ? <IncidentsView p={p} sp={sp} /> : <RollView p={p} sp={sp} />;
}

function Views({ view, hostel }: { view: "roll" | "incidents"; hostel: string | null }) {
  return <SegLinks label="Roll call or incidents" value={view} options={[{ value: "roll", label: "Roll call", href: qs(BASE, { hostel }) }, { value: "incidents", label: "Incident log", href: qs(BASE, { view: "incidents" }) }]} />;
}

async function RollView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can, tz, settings: s } = p;
  const ctx = current.ctx;
  const hostel = chosenHostel(p, sp.hostel);
  const wantDate = one(sp.date);
  const dateStr = ISO.test(wantDate) && wantDate <= p.todayStr ? wantDate : p.todayStr;
  const date = new Date(`${dateStr}T00:00:00Z`);
  const wantSession = one(sp.session).toUpperCase();
  const session: RollSession = wantSession === "MORNING" || wantSession === "NIGHT" ? wantSession : dateStr === p.todayStr ? defaultSession(p.minute) : "NIGHT";
  const editable = date.getTime() >= p.today.getTime() - 7 * DAY;
  const monthStr = /^\d{4}-\d{2}$/.test(one(sp.month)) && one(sp.month) <= p.todayStr.slice(0, 7) ? one(sp.month) : dateStr.slice(0, 7);
  const [yy, mm] = monthStr.split("-").map(Number);
  const monthFrom = new Date(Date.UTC(yy, mm - 1, 1));
  const monthTo = new Date(Date.UTC(yy, mm, 0));
  const per = hostelPeriod(sp, p.dates, "last7", "h");

  const d = hostel ? await withSchool(ctx, async (tx) => {
    const sheet = await rollSheet(tx, ctx, hostel.id, date, session, tz, p.now);
    const ids = sheet.rows.map((r) => r.student.id);
    // The class register of the same day (Attendance Management), to compare.
    const [marks, statuses] = await Promise.all([
      ids.length ? tx.attendanceMark.findMany({ where: { studentId: { in: ids }, date, periodNo: 0, archivedAt: null }, select: { studentId: true, statusKey: true } }) : [],
      tx.attendanceStatus.findMany({ where: { archivedAt: null }, select: { key: true, name: true, counts: true } }),
    ]);
    const month = await rollHistory(tx, [hostel.id], monthFrom, monthTo);
    const hist = per.range ? await rollHistory(tx, [hostel.id], new Date(`${per.range.from}T00:00:00Z`), new Date(`${per.range.to}T00:00:00Z`)) : await tx.rollCall.findMany({ where: { hostelId: hostel.id }, orderBy: [{ date: "desc" }, { session: "desc" }], take: 60 });
    const takers = await tx.userLogin.findMany({ where: { id: { in: [...new Set([...hist, ...(sheet.saved ? [sheet.saved] : [])].map((r) => r.takenById).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } });
    const firstRoll = await tx.rollCall.findFirst({ where: { hostelId: hostel.id }, orderBy: { date: "asc" }, select: { date: true } });
    return { sheet, marks, statuses, month, hist, takers: new Map(takers.map((t) => [t.id, t.displayName])), firstRoll };
  }) : null;

  const here = (change: Record<string, string | null>) => qs(BASE, { hostel: hostel && p.myHostels.length > 1 ? hostel.id : null, date: dateStr === p.todayStr ? null : dateStr, session: session.toLowerCase(), month: one(sp.month) || null, hperiod: one(sp.hperiod) || null, hfrom: one(sp.hfrom) || null, hto: one(sp.hto) || null, ...change });
  const rollMinute = session === "MORNING" ? s.morningRollMinute : s.nightRollMinute;
  const due = dateStr < p.todayStr || p.minute >= rollMinute;

  if (!hostel || !d) {
    return (
      <>
        <HostelHead pageName="Roll Call & Incidents" href={BASE} mode={p.mode} />
        <Stack>
          <Views view="roll" hostel={null} />
          <Card><Empty icon={ClipboardList} title={p.hostels.length ? "You are not a warden of any hostel yet" : "No hostel yet"} body={p.hostels.length ? "The Principal or School Admin sets each hostel's wardens in Hostel Settings." : "Add the hostels, rooms and beds in Rooms & Beds first."} /></Card>
        </Stack>
      </>
    );
  }

  const status = new Map(d.statuses.map((x) => [x.key, x]));
  const classMark = new Map(d.marks.map((m) => [m.studentId, status.get(m.statusKey)]));
  const rows: RollRow[] = d.sheet.rows.map((r) => {
    const cm = classMark.get(r.student.id);
    return {
      id: r.student.id, name: r.student.name, cls: r.student.classSection ?? "", roomNo: r.roomNo, bedNo: r.bedNo, floor: r.floor, mark: r.mark,
      away: r.away ? `${r.away.mark === "LEAVE" ? "On leave" : "On outing"} with ${r.away.withName ?? "family"}${r.away.toAt ? `, back by ${formatDate(r.away.toAt, tz) === formatDate(p.now, tz) ? "" : `${formatDate(r.away.toAt, tz)} `}${clockAt(r.away.toAt, tz)}` : ""} · ${r.away.passNo}` : null,
      school: cm && cm.counts === "absent" && !r.away ? `${cm.name} in class on ${formatDate(date, "UTC")}` : null,
    };
  });
  const saved = d.sheet.saved;
  const absentNow = saved ? saved.absentCount : 0;
  const unexplained = d.sheet.rows.filter((r) => r.mark === "ABSENT").map((r) => r.student.name);
  const classAbsent = rows.filter((r) => r.school).length;

  // The month calendar: both roll calls taken (green), one (amber), none on a past day (red); a dot for absences.
  const byDay = new Map<string, { m?: (typeof d.month)[number]; n?: (typeof d.month)[number] }>();
  for (const rc of d.month) {
    const k = isoOf(rc.date);
    const e = byDay.get(k) ?? {};
    if (rc.session === "MORNING") e.m = rc; else e.n = rc;
    byDay.set(k, e);
  }
  const started = d.firstRoll ? isoOf(d.firstRoll.date) : p.todayStr;
  const cell = (day: number): MonthCell => {
    const k = `${monthStr}-${String(day).padStart(2, "0")}`;
    if (k > p.todayStr) return { tone: "muted" };
    const e = byDay.get(k);
    const abs = (e?.m?.absentCount ?? 0) + (e?.n?.absentCount ?? 0);
    const words = [e?.m ? `Morning: ${e.m.presentCount} present, ${e.m.absentCount} absent` : "Morning not taken", e?.n ? `Night: ${e.n.presentCount} present, ${e.n.absentCount} absent` : "Night not taken"].join(". ");
    if (k < started) return { tone: "muted", title: "Before the first roll call" };
    if (k === p.todayStr && !e) return { tone: "none", title: words };
    return { tone: e?.m && e?.n ? "ok" : e ? "warn" : "bad", title: words, dot: abs ? "bad" : undefined };
  };
  const minMonth = (d.firstRoll ? isoOf(d.firstRoll.date) : p.todayStr).slice(0, 7);

  const headActions = (
    <>
      {can.rollcall && <ButtonLink href={qs(BASE, { view: "incidents", incident: "1" })} variant="secondary" icon={Plus} scroll={false}>Record incident</ButtonLink>}
      {can.remind && !saved && due && <ActButton action={remindRollCallAction} fields={{ hostelId: hostel.id, date: dateStr, session }} label="Remind the warden" icon="bell" size="md" />}
    </>
  );

  return (
    <>
      <HostelHead pageName="Roll Call & Incidents" href={BASE} mode={p.mode}
        sub={can.rollcall ? "Morning and night roll call. Everyone is present to start with; students out on a pass are already marked." : "Morning and night roll calls, absences and the incident log."}
        actions={headActions} />
      <Stack>
        <Views view="roll" hostel={p.myHostels.length > 1 ? hostel.id : null} />
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {p.myHostels.length > 1 && <SegLinks label="Hostel" value={hostel.id} options={p.myHostels.map((h) => ({ value: h.id, label: h.name, href: here({ hostel: h.id }) }))} />}
          <SegLinks label="Session" value={session} options={(["MORNING", "NIGHT"] as const).map((x) => ({ value: x, label: `${SESSION[x]} · ${minuteWords(x === "MORNING" ? s.morningRollMinute : s.nightRollMinute)}`, href: here({ session: x.toLowerCase() }) }))} />
          <UrlDate label="Roll call date" value={dateStr} max={p.todayStr} className="md:w-[200px]" />
        </div>

        {saved && session === "NIGHT" && absentNow > 0 && (
          <Banner tone="bad" icon={AlertTriangle} title={`${plural(absentNow, "student")} absent at night roll call.`}>
            {unexplained.join(", ")}. {saved.alertedAt ? `The warden and the Principal were told at ${clockAt(saved.alertedAt, tz)}.` : ""} Find the student, then record an incident.
          </Banner>
        )}
        {!saved && due && !can.rollcall && (
          <Banner tone="warn" title={`${SESSION[session]} roll call for ${formatDate(date, "UTC")} is not taken yet.`}>It was due at {minuteWords(rollMinute)}.{can.remind ? " Remind the warden." : ""}</Banner>
        )}
        {classAbsent > 0 && (
          <Banner tone="info" title={`${plural(classAbsent, "boarder")} marked absent in class on ${formatDate(date, "UTC")}.`}>Shown under their names. Check they are well; a boarder absent from class is usually in the hostel or the sick room.</Banner>
        )}

        <Split side={340}>
          <Col>
            <Card className="overflow-hidden">
              <CardHeader title={`${SESSION[session]} roll call · ${hostel.name}`} icon={session === "NIGHT" ? Moon : Sun}
                description={`${formatDate(date, "UTC")}${saved ? ` · saved at ${clockAt(saved.takenAt, tz)}${saved.takenById && d.takers.get(saved.takenById) ? ` by ${d.takers.get(saved.takenById)}` : ""}` : " · not taken yet"}`} divided />
              {rows.length === 0 ? (
                <Empty icon={ClipboardList} title="Nobody to call" body={`No student was living in ${hostel.name} then. Residents appear here once they are checked in.`} />
              ) : (
                <RollCallForm key={`${hostel.id}-${dateStr}-${session}-${saved?.updatedAt.getTime() ?? 0}`} hostelId={hostel.id} date={dateStr} session={session} rows={rows} floors={hostel.floors.filter((f) => rows.some((r) => r.floor === f))} saved={Boolean(saved)} canSave={can.rollcall} editable={editable} />
              )}
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="This month" icon={ClipboardList} description={hostel.name} />
              <div className="px-5 pb-4 flex flex-col gap-3">
                <MonthSelect value={monthStr} min={minMonth < monthStr ? minMonth : monthStr} max={p.todayStr.slice(0, 7)} />
                <MonthGrid year={yy} month0={mm - 1} cell={cell} today={monthStr === p.todayStr.slice(0, 7) ? Number(p.todayStr.slice(8)) : null} compact />
                <Legend items={[["bg-ok", "Both taken"], ["bg-warn", "One taken"], ["bg-bad", "Missed"]]} />
              </div>
            </Card>
          </Col>
        </Split>

        <Card>
          <CardHeader title="Roll call history" icon={ClipboardList} description={`${hostel.name} · ${per.label}`} divided
            action={<div className="flex gap-2"><PeriodFilter {...p.dates} fallback="last7" prefix="h" size="sm" />{can.export && <ExportButton href={qs(`${BASE}/rollcall/export`, { hostel: hostel.id, ...per.keep })} size="sm" />}</div>} />
          <DataList rows={d.hist} rowKey={(r) => r.id} rowHref={(r) => rollHref(hostel.id, isoOf(r.date), r.session)} minWidth={640} caption="Roll call history"
            empty={<Empty icon={ClipboardList} title="No roll calls in these dates" body="Try other dates." />}
            columns={[
              { key: "date", label: "Date", nowrap: true, render: (r) => formatDate(r.date, "UTC") },
              { key: "session", label: "Session", render: (r) => SESSION[r.session as RollSession] },
              { key: "present", label: "Present", align: "right", render: (r) => <b className="font-semibold text-ok tnum">{r.presentCount}</b> },
              { key: "absent", label: "Absent", align: "right", render: (r) => <b className={r.absentCount ? "font-semibold text-bad tnum" : "text-ink3 tnum"}>{r.absentCount}</b> },
              { key: "away", label: "Away", align: "right", render: (r) => <span className="tnum">{r.awayCount}</span> },
              { key: "by", label: "Taken by", render: (r) => <span>{(r.takenById && d.takers.get(r.takenById)) ?? "—"}<span className="block text-[12.5px] text-ink3">{clockAt(r.takenAt, tz)}</span></span> },
            ]}
            phone={(r) => ({ title: `${formatDate(r.date, "UTC")} · ${SESSION[r.session as RollSession]}`, sub: `${r.presentCount} present · ${r.awayCount} away${r.takenById && d.takers.get(r.takenById) ? ` · ${d.takers.get(r.takenById)}` : ""}`, icon: r.session === "NIGHT" ? Moon : Sun, iconTone: r.absentCount ? "bad" : "ok", right: r.absentCount ? <Pill tone="bad">{r.absentCount} absent</Pill> : <Pill tone="ok">All here</Pill> })}
          />
        </Card>
      </Stack>
    </>
  );
}

async function IncidentsView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can, mine, tz } = p;
  const ctx = current.ctx;
  const params = readListParams(sp, ["view", "type", "period", "from", "to"]);
  const per = hostelPeriod(sp, p.dates, "thismonth");
  const type = (["DISCIPLINE", "MEDICAL", "MAINTENANCE"] as const).find((t) => t === one(sp.type)) ?? null;
  const highlight = idParam(sp.incident);

  const d = await withSchool(ctx, async (tx) => {
    let nameIds: string[] | null = null;
    if (params.q) nameIds = (await tx.student.findMany({ where: { fullName: { contains: params.q, mode: "insensitive" } }, select: { id: true }, take: 300 })).map((s) => s.id);
    const scope: Prisma.HostelIncidentWhereInput = { archivedAt: null, ...(mine === null ? {} : { hostelId: { in: mine } }) };
    const dated: Prisma.HostelIncidentWhereInput = { ...scope, ...(per.range ? { at: momentWhere(per.range, tz) } : {}) };
    const where: Prisma.HostelIncidentWhereInput = {
      ...dated, ...(type ? { type } : {}),
      ...(params.q ? { OR: [{ incidentNo: { contains: params.q, mode: "insensitive" } }, { description: { contains: params.q, mode: "insensitive" } }, { place: { contains: params.q, mode: "insensitive" } }, ...(nameIds?.length ? [{ studentIds: { hasSome: nameIds } }] : [])] } : {}),
    };
    const [total, rows, byType] = await Promise.all([
      tx.hostelIncident.count({ where }),
      tx.hostelIncident.findMany({ where, orderBy: [{ at: "desc" }, { id: "asc" }], ...skipTake(params) }),
      tx.hostelIncident.groupBy({ by: ["type"], where: dated, _count: { _all: true } }),
    ]);
    const [info, people, hostels] = await Promise.all([
      studentsInfo(tx, ctx, rows.flatMap((r) => r.studentIds)),
      tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.recordedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
      tx.hostel.findMany({ select: { id: true, name: true } }),
    ]);
    const behaviour = can.rollcall && (current.permissions["student-management"]?.change ?? "none") !== "none" ? (await getStudentSettings(tx, ctx)).incidentTypes.filter((t) => t.kind === "incident" || t.kind === "warning").map((t) => ({ value: t.key, label: t.label })) : null;
    let start: FoundStudent[] = [];
    const sid = idParam(sp.student);
    if (sid && one(sp.incident) === "1") {
      const s = (await studentsInfo(tx, ctx, [sid])).get(sid);
      if (s) start = [{ id: s.id, name: s.name, admissionNo: s.admissionNo, cls: s.classSection ?? "", gender: null, bed: null, hostelId: null }];
    }
    return { total, rows, byType, info, people: new Map(people.map((x) => [x.id, x.displayName])), hostels: new Map(hostels.map((h) => [h.id, h.name])), behaviour, start };
  });

  type Row = (typeof d.rows)[number];
  const base = BASE;
  const href = (change: Record<string, string | number | null>) => listHref(base, params, { page: null, view: "incidents", ...change });
  const count = (t: string) => d.byType.find((x) => x.type === t)?._count._all ?? 0;
  const names = (r: Row) => r.studentIds.map((id) => d.info.get(id)?.name).filter(Boolean).join(", ");
  const exportHref = qs(`${BASE}/incidents/export`, { type, q: params.q || null, ...per.keep });
  const opening = can.rollcall && one(sp.incident) === "1";

  return (
    <>
      <HostelHead pageName="Roll Call & Incidents" href={BASE} mode={p.mode}
        sub="Discipline, medical and maintenance incidents, with what was done."
        actions={can.rollcall ? <ButtonLink href={href({ incident: "1" })} variant="primary" icon={Plus} scroll={false}>Record incident</ButtonLink> : undefined} />
      <Stack>
        <Views view="incidents" hostel={null} />
        <Chips label="Incident type" value={type ?? ""} options={[
          { value: "", label: "All types", count: d.byType.reduce((a, x) => a + x._count._all, 0), href: href({ type: null }) },
          ...(["DISCIPLINE", "MEDICAL", "MAINTENANCE"] as const).map((t) => ({ value: t, label: INCIDENT_TYPE[t].label, count: count(t), href: href({ type: t }) })),
        ]} />
        <Card>
          <Toolbar className="md:flex-wrap">
            <UrlSearch placeholder="Search student, incident number or words" label="Search incidents" className="flex-1 md:min-w-[260px]" id="inc-search" />
            <div className="flex gap-2 flex-wrap">
              <PeriodFilter {...p.dates} fallback="thismonth" />
              {can.export && <ExportButton href={exportHref} />}
            </div>
          </Toolbar>
          <DataList rows={d.rows} rowKey={(r) => r.id} minWidth={1000} caption="Hostel incident log" rowClass={(r) => r.id === highlight && "bg-brand/5"}
            empty={<Empty icon={params.q ? Search : ShieldAlert} title={params.q || type ? "No incident matches" : "No incidents in these dates"} body={params.q || type ? "Try other dates, or clear the search." : "A quiet spell. Incidents the wardens record show here."} />}
            columns={[
              { key: "when", label: "Date", nowrap: true, render: (r) => <span>{formatDate(r.at, tz)}<span className="block text-[12.5px] text-ink3">{clockAt(r.at, tz)} · <span className="font-mono">{r.incidentNo}</span></span></span> },
              { key: "type", label: "Type", render: (r) => <Pill tone={INCIDENT_TYPE[r.type as IncidentType].tone}>{INCIDENT_TYPE[r.type as IncidentType].label}</Pill> },
              { key: "who", label: "Student(s) or place", render: (r) => <span>{names(r) || r.place || "—"}<span className="block text-[12.5px] text-ink3">{r.hostelId ? d.hostels.get(r.hostelId) : ""}{names(r) && r.place ? ` · ${r.place}` : ""}</span></span> },
              { key: "what", label: "What happened", className: "max-w-[320px]", render: (r) => <span className="line-clamp-3">{r.description}</span> },
              { key: "action", label: "Action taken", className: "max-w-[260px]", render: (r) => <span className="line-clamp-3">{r.actionTaken ?? <span className="text-ink3">—</span>}{r.parentMessagedAt && <span className="block text-[12px] text-ok">Parent told</span>}{r.behaviourIncidentId && <span className="block text-[12px] text-info">In the behaviour record</span>}</span> },
              { key: "by", label: "Recorded by", render: (r) => (r.recordedById && d.people.get(r.recordedById)) ?? "—" },
            ]}
            phone={(r) => ({ title: names(r) || r.place || INCIDENT_TYPE[r.type as IncidentType].label, sub: `${formatDate(r.at, tz)}, ${clockAt(r.at, tz)} · ${r.description}`, icon: ShieldAlert, iconTone: INCIDENT_TYPE[r.type as IncidentType].tone, right: <Pill tone={INCIDENT_TYPE[r.type as IncidentType].tone}>{INCIDENT_TYPE[r.type as IncidentType].label}</Pill> })}
          />
          {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(base, params, { view: "incidents", page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(base, params, { view: "incidents", page: params.page + 1 })} />}
        </Card>
        <p className="text-[12.5px] text-ink3">Maintenance incidents are followed up from this log. Discipline incidents can also go to the student&apos;s behaviour record in Student Management.</p>
      </Stack>
      {opening && (
        <IncidentSheet closeHref={href({ incident: null, student: null })} hostels={p.myHostels.map((h) => ({ id: h.id, name: h.name }))} todayStr={p.todayStr}
          nowTime={`${String(Math.floor(p.minute / 60)).padStart(2, "0")}:${String(p.minute % 60).padStart(2, "0")}`} behaviourTypes={d.behaviour}
          start={{ type: one(sp.type) && ["DISCIPLINE", "MEDICAL", "MAINTENANCE"].includes(one(sp.type)) ? one(sp.type) : "DISCIPLINE", students: d.start, description: "" }} />
      )}
    </>
  );
}
