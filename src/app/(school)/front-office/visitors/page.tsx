import { Car, ChartColumn, DoorOpen, IdCard, LogIn, LogOut, Plus, ScanLine, SearchX, TimerOff, UserPlus, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { dateWhere, momentWhere } from "@/lib/periods";
import { gateScope, visitorScope } from "@/lib/front-office/access";
import { checkPass, expiredWhere, statusWhere, visitorLogWhere, visitorSearch, visitorStatus } from "@/lib/front-office/visitors";
import { addDaysIso, clockAt, dayMonth, shortDay } from "@/lib/front-office/time";
import { VISITOR_TONE, maskPhone, replyOf, showPhone, type VisitorStatus } from "@/lib/front-office/words";
import { fileLink } from "@/lib/files";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ExportButton } from "@/components/ui/export-button";
import { BarsChart } from "@/components/ui/bars-chart";
import { HBars } from "@/components/ui/charts";
import { cx } from "@/components/ui/cx";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch } from "@/components/money/url-filters";
import { Banner, Col, DataList, Empty, Split, Stack, Stats, Toolbar } from "@/components/money/kit";
import { FoHead } from "../_components/head";
import { CommonSheets } from "../_components/common-sheets";
import { GateEntrySheet } from "../_components/visitor-sheets";
import { CheckSheet } from "../_components/pass-check";
import { BASE, addQ, foGuard, foPeriod, one, qs, type SearchParams } from "../_lib/page";

export const metadata = { title: "Visitors" };

const HREF = `${BASE}/visitors`;
const STATUS_ORDER: Record<VisitorStatus, number> = { In: 0, Expired: 1, Out: 2 };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Visitors (16 §2, mod-frontoffice.jsx VisitorsPage): the visitor log with passes, and the gate log where the school keeps one. */
export default async function VisitorsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await foGuard("visitors");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const now = p.now;
  const gate = p.v.level === "gate";
  const gateLogOn = p.has("front-office-gate-log");
  const view = gateLogOn && (one(sp.view) === "gate" || (gate && one(sp.view) !== "log")) ? "gate" : "log";
  const status = ["In", "Out", "Expired"].includes(one(sp.status)) ? one(sp.status) : "all";
  const q = one(sp.q).trim().slice(0, 60);
  const masked = !p.can.visitorPhones;
  const vp = foPeriod(sp, p.dates, "today");
  const gp = foPeriod(sp, p.dates, "today", "g");
  const range = vp.range!;
  const isToday = range.from === p.todayStr && range.to === p.todayStr;
  const gRange = gp.range!;
  const todayMoments = momentWhere({ period: "today", from: p.todayStr, to: p.todayStr, label: "Today" }, p.tz);
  const scope = visitorScope(p.v, p.today);
  const weekStartIso = weekStart(p.todayStr, p.dates.weekStart);

  const data = await withSchool(ctx, async (tx) => {
    const search = await visitorSearch(tx, q, !masked);
    const dr = dateWhere(range);
    const countWhere = (st: string) => visitorLogWhere({ scope, from: dr.gte, to: dr.lte, withOpenExpired: isToday, status: st, search, now });
    const where = countWhere(status);
    const [rows, counts, inside, oldest, todayCount, todayPeople, gateToday, expired, week, check] = await Promise.all([
      tx.visitorEntry.findMany({ where, orderBy: { timeIn: "desc" }, take: 300 }),
      Promise.all(["all", "In", "Out", "Expired"].map((s) => tx.visitorEntry.count({ where: countWhere(s) }))),
      tx.visitorEntry.count({ where: { AND: [{ archivedAt: null }, scope, statusWhere("In", now)] } }),
      tx.visitorEntry.findFirst({ where: { AND: [{ archivedAt: null }, scope, statusWhere("In", now)] }, orderBy: { timeIn: "asc" }, select: { timeIn: true } }),
      tx.visitorEntry.count({ where: { AND: [{ archivedAt: null }, scope, { visitDate: p.today }] } }),
      tx.visitorEntry.aggregate({ where: { AND: [{ archivedAt: null }, scope, { visitDate: p.today }] }, _sum: { peopleCount: true } }),
      gateLogOn ? tx.gateEntry.findMany({ where: { archivedAt: null, at: todayMoments }, select: { kind: true } }) : Promise.resolve([] as { kind: string }[]),
      tx.visitorEntry.findMany({ where: { AND: [expiredWhere(now), scope] }, orderBy: { passExpiresAt: "desc" }, take: 10 }),
      p.v.see === "all" ? tx.visitorEntry.findMany({ where: { archivedAt: null, visitDate: { gte: new Date(`${weekStartIso}T00:00:00Z`), lte: p.today } }, select: { visitDate: true, purpose: true, timeIn: true, timeOut: true } }) : Promise.resolve([]),
      "check" in sp ? checkPass(tx, one(sp.check), now) : Promise.resolve(null),
    ]);
    const gateRows = view === "gate"
      ? await tx.gateEntry.findMany({ where: { AND: [{ archivedAt: null }, gateScope(p.v, todayMoments.gte), { at: momentWhere(gRange, p.tz) }] }, orderBy: { at: "desc" }, take: 300 })
      : [];
    const staffIds = [...new Set(rows.map((r) => r.meetStaffId).filter((x): x is string => Boolean(x)))];
    const recorderIds = [...new Set(gateRows.map((g) => g.recordedById).filter((x): x is string => Boolean(x)))];
    const [staff, recorders] = await Promise.all([
      tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } }),
      tx.userLogin.findMany({ where: { id: { in: recorderIds } }, select: { id: true, displayName: true } }),
    ]);
    return { rows, counts, inside, oldest, todayCount, todayPeople: todayPeople._sum.peopleCount ?? 0, gateToday, expired, week, check, gateRows, staff, recorders };
  });

  const staffName = (id: string | null) => data.staff.find((s) => s.id === id)?.fullName ?? "";
  const phoneOf = (ph: string) => (masked ? maskPhone(ph) : showPhone(ph));
  const rows = [...data.rows].sort((a, b) => STATUS_ORDER[visitorStatus(a, now)] - STATUS_ORDER[visitorStatus(b, now)]);
  const keep = { view: view === "gate" && !gate ? "gate" : view === "log" && gate ? "log" : null, ...vp.keep, ...gp.keep };
  const here = (extra: Record<string, string | null>) => qs(HREF, { ...keep, status: status === "all" ? null : status, q: q || null, ...extra });
  const exportHref = qs(`${HREF}/export`, { ...vp.keep, status: status === "all" ? null : status, q: q || null });
  const gateExportHref = qs(`${HREF}/gate-export`, gp.keep);
  const buses = data.gateToday.filter((g) => g.kind === "school-bus").length;
  const vans = data.gateToday.filter((g) => g.kind === "vehicle" || g.kind === "delivery").length;
  const firstExpired = data.expired[0];
  const sheetHref = here({});

  // This week: visitors by day, by purpose, average time inside.
  const days = Array.from({ length: Math.max(1, Math.min(7, dayDiff(weekStartIso, p.todayStr) + 1)) }, (_, i) => addDaysIso(weekStartIso, i));
  const byDay = days.map((d) => ({ k: WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()], v: data.week.filter((w) => w.visitDate.toISOString().slice(0, 10) === d).length, tone: d === p.todayStr ? ("brand" as const) : undefined }));
  const purposeCount = new Map<string, number>();
  for (const w of data.week) purposeCount.set(w.purpose, (purposeCount.get(w.purpose) ?? 0) + 1);
  const byPurpose = [...purposeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ k, v, label: String(v) }));
  const closed = data.week.filter((w) => w.timeOut);
  const avgInside = closed.length ? Math.round(closed.reduce((s, w) => s + (w.timeOut!.getTime() - w.timeIn.getTime()), 0) / closed.length / 60_000) : null;
  const weekMax = Math.max(4, ...byDay.map((d) => d.v));
  const weekTop = Math.ceil(weekMax / 5) * 5;

  const statusChips = [
    { value: "all", label: "All", count: data.counts[0] },
    { value: "In", label: "In the building", count: data.counts[1] },
    { value: "Out", label: "Out", count: data.counts[2] },
    { value: "Expired", label: "Expired", count: data.counts[3] },
  ].map((c) => ({ ...c, href: here({ status: c.value === "all" ? null : c.value }) }));

  return (
    <div>
      <FoHead pageName="Visitors" href={HREF}
        sub={gate ? "At the gate only: register visitors, record vehicles and check passes" : `Visitor log · every pass expires by itself at ${p.passEndWords}`}
        actions={<>
          <ButtonLink href={`${sheetHref}${sheetHref.includes("?") ? "&" : "?"}check=`} scroll={false} variant="secondary" icon={ScanLine}>Check a pass</ButtonLink>
          {gate && gateLogOn && p.can.gateWork && <ButtonLink href={addQ(sheetHref, { do: "gate" })} scroll={false} variant="secondary" icon={Car}>Gate entry</ButtonLink>}
          {p.can.register && <ButtonLink href={addQ(sheetHref, { do: "visitor" })} scroll={false} variant="primary" icon={UserPlus}>Add visitor</ButtonLink>}
        </>} />
      <Stack>
        <Stats items={[
          { label: "In the building now", value: String(data.inside), sub: data.oldest ? `Oldest since ${clockAt(data.oldest.timeIn, p.tz)}` : "Nobody inside", tone: "ok", icon: Users, href: qs(HREF, { status: "In", view: gate ? "log" : null }), active: view === "log" && status === "In" },
          { label: "Visitors today", value: String(data.todayCount), sub: data.todayPeople > data.todayCount ? `${data.todayPeople} people with companions` : data.todayCount ? "No companions" : "None yet", icon: IdCard, href: qs(HREF, { view: gate ? "log" : null }), active: view === "log" && status === "all" && isToday },
          ...(gateLogOn ? [{ label: "Gate entries today", value: String(data.gateToday.length), sub: data.gateToday.length ? [buses && `${buses} school bus${buses === 1 ? "" : "es"}`, vans && `${vans} vehicle${vans === 1 ? "" : "s"}`].filter(Boolean).join(", ") || "People on foot" : "None yet", icon: Car, href: qs(HREF, { view: gate ? null : "gate" }), active: view === "gate" }] : []),
          { label: "Not checked out", value: String(data.expired.length), sub: "Pass expired", tone: data.expired.length ? ("bad" as const) : undefined, icon: TimerOff, href: qs(HREF, { status: "Expired", view: gate ? "log" : null }), active: view === "log" && status === "Expired" },
        ]} />
        {firstExpired && !gate && (
          <Banner tone="bad" title={`${data.expired.length} visitor${data.expired.length === 1 ? "" : "s"} not checked out${firstExpired.visitDate.getTime() === p.today.getTime() ? " today" : ""}:`}
            action={p.can.checkOut ? <ButtonLink href={addQ(sheetHref, { out: firstExpired.id })} scroll={false} size="sm" variant="secondary" icon={LogOut}>Check out with the right time</ButtonLink> : undefined}>
            {firstExpired.name}, pass {firstExpired.passNo}, expired at {clockAt(firstExpired.passExpiresAt, p.tz)} on {firstExpired.visitDate.getTime() === p.today.getTime() ? "today" : dayMonth(firstExpired.visitDate)}.
          </Banner>
        )}
        {gateLogOn && (
          <SegLinks value={view} label="Visitor log or gate log" className="self-start" options={[
            { value: "log", label: <><IdCard size={16} aria-hidden="true" />Visitor log</>, href: qs(HREF, { view: gate ? "log" : null }) },
            { value: "gate", label: <><Car size={16} aria-hidden="true" />Gate log</>, href: qs(HREF, { view: gate ? null : "gate" }) },
          ]} />
        )}
        {view === "log" ? (
          <Split>
            <Card className="overflow-hidden">
              <Toolbar>
                <UrlSearch id="vis-search" placeholder={masked ? "Name, vehicle or pass number" : "Name, phone, vehicle or pass number"} />
                <PeriodFilter {...p.dates} fallback="today" />
                {p.can.export && <ExportButton href={exportHref} />}
              </Toolbar>
              <div className="px-3 pt-3 pb-1"><Chips value={status} options={statusChips} label="Visitor status" /></div>
              <DataList rows={rows} rowKey={(v) => v.id} minWidth={860} rowHref={(v) => addQ(sheetHref, { pass: v.id })} caption="Visitor log"
                footer={`Showing ${rows.length} visitor${rows.length === 1 ? "" : "s"} · ${vp.label.toLowerCase()}${isToday && data.expired.some((e) => e.visitDate.getTime() !== p.today.getTime()) ? ", with passes not closed" : ""}`}
                columns={[
                  { key: "name", label: "Visitor", render: (v) => <div className="flex items-center gap-3"><Avatar name={v.name} size={36} src={v.photoFileId ? fileLink(v.photoFileId, v.schoolId) : null} /><div className="min-w-0"><p className="font-semibold leading-tight">{v.name}</p><p className="text-[12px] text-ink3 tnum">{phoneOf(v.phone)}{v.peopleCount > 1 ? ` · ${v.peopleCount} people` : ""}</p></div></div> },
                  { key: "purpose", label: "Purpose", render: (v) => <div><p className="text-[13.5px]">{v.purpose}</p>{v.note && <p className="text-[12px] text-ink3">{v.note}</p>}</div> },
                  { key: "meet", label: "To meet", render: (v) => { const r = replyOf(v.staffReply); const st = visitorStatus(v, now); return <div><p className="text-[13.5px]">{staffName(v.meetStaffId) || <span className="text-ink3">—</span>}</p>{r && st === "In" && <p className={cx("text-[12px] font-semibold", { ok: "text-ok", warn: "text-warn", bad: "text-bad" }[r.tone])}>Replied: {r.label}</p>}</div>; } },
                  { key: "veh", label: "Vehicle", nowrap: true, render: (v) => (v.vehicleNo ? <span className="font-mono text-[12.5px]">{v.vehicleNo}</span> : <span className="text-ink3">—</span>) },
                  { key: "time", label: "In / out", nowrap: true, render: (v) => { const st = visitorStatus(v, now); return <span className="tnum text-[13px]">{v.visitDate.getTime() !== p.today.getTime() ? `${dayMonth(v.visitDate)}, ` : ""}{clockAt(v.timeIn, p.tz)} – {v.timeOut ? clockAt(v.timeOut, p.tz) : st === "Expired" ? "?" : "now"}</span>; } },
                  { key: "st", label: "Status", render: (v) => { const st = visitorStatus(v, now); return <div><Pill tone={VISITOR_TONE[st]} dot={st === "In"}>{st}</Pill><p className="text-[11.5px] text-ink3 font-mono mt-0.5">{v.passNo}</p></div>; } },
                  { key: "act", label: "", render: (v) => (p.can.checkOut && visitorStatus(v, now) !== "Out" ? <ButtonLink href={addQ(sheetHref, { out: v.id })} scroll={false} size="sm" variant="secondary" icon={LogOut} className="relative z-[1]">Check out</ButtonLink> : null) },
                ]}
                phone={(v) => {
                  const st = visitorStatus(v, now);
                  const r = replyOf(v.staffReply);
                  const met = staffName(v.meetStaffId);
                  return {
                    title: v.name, avatar: v.name,
                    sub: [v.purpose, met, `in ${clockAt(v.timeIn, p.tz)}${v.timeOut ? `, out ${clockAt(v.timeOut, p.tz)}` : ""}`].filter(Boolean).join(" · "),
                    pills: <>
                      <Pill tone={VISITOR_TONE[st]} className="!h-[22px] !text-[11.5px]">{st}</Pill>
                      {r && st === "In" && <Pill tone={r.tone} className="!h-[22px] !text-[11.5px]">{r.label}</Pill>}
                      {v.vehicleNo && <Pill className="!h-[22px] !text-[11.5px] font-mono">{v.vehicleNo}</Pill>}
                    </>,
                  };
                }}
                empty={q || status !== "all" || !isToday
                  ? <Empty icon={SearchX} title="No visitor matches" body={masked ? "Try the vehicle number, the pass number or another day." : "Try the phone number, the vehicle number or another day."} action={<ButtonLink href={HREF} variant="secondary">Clear filters</ButtonLink>} />
                  : <Empty icon={DoorOpen} title="No visitors yet today" body="Every visitor gets a pass with a QR code that expires by itself." action={p.can.register ? <ButtonLink href={addQ(sheetHref, { do: "visitor" })} scroll={false} variant="secondary" icon={UserPlus}>Add visitor</ButtonLink> : undefined} />} />
            </Card>
            {p.v.see === "all" && (
              <Col>
                <Card>
                  <CardHeader title="This week" description="Visitors by day" icon={ChartColumn} />
                  <div className="px-3 pb-1"><BarsChart data={byDay} height={140} max={weekTop} ticks={[0, weekTop / 2, weekTop]} ariaLabel="Visitors by day this week" /></div>
                  <div className="px-5 pb-5 pt-2">
                    <p className="eyebrow text-ink3 mb-2.5">By purpose</p>
                    {byPurpose.length ? <HBars rows={byPurpose} max={Math.max(1, byPurpose[0].v)} unit="" labelWidth={92} ariaLabel="Visitors by purpose this week" /> : <p className="text-[13px] text-ink3">No visitors this week yet.</p>}
                    <p className="text-[12.5px] text-ink3 mt-3">Average time inside: <b className="text-ink2">{avgInside != null ? `${avgInside} minute${avgInside === 1 ? "" : "s"}` : "not known yet"}</b></p>
                  </div>
                </Card>
              </Col>
            )}
          </Split>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader title="Gate log" description="Entries and exits at the main gate, with vehicle numbers and passes checked" icon={Car}
              action={<div className="flex gap-2 flex-wrap justify-end">
                {p.can.gateWork && <ButtonLink href={addQ(sheetHref, { do: "gate" })} scroll={false} size="sm" variant="soft" icon={Plus} aria-label="Gate entry"><span className="hidden sm:inline">Gate entry</span></ButtonLink>}
                {p.can.exportGate && <ExportButton href={gateExportHref} size="sm" />}
              </div>} />
            <div className="px-5 pb-3"><PeriodFilter {...p.dates} fallback="today" prefix="g" size="sm" /></div>
            <DataList rows={data.gateRows} rowKey={(g) => g.id} minWidth={720} caption="Gate log"
              footer={`${data.gateRows.length} entr${data.gateRows.length === 1 ? "y" : "ies"} · ${gp.label.toLowerCase()}${data.recorders.length ? ` · recorded by ${data.recorders.map((r) => r.displayName).join(", ")}` : ""}`}
              columns={[
                { key: "t", label: "Time", nowrap: true, render: (g) => <span className="tnum font-semibold">{gRange.from !== gRange.to ? `${shortDay(new Date(`${localDay(g.at, p.tz)}T00:00:00Z`))}, ` : ""}{clockAt(g.at, p.tz)}</span> },
                { key: "dir", label: "In / out", render: (g) => <Pill tone={g.direction === "IN" ? "info" : "neutral"}>{g.direction === "IN" ? <LogIn size={13} aria-hidden="true" /> : <LogOut size={13} aria-hidden="true" />}{g.direction === "IN" ? "In" : "Out"}</Pill> },
                { key: "who", label: "Person or vehicle", render: (g) => <span className="text-[13.5px] font-medium">{gateWho(g)}</span> },
                { key: "veh", label: "Vehicle no.", nowrap: true, render: (g) => (g.vehicleNo ? <span className="font-mono text-[12.5px]">{g.vehicleNo}</span> : <span className="text-ink3">—</span>) },
                { key: "p", label: "Purpose", render: (g) => <span className={cx("text-[13px]", g.gatePassId || g.visitorEntryId ? "text-ok font-semibold" : "text-ink2")}>{g.purpose || "—"}</span> },
              ]}
              phone={(g) => ({ title: gateWho(g), sub: `${clockAt(g.at, p.tz)} · ${g.purpose || "—"}`, icon: g.direction === "IN" ? LogIn : LogOut, iconTone: g.direction === "IN" ? "info" : "neutral", pills: g.vehicleNo ? <Pill className="!h-[22px] !text-[11.5px] font-mono">{g.vehicleNo}</Pill> : undefined })}
              empty={<Empty icon={Car} title={gRange.from === p.todayStr && gRange.to === p.todayStr ? "No gate entries yet today" : "No gate entries on these dates"} body="Vehicles, school buses and deliveries are recorded here with the time."
                action={p.can.gateWork ? <ButtonLink href={addQ(sheetHref, { do: "gate" })} scroll={false} variant="secondary" icon={Plus}>Gate entry</ButtonLink> : <ButtonLink href={qs(HREF, { view: "gate" })} variant="secondary">Show today</ButtonLink>} />} />
          </Card>
        )}
      </Stack>
      {"check" in sp && data.check !== undefined && <CheckSheet close={sheetHref} code={one(sp.check)} res={data.check} tz={p.tz} gateWork={p.can.gateWork} today={p.today} schoolId={ctx.schoolId} />}
      {one(sp.do) === "gate" && gateLogOn && p.can.gateWork && <GateEntrySheet closeHref={sheetHref} nowWords={clockAt(now, p.tz)} />}
      <CommonSheets sp={sp} href={HREF} keepKeys={["view", "status", "q", "period", "from", "to", "gperiod", "gfrom", "gto"]} />
    </div>
  );
}

type GateRow = { kind: string; who: string };
function gateWho(g: GateRow) {
  const prefix = { vehicle: "Vehicle", "school-bus": "School bus", delivery: "Delivery", person: "" }[g.kind] ?? "";
  return prefix && !g.who.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix} · ${g.who}` : g.who;
}

function localDay(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function dayDiff(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

function weekStart(todayIso: string, start: "monday" | "sunday") {
  const d = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
  const back = start === "monday" ? (d + 6) % 7 : d;
  return addDaysIso(todayIso, -back);
}
