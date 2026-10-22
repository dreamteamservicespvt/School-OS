import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Clock, Fingerprint, History, Info, Minus, PencilLine, QrCode, Smartphone, Timer, UserCheck, UserX, Users, ArrowLeft, Building2, X } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { day, eachDay, isoDay, monthEnd, monthLabel, monthStart } from "@/lib/staff/dates";
import { attendancePage, onCampusFromPage } from "@/lib/attendance/page";
import { BASE, correctionAllowed, staffAllowed, staffIdLimit, staffLimit } from "@/lib/attendance/access";
import { readMonth } from "@/lib/attendance/register";
import { lockState, dayText } from "@/lib/attendance/marks";
import { dayInfo, offDayMessage, schoolDays } from "@/lib/attendance/calendar";
import { staffDay, staffDayCounts, type StaffDayRow } from "@/lib/attendance/staff";
import { staffMonth } from "@/lib/attendance/integrations";
import { clampMonth, staffBounds } from "@/lib/attendance/calendar-months";
import { METHOD_WORDS, statusList, statusesFor } from "@/lib/attendance/settings";
import { attendanceSummary, percentText } from "@/lib/attendance/summary";
import { clockHHMM, minutesText, time12 } from "@/lib/attendance/time";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Stats } from "@/components/ui/stats";
import { Chips } from "@/components/ui/chips";
import { Progress } from "@/components/ui/kit";
import { cx } from "@/components/ui/cx";
import { DL, Split, Col } from "@/components/ui/rows";
import { DataList } from "@/app/(school)/attendance-management/_components/data-list";
import { RowMenu, type RowMenuItem } from "../_components/row-menu";
import { CloseSheetButton, UrlDate, UrlSearch, UrlSheet } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { MonthSelect } from "@/components/attendance/month-select";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "../_components/att-head";
import { ExportMenu } from "../_components/export-menu";
import { Cell, type StatusView } from "../_components/status";
import { StaffSheet } from "../_components/staff-sheet";
import { ArchiveOvertime, ArchiveShift, AssignShiftForm, OvertimeForm, ShiftForm } from "../_components/staff-forms";
import { archiveOvertimeAction, archiveShiftAction, assignShiftAction, recordOvertimeAction, saveShiftAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Staff Attendance" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const ym = (d: Date) => isoDay(d).slice(0, 7);
const PATH = `${BASE}/staff`;
const SOURCE_ICON: Record<string, typeof Minus> = { device: Fingerprint, qr: QrCode, mobile: Smartphone, geo: Smartphone, register: PencilLine };
const plus = (hhmm: string, min: number) => { const [h, m] = hhmm.split(":").map(Number); const t = h * 60 + m + min; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

export default async function StaffAttendancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = await attendancePage();
  const { current, settings, features, tz, today, now } = page;
  // One campus chosen on the Dashboard (?campus=): that campus's staff only, as the card counted them.
  const { access } = await onCampusFromPage(page, sp.campus);
  if (access.staff === "none") redirect("/no-access?m=attendance-management");
  const all = access.staff === "all";
  // The Principal and Vice Principal read staff attendance; HR and the office mark it (prototype DUTY).
  const canEdit = all && access.change !== "none" && access.pages.staff === "full";
  const overtimeOn = features.has("attendance-overtime");
  const shiftsOn = features.has("attendance-shifts");
  const qs = (change: Record<string, string | null>, keep = true) => {
    const p = new URLSearchParams();
    if (keep) for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v);
    for (const [k, v] of Object.entries(change)) { if (v) p.set(k, v); else p.delete(k); }
    return p.size ? `${PATH}?${p}` : PATH;
  };
  const views = [
    { value: "day", label: all ? "Today" : "My attendance", href: PATH },
    ...(canEdit ? [{ value: "mark", label: "Mark by hand", href: `${PATH}?view=mark` }] : []),
    { value: "month", label: all ? "Month" : "My month", href: `${PATH}?view=month` },
    ...(all && overtimeOn ? [{ value: "overtime", label: "Overtime", href: `${PATH}?view=overtime` }] : []),
    ...(all && shiftsOn ? [{ value: "shifts", label: "Shifts", href: `${PATH}?view=shifts` }] : []),
  ];
  const view = views.find((v) => v.value === one(sp.view))?.value ?? "day";
  const wanted = one(sp.date);
  const date = wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) && day(wanted) <= today ? day(wanted) : today;
  const isToday = isoDay(date) === isoDay(today);

  const base = await withSchool(current.ctx, async (tx) => ({
    statuses: statusesFor(await statusList(tx, current.ctx), "staff").map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone })) as StatusView[],
    count: await tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [staffLimit(access)] } }),
  }));
  const statuses = base.statuses;
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const methods = settings.staffMethods.map((m) => (m === "device" ? "the devices" : m === "qr" ? "QR" : m === "mobile" ? "the app" : null)).filter(Boolean);
  const sub = all
    ? `${isToday ? "Today" : "On"}, ${dayText(date)} · ${base.count} staff${methods.length ? ` · in times from ${methods.join(", ").replace(/, ([^,]*)$/, " and $1")}` : ""}`
    : "Your own attendance, from the devices, QR, the app or the register";

  const opened = one(sp.staff);
  const sheet = opened && /^[0-9a-f-]{36}$/.test(opened) && ((all && staffAllowed(access, opened)) || opened === access.staffId) ? await StaffMonthSheet(opened) : null;

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={PATH} sub={sub}
        actions={canEdit && view === "day" ? <ButtonLink href={`${PATH}?view=mark${wanted ? `&date=${wanted}` : ""}`} icon={PencilLine}><Words k="Mark by hand" /></ButtonLink> : undefined} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {views.length > 1 && <Chips label="Staff attendance views" value={view} options={views} />}
        {view === "day" && <DayView />}
        {view === "mark" && <MarkView />}
        {view === "month" && <MonthView />}
        {view === "overtime" && <OvertimeView />}
        {view === "shifts" && <ShiftsView />}
      </div>
      {sheet}
    </>
  );

  /** One staff member's month as a calendar (?staff=…&month=2026-08), paging back to the previous academic year. */
  async function StaffMonthSheet(staffId: string) {
    const data = await withSchool(current.ctx, async (tx) => {
      const s = await tx.staff.findFirst({ where: { id: staffId, archivedAt: null }, select: { id: true, fullName: true, staffCode: true, designation: true } });
      if (!s) return null;
      const bounds = await staffBounds(tx, staffId, today);
      const m = clampMonth(readMonth(one(sp.month)) ?? today, bounds);
      return { s, bounds, view: await staffMonth(tx, current.ctx, staffId, m, today, access.campusId) };
    });
    if (!data) return null;
    const y = data.view.summary;
    return (
      <UrlSheet param={["staff", "month"]} title={data.s.fullName} sub={`${data.s.designation} · ${data.s.staffCode}`}
        footer={<>{canEdit && <ButtonLink href={`${PATH}?view=mark&date=${isoDay(today)}`} icon={PencilLine}><Words k="Correct today" /></ButtonLink>}<CloseSheetButton param={["staff", "month"]} variant="ghost" /></>}>
        <div className="flex flex-col gap-4">
          <MonthCalendar view={data.view} statuses={statuses} min={data.bounds.min} max={data.bounds.max} todayIso={isoDay(today)} threshold={settings.thresholdPercent} compact />
          <div className="grid grid-cols-3 gap-2">
            {([["Present", y.present], ["Late", y.late], ["Leave", y.leave]] as const).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="font-display text-[22px] font-semibold tnum leading-none">{v}</p><p className="text-[12px] text-ink3 font-semibold mt-1">{k}</p></div>
            ))}
          </div>
          <p className="text-[12.5px] text-ink3">{y.workingDays} <Words k="working days in" /> {data.view.label}{data.view.month === ym(today) ? " so far" : ""}<Words k=". Sundays, holidays and days off are not counted." /></p>
        </div>
      </UrlSheet>
    );
  }

  async function DayView() {
    const dept = one(sp.department) ?? "";
    const status = one(sp.status) ?? "";
    const q = (one(sp.q) ?? "").slice(0, 80);
    const data = await withSchool(current.ctx, async (tx) => {
      // The department tiles count everyone; the list below follows the search and the tile chosen.
      const whole = await staffDay(tx, current.ctx, access, date);
      const searched = q ? await staffDay(tx, current.ctx, access, date, { q }) : whole;
      // A person limited to one campus sees the corrections about that campus's staff only.
      const corrections = all
        ? (await tx.attendanceCorrection.findMany({ where: { forWhom: "staff", archivedAt: null }, orderBy: { createdAt: "desc" }, take: access.limitStaff ? 200 : 5 })).filter((c) => correctionAllowed(access, c)).slice(0, 5)
        : [];
      const users = await tx.userLogin.findMany({ where: { id: { in: corrections.flatMap((c) => [c.requestedById, c.decidedById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
      return {
        info: await dayInfo(tx, current.ctx, date, access.campusId),
        whole,
        everyone: searched,
        departments: all ? await tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
        corrections, users: new Map(users.map((u) => [u.id, u.displayName])),
      };
    });
    const lock = lockState(settings, date, now, tz);
    // The cards at the top: the whole staff that day (the same counts as the Dashboard's tile).
    const w = data.whole;
    const counts = staffDayCounts(w);
    const { isLate, isLeave, isIn, present, late, leave } = counts;
    const notIn = counts.notInYet;
    const missing = counts.notIn;
    const lateAvg = late.length ? Math.round(late.reduce((s, r) => s + (r.mark?.lateMinutes ?? 0), 0) / late.length) : 0;
    const total = w.length;
    // By department (owner's prototype changes of 13 Oct 2026): tiles replace the department dropdown.
    const deptName = dept === "none" ? "No department" : data.departments.find((x) => x.id === dept)?.name ?? null;
    const tiles = [...data.departments, { id: "none", name: "No department" }].map((x) => {
      const rs = w.filter((r) => (r.departmentId ?? "none") === x.id);
      const counts = { in: rs.filter(isIn).length, late: rs.filter(isLate).length, leave: rs.filter(isLeave).length, notIn: rs.filter(notIn).length };
      return { ...x, n: rs.length, ...counts, out: counts.leave + counts.notIn };
    }).filter((x) => x.n > 0);
    // The list: the search and the department chosen, then the status chip.
    const inDept = data.everyone.filter((r) => !dept || (r.departmentId ?? "none") === dept);
    const dc = { all: inDept.length, late: inDept.filter(isLate).length, leave: inDept.filter(isLeave).length, notIn: inDept.filter(notIn).length };
    const rows = inDept.filter((r) => (status === "late" ? isLate(r) : status === "leave" ? isLeave(r) : status === "not-marked" ? notIn(r) : true))
      .toSorted((a, b) => Number(notIn(b)) - Number(notIn(a)) || Number(isLate(b)) - Number(isLate(a)));
    const statusPill = (r: StaffDayRow) => {
      if (notIn(r)) return <Pill tone={isToday && !lock.locked ? "bad" : "neutral"}>{isToday ? "Not in yet" : "Not marked"}</Pill>;
      if (!r.mark) return <Pill tone="info"><Words k="On leave" /></Pill>;
      const st = byKey.get(r.mark.statusKey);
      const tone = r.mark.statusKey === "present" ? "ok" : isLate(r) ? "warn" : r.mark.statusKey === "absent" ? "bad" : "info";
      return <Pill tone={tone}>{r.mark.statusKey === "late" && r.mark.lateMinutes ? `Late · ${r.mark.lateMinutes} min` : st?.name ?? r.mark.statusKey}</Pill>;
    };
    const source = (r: StaffDayRow) => {
      if (!r.mark || !r.mark.inTime) return <span className="text-ink3">—</span>;
      const Ic = SOURCE_ICON[r.mark.method] ?? PencilLine;
      return <span className="flex items-center gap-1 text-[12px] text-ink3 whitespace-nowrap"><Ic size={13} aria-hidden="true" />{METHOD_WORDS[r.mark.method] ?? r.mark.method}</span>;
    };
    const menu = (r: StaffDayRow): RowMenuItem[] => [
      { icon: "calendar" as const, label: "Month view", href: qs({ staff: r.staffId, month: null }) },
      ...(canEdit ? [{ icon: "edit" as const, label: lock.locked && r.mark ? "Request a correction" : "Correct this entry", href: lock.locked && r.mark && !access.lockOverride ? `${BASE}/register/correction?for=staff&date=${isoDay(date)}&staff=${r.staffId}` : `${PATH}?view=mark&date=${isoDay(date)}` }] : []),
      ...(canEdit && overtimeOn ? [{ icon: "timer" as const, label: "Record overtime", href: `${PATH}?view=overtime` }] : []),
    ];
    const exportHref = `${PATH}/export?${new URLSearchParams({ date: isoDay(date), ...(q ? { q } : {}), ...(dept ? { department: dept } : {}), ...(status ? { status } : {}) })}`;
    const filtered = Boolean(q || dept || status);

    if (!all) {
      const me = data.everyone[0];
      return me ? (
        <>
          <Stats items={[
            { label: isToday ? "Today" : dayText(date), value: me.mark ? byKey.get(me.mark.statusKey)?.name ?? me.mark.statusKey : me.onLeave ? "On leave" : "Not marked", icon: UserCheck, tone: me.mark?.statusKey === "present" ? "ok" : me.mark && isLate(me) ? "warn" : undefined },
            { label: "In", value: me.mark?.inTime ? clockHHMM(me.mark.inTime, tz) : "—", sub: `Starts ${time12(me.shift.startTime)}`, icon: Clock },
            { label: "Out", value: me.mark?.outTime ? clockHHMM(me.mark.outTime, tz) : "—", icon: Clock },
            { label: "Source", value: me.mark ? METHOD_WORDS[me.mark.method] ?? me.mark.method : "—", icon: Fingerprint },
          ]} />
          <Card>
            <CardHeader icon={CalendarDays} title="My month" description="Go back to earlier months to see their marks, holidays and leave" />
            <div className="px-5 pb-5"><OwnCalendar staffId={me.staffId} /></div>
          </Card>
        </>
      ) : <EmptyState title="Your login is not linked to a staff record" Icon={Users}><Words k="Ask HR to link your login to your staff record." /></EmptyState>;
    }

    return (
      <>
        <Stats items={[
          { label: "Present", value: `${present} of ${total}`, sub: total ? `${Math.round((present / total) * 1000) / 10}% · ${late.length} of them late` : "No staff", tone: "ok", icon: UserCheck, href: qs({ status: null }) },
          { label: "Late", value: late.length, sub: late.length ? `${lateAvg} min late on average` : "Nobody late", tone: late.length ? "warn" : undefined, icon: Clock, href: qs({ status: "late" }) },
          { label: "On leave", value: leave.length, sub: "Approved in Staff & HR", icon: CalendarDays, href: qs({ status: "leave" }) },
          { label: isToday ? "Not in yet" : "Not marked", value: missing.length, sub: missing.length ? (isToday ? `No punch by ${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(now)}` : "No mark that day") : "Everyone is in", tone: missing.length ? "bad" : "ok", icon: UserX, href: qs({ status: "not-marked" }) },
        ]} />
        {!data.info.on && <Banner tone="warn" title={offDayMessage(data.info, date)}><Words k={"If the school opens that day, turn on \"allow attendance\" for the date in the School Calendar."} /></Banner>}
        {tiles.length > 1 && (
          <Card>
            <CardHeader icon={Building2} title="By department" description={deptName ? `Showing ${deptName} only · tap it again for everyone` : "Tap a department to see only its staff"} />
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-2.5 px-4 pb-4">
              {tiles.map((t) => {
                const on = dept === t.id;
                return (
                  <li key={t.id} className="min-w-0">
                    <Link href={qs({ department: on ? null : t.id, status: null })} aria-current={on ? "true" : undefined}
                      className={cx("block h-full text-left rounded-xl border p-3 transition-colors min-w-0", on ? "border-brand bg-brand/10" : "border-line hover:bg-sunken/70")}>
                      <span className="flex items-baseline justify-between gap-2 min-w-0"><span className="font-semibold text-[14px] truncate">{t.name}</span><span className="tnum text-[13px] text-ink2 shrink-0"><b className="text-ink">{t.in}</b> <Words k="of" /> {t.n}</span></span>
                      <Progress value={(t.in / t.n) * 100} tone={t.out ? "warn" : "ok"} className="mt-2" />
                      <span className={cx("block text-[12px] mt-1.5 leading-snug", t.out ? "text-ink2" : "text-ink3")}>
                        {[t.late && `${t.late} late`, t.leave && `${t.leave} on leave`, t.notIn && `${t.notIn} ${isToday ? "not in" : "not marked"}`].filter(Boolean).join(" · ") || "Everyone is in"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <Split side={340}>
          <Card className="overflow-hidden min-w-0">
            <div className="flex flex-col lg:flex-row gap-2 p-3 border-b border-line">
              <UrlSearch placeholder="Name, staff code or designation" />
              <div className="flex flex-wrap gap-2 items-center">
                {deptName && <ButtonLink href={qs({ department: null })} variant="secondary" icon={X}>{deptName}</ButtonLink>}
                <UrlDate label="Date" value={isoDay(date)} max={isoDay(today)} className="flex-1 sm:flex-none sm:w-44" />
                <ExportMenu href={exportHref} />
              </div>
            </div>
            <div className="px-3 pt-3">
              <Chips label="Staff status" value={status || "all"} options={[
                { value: "all", label: deptName ? `All in ${deptName}` : "Everyone", count: dc.all, href: qs({ status: null }) },
                { value: "late", label: "Late", count: dc.late, href: qs({ status: "late" }) },
                { value: "leave", label: "On leave", count: dc.leave, href: qs({ status: "leave" }) },
                { value: "not-marked", label: isToday ? "Not in yet" : "Not marked", count: dc.notIn, href: qs({ status: "not-marked" }) },
              ]} />
            </div>
            <DataList rows={rows} rowKey={(r) => r.staffId} href={(r) => qs({ staff: r.staffId, month: null })} minWidth={600} caption={`Staff attendance, ${dayText(date)}`}
              actions={(r) => <RowMenu label={`Actions for ${r.name}`} items={menu(r)} />}
              columns={[
                { key: "name", label: "Staff", render: (r) => <div className="flex items-center gap-3 min-w-0"><Avatar name={r.name} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight whitespace-nowrap">{r.name}</p><p className="text-[12.5px] text-ink3 truncate">{r.designation} · {r.department ?? "No department"}</p></div></div> },
                { key: "in", label: "Came in", render: (r) => r.mark?.inTime ? <div className="whitespace-nowrap"><p className="tnum leading-tight">{clockHHMM(r.mark.inTime, tz)}{r.mark.outTime ? <span className="text-ink3"> <Words k="to" /> {clockHHMM(r.mark.outTime, tz)}</span> : null}</p>{source(r)}</div> : <span className="text-ink3">—</span> },
                { key: "st", label: "Status", render: (r) => <div>{statusPill(r)}{r.onLeave && r.mark?.statusKey !== "leave" && <p className="text-[11.5px] text-ink3 mt-0.5"><Words k="Approved leave" /></p>}{r.overtimeMinutes > 0 && <p className="text-[11.5px] text-ink3 mt-0.5"><Words k="Overtime" /> {minutesText(r.overtimeMinutes)}</p>}</div> },
              ]}
              mobile={(r) => ({ avatar: r.name, title: r.name, sub: `${r.designation} · ${r.mark?.inTime ? `in ${clockHHMM(r.mark.inTime, tz)}` : r.onLeave ? "on leave" : "no punch yet"}`, right: statusPill(r) })}
              footer={rows.length > 0 ? <p className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum"><Words k="Showing" /> {rows.length} <Words k="of" /> {dc.all}</p> : false}
              empty={<EmptyState bare Icon={Users} title={filtered ? "No staff match" : "No staff yet"}>{filtered ? "Try another name, department or status." : "Staff appear here once they are added in Staff & HR Management."}</EmptyState>} />
          </Card>
          <Col>
            <Card>
              <CardHeader icon={History} title="Corrections" description="Changes after the lock time go to Approvals" />
              {data.corrections.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="No staff corrections yet." /></p> : (
                <ul className="px-2 pb-2">
                  {data.corrections.map((c) => {
                    const e = (Array.isArray(c.entries) ? c.entries : []) as { name?: string; from?: string | null; to?: string }[];
                    const first = e[0];
                    const tone = c.status === "WAITING" ? "warn" : c.status === "APPROVED" ? "ok" : "bad";
                    const word = c.status === "WAITING" ? "Waiting" : c.status === "APPROVED" ? "Approved" : c.status === "REJECTED" ? "Rejected" : "Withdrawn";
                    const by = c.status === "WAITING" ? `Asked by ${data.users.get(c.requestedById ?? "") ?? "staff"}` : `${word} by ${data.users.get(c.decidedById ?? "") ?? "staff"}`;
                    const what = `${formatDate(c.date, "UTC").slice(0, 5)} · ${first?.from ? `${byKey.get(first.from)?.name ?? first.from} → ` : ""}${first?.to ? byKey.get(first.to)?.name ?? first.to : ""}${e.length > 1 ? ` and ${e.length - 1} more` : ""}`;
                    return (
                      <li key={c.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl">
                        <Avatar name={first?.name ?? "Staff"} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14px] leading-snug">{first?.name ?? "Staff"} <span className="font-normal text-ink3">· {what}</span></p>
                          <p className="text-[12.5px] text-ink3">{c.reason}</p>
                          <p className="text-[12px] mt-1 flex items-center gap-2"><Pill tone={tone} className="!h-5 !text-[11px]">{word}</Pill><span className="text-ink3">{by}</span></p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader icon={Info} title={isToday ? "Today’s rules" : "The rules"} />
              <div className="pb-4">
                <DL cols={1} rows={[
                  ["Late after", `${time12(plus(settings.staffStartTime, settings.staffLateAfterMin))} (start ${time12(settings.staffStartTime)}, ${settings.staffLateAfterMin} minutes grace)`],
                  ...(settings.staffHalfDayAfter ? [["Half day", `In after ${time12(settings.staffHalfDayAfter)}`] as [string, string]] : []),
                  ["Lock time", `Changes after ${lock.atText} need a correction request`],
                  ["Goes to", "Generate Salary: present days, leave and late marks"],
                ]} />
              </div>
            </Card>
          </Col>
        </Split>
      </>
    );
  }

  async function OwnCalendar({ staffId }: { staffId: string }) {
    const data = await withSchool(current.ctx, async (tx) => {
      const bounds = await staffBounds(tx, staffId, today);
      const m = clampMonth(readMonth(one(sp.month)) ?? today, bounds);
      return { bounds, view: await staffMonth(tx, current.ctx, staffId, m, today, access.campusId) };
    });
    return <MonthCalendar view={data.view} statuses={statuses} min={data.bounds.min} max={data.bounds.max} todayIso={isoDay(today)} threshold={settings.thresholdPercent} />;
  }

  async function MarkView() {
    const data = await withSchool(current.ctx, async (tx) => ({
      info: await dayInfo(tx, current.ctx, date, access.campusId),
      rows: await staffDay(tx, current.ctx, access, date),
    }));
    const lock = lockState(settings, date, now, tz);
    return (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href={`${PATH}${wanted ? `?date=${wanted}` : ""}`} variant="ghost" icon={ArrowLeft}><Words k="Back to the list" /></ButtonLink>
          <UrlDate label="Date" value={isoDay(date)} max={isoDay(today)} className="w-44" />
        </div>
        <p className="text-[14px] text-ink2 -mt-2"><Words k="For staff without a punch. Mark everyone present, then change the exceptions. Devices, QR and the app fill the rest." /></p>
        {!data.info.on ? (
          <Banner tone="warn" title={offDayMessage(data.info, date)}><Words k={"If the school opens that day, turn on \"allow attendance\" for the date in the School Calendar."} /></Banner>
        ) : data.rows.length === 0 ? (
          <EmptyState title="No staff yet" Icon={Users}><Words k={"Staff appear here once they are added in Staff & HR Management."} /></EmptyState>
        ) : (
          <StaffSheet key={isoDay(date)} date={isoDay(date)} dateText={dayText(date)} statuses={statuses} canEdit={canEdit}
            locked={lock.locked} lockText={lock.atText} override={access.lockOverride}
            correctionHref={`${BASE}/register/correction?for=staff&date=${isoDay(date)}`}
            rows={data.rows.map((r) => ({
              id: r.staffId, name: r.name, code: r.staffCode, designation: r.designation, department: r.department,
              shift: r.shift.shiftName, start: time12(r.shift.startTime), onLeave: r.onLeave,
              statusKey: r.mark?.statusKey ?? null, inTime: r.mark?.inTime ? clockHHMM(r.mark.inTime, tz) : "", outTime: r.mark?.outTime ? clockHHMM(r.mark.outTime, tz) : "",
              method: r.mark?.method ?? null, methodText: r.mark ? `Source: ${METHOD_WORDS[r.mark.method] ?? r.mark.method}` : null,
              lateMinutes: r.mark?.lateMinutes ?? null, note: r.mark?.note ?? "", overtime: r.overtimeMinutes ? minutesText(r.overtimeMinutes) : null,
            }))} />
        )}
      </>
    );
  }

  async function MonthView() {
    const data = await withSchool(current.ctx, async (tx) => {
      const bounds = await staffBounds(tx, all ? null : access.staffId, today);
      const month = clampMonth(readMonth(one(sp.month)) ?? today, bounds);
      const from = monthStart(month);
      const to = monthEnd(month);
      const staff = await tx.staff.findMany({
        where: { archivedAt: null, joiningDate: { lte: to }, ...(all ? { status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [staffLimit(access)] } : { id: access.staffId ?? "00000000-0000-0000-0000-000000000000" }) },
        orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true },
      });
      const [sum, days] = await Promise.all([
        attendanceSummary(tx, current.ctx, { staffIds: staff.map((s) => s.id), from, to, today, campusId: access.campusId }),
        schoolDays(tx, current.ctx, from, to, access.campusId),
      ]);
      return { staff, sum, days, bounds, from, to };
    });
    const { from, to } = data;
    const dates = eachDay(from, to).filter((d) => d <= today && d.getUTCDay() !== 0).map((d) => ({ iso: isoDay(d), day: d.getUTCDate(), wd: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).slice(0, 2), off: data.days.info(d).on ? null : data.days.info(d).title }));
    const used = new Set([...data.sum.days.values()].flatMap((m) => [...m.values()]));
    const legend = statuses.filter((s) => ["present", "absent", "late", "leave"].includes(s.key) || used.has(s.key));
    return (
      <>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <MonthSelect value={ym(from)} min={data.bounds.min} max={data.bounds.max} className="sm:w-72" />
          <div className="sm:ml-auto"><ExportMenu href={`${PATH}/export?month=${ym(from)}`} /></div>
        </div>
        <Stats items={[
          { label: "Working days", value: data.sum.workingDays, sub: "Sundays, holidays and days off left out", icon: CalendarDays },
          { label: all ? "Staff attendance" : "My attendance", value: percentText(data.sum.overall.percent), icon: UserCheck, tone: data.sum.overall.percent === null ? undefined : data.sum.overall.percent < settings.thresholdPercent ? "bad" : "ok" },
          { label: "Late marks", value: data.sum.overall.late, icon: Clock, tone: data.sum.overall.late ? "warn" : undefined },
          { label: "Leave days", value: data.sum.overall.leave, icon: CalendarDays },
        ]} />
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div>
              <h2 className="font-display text-[17px] font-semibold">{monthLabel(from)}</h2>
              <p className="text-[13px] text-ink3">{data.staff.length} <Words k="staff ·" /> {data.sum.workingDays} <Words k="school days ·" /> {percentText(data.sum.overall.percent)} <Words k="present" /></p>
            </div>
            <ul aria-label="Colour legend" className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink2">
              {legend.map((s) => <li key={s.key} className="flex items-center gap-1.5"><Cell status={s} label={s.name} size={18} />{s.name}</li>)}
            </ul>
          </div>
          {data.staff.length === 0 ? (
            <EmptyState bare title="Nobody to show" Icon={Users}>{all ? "No staff for this month." : "Your login is not linked to a staff record. Ask HR."}</EmptyState>
          ) : (
            <div className="relative overflow-x-auto border-t border-line" tabIndex={0} role="region" aria-label={`Staff attendance, ${monthLabel(from)}`}>
              <table className="w-max min-w-full border-collapse text-[13px]">
                <caption className="sr-only"><Words k="Staff attendance for" /> {monthLabel(from)}</caption>
                <thead>
                  <tr className="text-ink3">
                    <th scope="col" className="sticky left-0 z-10 bg-surface min-w-48 px-4 py-2 text-left font-semibold text-[12.5px]"><Words k="Staff" /></th>
                    {dates.map((d) => <th key={d.iso} scope="col" className="w-8 px-0.5 py-2 text-center font-semibold"><span className="block tnum">{d.day}</span><span className="block text-[10.5px] font-normal">{d.wd}</span></th>)}
                    <th scope="col" className="px-2 text-right font-semibold"><Words k="Present" /></th>
                    <th scope="col" className="px-2 text-right font-semibold"><Words k="Late" /></th>
                    <th scope="col" className="px-2 text-right font-semibold"><Words k="Leave" /></th>
                    <th scope="col" className="px-4 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((s) => {
                    const p = data.sum.people.get(s.id)!;
                    const marks = data.sum.days.get(s.id) ?? new Map<string, string>();
                    return (
                      <tr key={s.id} className="border-t border-line">
                        <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-1.5 text-left font-medium">
                          <Link href={qs({ staff: s.id })} scroll={false} className="hover:text-brand">{s.fullName}</Link> <span className="font-normal text-ink3 font-mono text-[11.5px]">{s.staffCode}</span>
                        </th>
                        {dates.map((d) => d.off
                          ? <td key={d.iso} className="px-0.5 py-1 text-center" title={d.off}><span className="grid size-7 mx-auto place-items-center rounded-md bg-info/10 text-info text-[11px] font-bold">H</span><span className="sr-only">{d.off}</span></td>
                          : <td key={d.iso} className="px-0.5 py-1 text-center"><Cell status={marks.get(d.iso) ? byKey.get(marks.get(d.iso)!) : undefined} label={`${s.fullName}, ${d.day}`} /></td>)}
                        <td className="px-2 text-right tnum">{p.present}</td>
                        <td className="px-2 text-right tnum">{p.late}</td>
                        <td className="px-2 text-right tnum">{p.leave}</td>
                        <td className={`px-4 text-right font-semibold tnum ${p.percent !== null && p.percent < settings.thresholdPercent ? "text-bad" : ""}`}>{percentText(p.percent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3"><Words k="Holidays and Sundays are not counted. This month reaches Generate Salary with present days, leave and late marks." /></p>
        </Card>
      </>
    );
  }

  async function OvertimeView() {
    const dates = await periodSetup(current);
    const range = periodFromSearch(sp, { ...dates, fallback: "thismonth" });
    const data = await withSchool(current.ctx, async (tx) => {
      const [rows, staff] = await Promise.all([
        tx.overtimeEntry.findMany({ where: { archivedAt: null, ...(range ? { date: dateWhere(range) } : {}), ...staffIdLimit(access) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 500 }),
        tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [staffLimit(access)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } }),
      ]);
      return { rows, staff };
    });
    const names = new Map(data.staff.map((s) => [s.id, s]));
    const total = data.rows.reduce((s, r) => s + r.minutes, 0);
    const exportHref = `${PATH}/export?${new URLSearchParams({ view: "overtime", ...Object.fromEntries(["period", "from", "to"].flatMap((k) => (one(sp[k]) ? [[k, one(sp[k])!]] : []))) })}`;
    type Row = (typeof data.rows)[number];
    return (
      <Card className="overflow-hidden">
        <CardHeader icon={Timer} title={`Overtime${range ? `, ${range.label.toLowerCase()}` : ""}`} description={data.rows.length ? `${data.rows.length} entries, ${minutesText(total)} in all. Paid with the salary, if overtime is paid for the role.` : "Paid with the salary, if overtime is paid for the role."}
          action={canEdit ? <OvertimeForm action={recordOvertimeAction} today={isoDay(today)} staff={data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})` }))} /> : undefined} />
        <div className="flex gap-2 px-3 pb-3 border-b border-line">
          <PeriodFilter {...dates} fallback="thismonth" />
          <ExportMenu href={exportHref} />
        </div>
        <DataList<Row> rows={data.rows} rowKey={(r) => r.id} caption="Staff overtime" minWidth={640}
          actions={canEdit ? (r) => <ArchiveOvertime id={r.id} action={archiveOvertimeAction} /> : undefined}
          columns={[
            { key: "n", label: "Staff", render: (r) => <div className="flex items-center gap-3"><Avatar name={names.get(r.staffId)?.fullName ?? "Staff"} size={32} /><div><p className="font-semibold leading-tight">{names.get(r.staffId)?.fullName ?? "Staff member"}</p><p className="text-[12px] text-ink3 font-mono">{names.get(r.staffId)?.staffCode}</p></div></div> },
            { key: "d", label: "Date", render: (r) => <span className="tnum whitespace-nowrap">{formatDate(r.date, "UTC")}</span> },
            { key: "h", label: "Hours", render: (r) => <span className="tnum font-semibold">{minutesText(r.minutes)}</span> },
            { key: "note", label: "Note", render: (r) => <span className="text-ink2">{r.note ?? "—"}</span> },
          ]}
          mobile={(r) => ({ avatar: names.get(r.staffId)?.fullName ?? "Staff", title: names.get(r.staffId)?.fullName ?? "Staff member", sub: `${formatDate(r.date, "UTC")} · ${minutesText(r.minutes)}${r.note ? ` · ${r.note}` : ""}` })}
          empty={<EmptyState bare Icon={Timer} title="No overtime in these dates"><Words k="Record overtime with a note when staff work extra hours." /></EmptyState>} />
      </Card>
    );
  }

  async function ShiftsView() {
    const data = await withSchool(current.ctx, async (tx) => {
      const [shifts, staff, assignments] = await Promise.all([
        tx.staffShift.findMany({ orderBy: [{ archivedAt: "asc" }, { startTime: "asc" }] }),
        tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [staffLimit(access)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } }),
        tx.staffShiftAssignment.findMany({ where: { archivedAt: null, fromDate: { lte: today }, ...staffIdLimit(access) }, orderBy: { fromDate: "desc" }, include: { shift: true } }),
      ]);
      return { shifts, staff, assignments };
    });
    const currentShift = new Map<string, string>();
    for (const a of data.assignments) if (!currentShift.has(a.staffId) && !a.shift.archivedAt) currentShift.set(a.staffId, a.shift.name);
    const count = (id: string) => [...currentShift.values()].filter((n) => n === data.shifts.find((s) => s.id === id)?.name).length;
    const active = data.shifts.filter((s) => !s.archivedAt);
    return (
      <Card>
        <CardHeader icon={Clock} title="Staff shifts" description={`Staff without a shift start at ${time12(settings.staffStartTime)} (Attendance Settings). Late marks follow each shift's start time.`}
          action={canEdit ? <div className="flex flex-wrap gap-2"><ShiftForm action={saveShiftAction} />{active.length > 0 && <AssignShiftForm action={assignShiftAction} today={isoDay(today)} shifts={active.map((s) => ({ value: s.id, label: `${s.name} (${time12(s.startTime)} to ${time12(s.endTime)})` }))} staff={data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode})`, current: currentShift.get(s.id) ?? "School hours" }))} />}</div> : undefined} />
        {data.shifts.length === 0 ? (
          <EmptyState bare Icon={Clock} title="No shifts yet"><Words k="Add a shift, such as Morning 7:00 AM to 1:00 PM, then assign staff to it." /></EmptyState>
        ) : (
          <ul className="px-2 pb-2">
            {data.shifts.map((s) => (
              <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl ${s.archivedAt ? "text-ink3" : ""}`}>
                <div>
                  <p className="font-semibold text-[14.5px]">{s.name}{s.archivedAt && <Pill tone="neutral" className="ml-2 !h-5 !text-[11px]"><Words k="Archived" /></Pill>}</p>
                  <p className="text-[12.5px] text-ink3 tnum">{time12(s.startTime)} <Words k="to" /> {time12(s.endTime)} <Words k="· late after" /> {s.lateAfterMin ?? settings.staffLateAfterMin} <Words k="minutes ·" /> {count(s.id)} <Words k="staff" /></p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    {!s.archivedAt && <ShiftForm action={saveShiftAction} shift={s} />}
                    <ArchiveShift id={s.id} action={archiveShiftAction} restore={Boolean(s.archivedAt)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }
}
