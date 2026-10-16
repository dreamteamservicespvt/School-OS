// Rooms, Labs & Maintenance (14 §2): the facility register (rooms, labs,
// halls and grounds with capacity and the assets in each; the same rooms the
// Time Table uses), maintenance requests (place, priority, technician,
// status, done date, cost) and labs (experiments per class, safety checks,
// lab equipment). Any staff member reports a problem from Report a problem.
import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ClipboardCheck, FlaskConical, Hammer, Megaphone, Pencil, Plus, Search, ShieldCheck, Wrench } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/list";
import { fileLink } from "@/lib/files";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { UrlSheet } from "@/components/ui/url-sheet";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Toolbar, DataList, Empty, SimpleTable, DL, type StatItem } from "@/components/money/kit";
import { classOptions, staffOptions, vendorOptions } from "@/lib/inventory/lookup";
import { FACILITY_TYPES, LAB_CHECKLIST, MAINT_STATUS, PRIORITY, ASSET_STATUS, facilityTypeOfRoom, plural } from "@/lib/inventory/words";
import { InvHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { BASE, invGuard, invPeriod, one, qs, addQ, uuidOr, type SearchParams } from "../_lib/page";
import { maintList, readMaintFilter } from "../_lib/lists";
import { remindStoreAction } from "../actions";
import { archiveExperimentAction } from "./actions";
import { ArchiveFacilitySheet, AssignTechSheet, CloseRequestSheet, ExperimentSheet, FacilitySheet, RaiseSheet, SafetyCheckSheet } from "./sheets";

export const metadata: Metadata = { title: "Rooms, Labs & Maintenance · Inventory Management" };

const TABS = ["maintenance", "facilities", "labs"] as const;
type Tab = (typeof TABS)[number];
const day = (d: Date | null) => (d ? formatDate(d, "UTC") : "");

export default async function RoomsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await invGuard("rooms");
  const { current, can, today, todayStr, tz } = p;
  const tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as Tab) : "maintenance";
  const per = invPeriod(sp, p.dates, tab === "labs" ? "acyear" : null);
  const page = Math.max(1, Math.min(500, Number(one(sp.page)) || 1));
  const open = can.rooms ? one(sp.open) : "";
  const mf = readMaintFilter((k) => one(sp[k]), per.range);
  const requestId = uuidOr(one(sp.request));
  const editPlace = can.rooms ? uuidOr(one(sp.place)) : "";
  const archivePlace = can.rooms ? uuidOr(one(sp.archive)) : "";
  const assignId = can.rooms ? uuidOr(one(sp.assign)) : "";
  const closeId = can.rooms ? uuidOr(one(sp.close)) : "";
  const q = one(sp.q).trim().slice(0, 60);
  const ftype = (FACILITY_TYPES as readonly string[]).includes(one(sp.type)) ? one(sp.type) : "";
  const cls = uuidOr(one(sp.cls));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const d = await withSchool(current.ctx, async (tx) => {
    const [rooms, facilities, openCounts] = await Promise.all([
      tx.room.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
      tx.facility.findMany(),
      tx.maintenanceRequest.groupBy({ by: ["status", "priority"], where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, _count: true }),
    ]);
    const fac = new Map(facilities.map((f) => [f.roomId, f]));
    const doneMonth = await tx.maintenanceRequest.aggregate({ where: { status: "DONE", doneOn: { gte: monthStart } }, _sum: { costPaise: true }, _count: true });
    const maint = tab === "maintenance" ? await maintList(tx, mf, tz, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }) : null;
    const assetsByRoom = tab === "facilities" ? new Map((await tx.asset.groupBy({ by: ["roomId"], where: { status: { not: "DISPOSED" }, archivedAt: null, roomId: { not: null } }, _count: true })).map((g) => [g.roomId!, g._count])) : new Map<string, number>();
    const openByRoom = tab === "facilities" ? new Map((await tx.maintenanceRequest.groupBy({ by: ["roomId"], where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, _count: true })).map((g) => [g.roomId, g._count])) : new Map<string, number>();
    const labs = rooms.filter((r) => r.kind === "lab" || fac.get(r.id)?.type === "Lab");
    const checks = tab === "labs" ? await tx.labSafetyCheck.findMany({ where: { ...(per.range ? { date: { gte: new Date(`${per.range.from}T00:00:00Z`), lte: new Date(`${per.range.to}T00:00:00Z`) } } : {}) }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 100 }) : [];
    const experiments = tab === "labs" ? await tx.labExperiment.findMany({ where: { archivedAt: null, ...(cls ? { classId: cls } : {}) }, orderBy: [{ classId: "asc" }, { subject: "asc" }, { sortOrder: "asc" }, { title: "asc" }], take: 500 }) : [];
    const labAssets = tab === "labs" ? await tx.asset.findMany({ where: { archivedAt: null, status: { not: "DISPOSED" }, OR: [{ roomId: { in: labs.map((l) => l.id) } }, { type: "Lab" }] }, orderBy: { tag: "asc" }, take: 300, include: { repairs: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { id: true } } } }) : [];
    const classes = tab === "labs" || open === "experiment" ? await classOptions(tx, current.ctx) : [];
    const one_ = requestId ? await tx.maintenanceRequest.findFirst({ where: { id: requestId } }) : null;
    const detail = one_ ? {
      r: one_,
      asset: one_.assetId ? await tx.asset.findFirst({ where: { id: one_.assetId }, select: { id: true, tag: true, name: true } }) : null,
      tech: one_.technicianStaffId ? (await tx.staff.findFirst({ where: { id: one_.technicianStaffId }, select: { fullName: true } }))?.fullName ?? null : one_.technicianName,
      by: one_.raisedById ? (await tx.userLogin.findFirst({ where: { id: one_.raisedById }, select: { displayName: true } }))?.displayName ?? "" : "",
    } : null;
    const target = assignId || closeId ? await tx.maintenanceRequest.findFirst({ where: { id: assignId || closeId, status: { in: ["OPEN", "IN_PROGRESS"] } } }) : null;
    const needStaff = open === "place" || Boolean(editPlace) || Boolean(assignId);
    const staff = needStaff ? await staffOptions(tx) : [];
    const vendors = assignId ? await vendorOptions(tx) : [];
    const campuses = open === "place" ? (await tx.campus.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }] })).map((c) => ({ value: c.id, label: c.name })) : [];
    const raiseAssets = open === "raise" ? (await tx.asset.findMany({ where: { archivedAt: null, status: { not: "DISPOSED" }, roomId: { not: null } }, orderBy: { tag: "asc" }, take: 3000, select: { id: true, tag: true, name: true, roomId: true } })).map((a) => ({ value: a.id, label: `${a.tag} ${a.name}`, roomId: a.roomId })) : [];
    const inCharge = new Map((await tx.staff.findMany({ where: { id: { in: facilities.map((f) => f.inChargeStaffId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
    return { rooms, fac, openCounts, doneMonth, maint, assetsByRoom, openByRoom, labs, checks, experiments, labAssets, classes, detail, target, staff, vendors, campuses, raiseAssets, inCharge };
  }, { timeout: 30_000 });

  const roomName = new Map(d.rooms.map((r) => [r.id, r.name]));
  const typeOf = (r: (typeof d.rooms)[number]) => d.fac.get(r.id)?.type ?? facilityTypeOfRoom(r.kind);
  const openTotal = d.openCounts.reduce((a, g) => a + g._count, 0);
  const inProgress = d.openCounts.filter((g) => g.status === "IN_PROGRESS").reduce((a, g) => a + g._count, 0);
  const urgent = d.openCounts.filter((g) => g.priority === "URGENT" || g.priority === "HIGH").reduce((a, g) => a + g._count, 0);
  const keep = { tab: tab === "maintenance" ? null : tab, status: mf.status || null, priority: mf.priority || null, room: mf.room || null, q: q || null, type: ftype || null, cls: cls || null, ...per.keep };
  const here = (change: Record<string, string | null>) => addQ(qs(`${BASE}/rooms`, keep), { page: null, ...change });
  const places = d.rooms.map((r) => ({ value: r.id, label: r.name }));
  const labOpts = d.labs.map((r) => ({ value: r.id, label: r.name }));
  const facilityRows = d.rooms.filter((r) => (!q || r.name.toLowerCase().includes(q.toLowerCase())) && (!ftype || typeOf(r) === ftype));
  const classLabel = new Map(d.classes.map((c) => [c.value, c.label]));

  const stats: StatItem[] = [
    { label: "Open requests", value: openTotal.toLocaleString("en-IN"), tone: openTotal ? "warn" : undefined, href: here({ tab: null, status: "open" }), active: tab === "maintenance" && mf.status === "open" },
    { label: "In progress", value: inProgress.toLocaleString("en-IN"), href: here({ tab: null, status: "IN_PROGRESS" }), active: tab === "maintenance" && mf.status === "IN_PROGRESS" },
    { label: "High or urgent", value: urgent.toLocaleString("en-IN"), tone: urgent ? "bad" : undefined },
    { label: "Spent this month", value: formatRupees(d.doneMonth._sum.costPaise ?? BigInt(0)), sub: `${plural(d.doneMonth._count, "request")} done` },
  ];

  const actions = can.rooms ? (
    <div className="flex gap-2">
      <ButtonLink href={here({ open: "place" })} variant="secondary" icon={Building2} scroll={false}>Add place</ButtonLink>
      <ButtonLink href={here({ open: "raise" })} variant="primary" icon={Plus} scroll={false}>Raise request</ButtonLink>
    </div>
  ) : (
    <div className="flex gap-2">
      {can.remind && openTotal > 0 && <ActButton action={remindStoreAction} fields={{ what: "maintenance" }} label="Remind store keeper" icon="bell" size="md" />}
      <ButtonLink href={`${BASE}/report-problem`} variant="primary" icon={Megaphone}>Report a problem</ButtonLink>
    </div>
  );

  const editRoom = editPlace ? d.rooms.find((r) => r.id === editPlace) : null;
  const archiveRoom = archivePlace ? d.rooms.find((r) => r.id === archivePlace) : null;

  return (
    <>
      <InvHead pageName="Rooms, Labs & Maintenance" href={`${BASE}/rooms`} mode={p.mode} actions={actions} />
      <Stack>
        <Stats items={stats} />
        <SegLinks label="Rooms views" value={tab} options={[
          { value: "maintenance", label: "Maintenance", href: qs(`${BASE}/rooms`, {}) },
          { value: "facilities", label: "Facility register", href: qs(`${BASE}/rooms`, { tab: "facilities" }) },
          { value: "labs", label: "Labs", href: qs(`${BASE}/rooms`, { tab: "labs" }) },
        ]} />

        {tab === "maintenance" && d.maint && (
          <Card>
            <Toolbar className="md:flex-wrap">
              <div className="flex gap-2 flex-wrap flex-1">
                <UrlSelect param="status" label="Status" options={[{ value: "", label: "Any status" }, { value: "open", label: "Open and in progress" }, ...Object.entries(MAINT_STATUS).map(([value, x]) => ({ value, label: x.label }))]} />
                <UrlSelect param="priority" label="Priority" options={[{ value: "", label: "Any priority" }, ...Object.entries(PRIORITY).map(([value, x]) => ({ value, label: x.label }))]} />
                <UrlSelect param="room" label="Place" options={[{ value: "", label: "All places" }, ...places]} />
                <PeriodFilter {...p.dates} allLabel="Raised: all dates" />
              </div>
              {can.export && <ExportButton href={qs(`${BASE}/rooms/export`, keep)} />}
            </Toolbar>
            <DataList rows={d.maint.rows} rowKey={(r) => r.id} rowHref={(r) => here({ request: r.id })} minWidth={920} caption="Maintenance requests"
              rowClass={(r) => (r.priority === "URGENT" && (r.status === "OPEN" || r.status === "IN_PROGRESS")) && "bg-bad/5"}
              empty={<Empty icon={mf.status || mf.priority || mf.room || per.range ? Search : Wrench} title={mf.status || mf.priority || mf.room || per.range ? "No requests match" : "No maintenance requests"} body={mf.status || mf.priority || mf.room || per.range ? "Try other filters or dates." : "Requests raised by staff from their phones show here."} />}
              columns={[
                { key: "no", label: "Number", nowrap: true, render: (r) => <span className="font-mono text-[13px]">{r.number}</span> },
                { key: "problem", label: "Problem", render: (r) => <span className="block min-w-[200px]"><b className="font-semibold">{r.problem.length > 80 ? `${r.problem.slice(0, 80)}…` : r.problem}</b>{r.assetId && <span className="block text-[12px] text-ink3">{d.maint!.assets.get(r.assetId)?.tag} {d.maint!.assets.get(r.assetId)?.name}</span>}</span> },
                { key: "place", label: "Place", render: (r) => d.maint!.rooms.get(r.roomId) ?? "" },
                { key: "priority", label: "Priority", render: (r) => <Pill tone={PRIORITY[r.priority].tone}>{PRIORITY[r.priority].label}</Pill> },
                { key: "tech", label: "Technician", render: (r) => (r.technicianStaffId ? d.maint!.techs.get(r.technicianStaffId) : r.technicianName) ?? <span className="text-ink3">Not assigned</span> },
                { key: "raised", label: "Raised", nowrap: true, render: (r) => <span className="text-[13px]">{formatDateTime(r.raisedAt, tz)}<span className="block text-[12px] text-ink3">{d.maint!.who.get(r.raisedById ?? "") ?? ""}</span></span> },
                { key: "done", label: "Done", nowrap: true, render: (r) => day(r.doneOn) },
                { key: "cost", label: "Cost", align: "right", nowrap: true, render: (r) => (r.costPaise !== null ? formatRupees(r.costPaise) : "") },
                { key: "status", label: "Status", render: (r) => <Pill tone={MAINT_STATUS[r.status].tone}>{MAINT_STATUS[r.status].label}</Pill> },
              ]}
              phone={(r) => ({ title: r.problem, sub: `${r.number} · ${d.maint!.rooms.get(r.roomId) ?? ""} · ${formatDateTime(r.raisedAt, tz)}`, icon: Wrench, iconTone: r.priority === "URGENT" ? "bad" : r.priority === "HIGH" ? "warn" : "brand", pills: <><Pill tone={MAINT_STATUS[r.status].tone}>{MAINT_STATUS[r.status].label}</Pill>{r.priority !== "NORMAL" && <Pill tone={PRIORITY[r.priority].tone}>{PRIORITY[r.priority].label}</Pill>}</> })}
            />
            {d.maint.total > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={d.maint.total} prevHref={here({ page: page > 2 ? String(page - 1) : null })} nextHref={here({ page: String(page + 1) })} />}
          </Card>
        )}

        {tab === "facilities" && (
          <Card>
            <Toolbar>
              <UrlSearch placeholder="Search places" label="Search places" className="flex-1" id="places-search" />
              <UrlSelect param="type" label="Type" options={[{ value: "", label: "All types" }, ...FACILITY_TYPES.map((t) => ({ value: t, label: t }))]} />
            </Toolbar>
            <DataList rows={facilityRows} rowKey={(r) => r.id} minWidth={820} caption="Facility register"
              empty={<Empty icon={q || ftype ? Search : Building2} title={q || ftype ? "No places match" : "No places yet"} body={can.rooms ? "Add rooms, labs, halls and grounds. The Time Table uses the same rooms." : undefined} />}
              columns={[
                { key: "name", label: "Place", render: (r) => <b className="font-semibold">{r.name}</b> },
                { key: "type", label: "Type", render: (r) => typeOf(r) },
                { key: "where", label: "Building, floor", render: (r) => [d.fac.get(r.id)?.building, d.fac.get(r.id)?.floor].filter(Boolean).join(", ") || <span className="text-ink3">Not given</span> },
                { key: "cap", label: "Capacity", align: "right", render: (r) => r.capacity ?? "" },
                { key: "incharge", label: "In charge", render: (r) => d.inCharge.get(d.fac.get(r.id)?.inChargeStaffId ?? "") ?? "" },
                { key: "assets", label: "Assets", align: "right", render: (r) => (d.assetsByRoom.get(r.id) ? <Link className="font-semibold text-brand hover:underline" href={qs(`${BASE}/assets`, { room: r.id })}>{d.assetsByRoom.get(r.id)}</Link> : <span className="text-ink3">0</span>) },
                { key: "open", label: "Open requests", align: "right", render: (r) => (d.openByRoom.get(r.id) ? <Link className="font-semibold text-warn hover:underline" href={qs(`${BASE}/rooms`, { room: r.id, status: "open" })}>{d.openByRoom.get(r.id)}</Link> : "") },
                ...(can.rooms ? [{ key: "act", label: "", render: (r: (typeof d.rooms)[number]) => <span className="flex gap-3 text-[13px] font-semibold"><Link className="text-brand hover:underline" href={here({ place: r.id })} scroll={false}>Change</Link><Link className="text-ink3 hover:underline" href={here({ archive: r.id })} scroll={false}>Archive</Link></span> }] : []),
              ]}
              phone={(r) => ({ title: r.name, sub: `${typeOf(r)}${r.capacity ? ` · ${r.capacity} seats` : ""}${d.assetsByRoom.get(r.id) ? ` · ${plural(d.assetsByRoom.get(r.id)!, "asset")}` : ""}`, icon: Building2, iconTone: "brand", href: can.rooms ? here({ place: r.id }) : undefined })}
            />
          </Card>
        )}

        {tab === "labs" && (
          <>
            {d.labs.length === 0 && <Empty icon={FlaskConical} title="No labs in the facility register" body={can.rooms ? "Add a place of type Lab to record safety checks." : undefined} />}
            {d.labs.length > 0 && (
              <Card>
                <CardHeader title="Lab safety checks" description="A checklist with date and result." icon={ShieldCheck} divided
                  action={<div className="flex gap-2 items-center"><PeriodFilter {...p.dates} allLabel="Checks: all dates" />{can.rooms && <ButtonLink href={here({ open: "check" })} size="sm" variant="primary" icon={ClipboardCheck} scroll={false}>Record check</ButtonLink>}</div>} />
                <div className="px-5 pt-4 flex flex-wrap gap-2">
                  {d.labs.map((l) => {
                    const last = d.checks.find((c) => c.roomId === l.id);
                    return <span key={l.id} className="rounded-xl border border-line px-3 py-2 text-[13px]"><b className="font-semibold">{l.name}</b> <span className={last ? (last.result === "PASS" ? "text-ok" : "text-bad") : "text-ink3"}>{last ? `${last.result === "PASS" ? "Passed" : "Issues"} ${day(last.date)}` : "No check in these dates"}</span></span>;
                  })}
                </div>
                <SimpleTable caption="Safety checks" rows={d.checks} rowKey={(c) => c.id} minWidth={560} cols={[
                  { label: "Date", nowrap: true, render: (c) => day(c.date) },
                  { label: "Lab", render: (c) => roomName.get(c.roomId) ?? "" },
                  { label: "Result", render: (c) => <Pill tone={c.result === "PASS" ? "ok" : "bad"}>{c.result === "PASS" ? "All fine" : "Issues"}</Pill> },
                  { label: "Not fine", render: (c) => ((c.checklist as { item: string; ok: boolean }[]) ?? []).filter((x) => !x.ok).map((x) => x.item).join("; ") || "" },
                  { label: "Note", render: (c) => c.note ?? "" },
                ]} />
                {d.checks.length === 0 && <p className="px-5 py-4 text-[13.5px] text-ink3">No checks in these dates.</p>}
              </Card>
            )}
            <Card>
              <CardHeader title="Experiments list" description="Experiments per class, with the lab and materials." icon={FlaskConical} divided
                action={can.rooms ? <ButtonLink href={here({ open: "experiment" })} size="sm" variant="secondary" icon={Plus} scroll={false}>Add experiment</ButtonLink> : undefined} />
              {d.classes.length > 0 && (
                <div className="px-5 pt-4">
                  <Chips label="Class" value={cls} options={[{ value: "", label: "All classes", href: here({ cls: null }) }, ...d.classes.map((c) => ({ value: c.value, label: c.label, href: here({ cls: c.value }) }))]} />
                </div>
              )}
              {d.experiments.length === 0 ? <Empty icon={FlaskConical} title="No experiments listed" body={can.rooms ? "Add the experiments each class does in the lab." : undefined} /> : (
                <SimpleTable caption="Experiments" rows={d.experiments} rowKey={(e) => e.id} minWidth={640} cols={[
                  { label: "Class", nowrap: true, render: (e) => classLabel.get(e.classId) ?? "" },
                  { label: "Subject", render: (e) => e.subject },
                  { label: "Experiment", render: (e) => <b className="font-semibold">{e.title}</b> },
                  { label: "Lab", render: (e) => (e.roomId ? roomName.get(e.roomId) ?? "" : "") },
                  { label: "Materials", render: (e) => <span className="text-[13px] text-ink2">{e.materials ?? ""}</span> },
                  ...(can.rooms ? [{ label: "", render: (e: (typeof d.experiments)[number]) => <span className="flex gap-2 items-center"><Link className="text-[13px] font-semibold text-brand hover:underline" href={here({ open: "experiment", exp: e.id })} scroll={false} aria-label={`Change ${e.title}`}><Pencil size={14} aria-hidden="true" /></Link><ActButton action={archiveExperimentAction} fields={{ experimentId: e.id }} label="Remove" icon="archive" variant="ghost" /></span> }] : []),
                ]} />
              )}
            </Card>
            <Card>
              <CardHeader title="Lab equipment" description="Assets in the labs. Log repairs and services from the asset." icon={Hammer} divided />
              {d.labAssets.length === 0 ? <p className="px-5 py-4 text-[13.5px] text-ink3">No lab equipment in the asset register.</p> : (
                <SimpleTable caption="Lab equipment" rows={d.labAssets} rowKey={(a) => a.id} minWidth={560} cols={[
                  { label: "Tag", render: (a) => <Link className="font-mono font-semibold hover:underline" href={`${BASE}/assets/${a.id}`}>{a.tag}</Link> },
                  { label: "Equipment", render: (a) => a.name },
                  { label: "Lab", render: (a) => (a.roomId ? roomName.get(a.roomId) ?? "" : "") },
                  { label: "Service", render: (a) => (a.amcEnd ? `AMC to ${day(a.amcEnd)}` : a.warrantyEnd ? `Warranty to ${day(a.warrantyEnd)}` : "") },
                  { label: "Status", render: (a) => (a.repairs.length ? <Pill tone="warn">Repair open</Pill> : <Pill tone={ASSET_STATUS[a.status].tone}>{ASSET_STATUS[a.status].label}</Pill>) },
                ]} />
              )}
            </Card>
          </>
        )}
      </Stack>

      {d.detail && (
        <UrlSheet title={`${d.detail.r.number} · ${roomName.get(d.detail.r.roomId) ?? ""}`} sub={`${MAINT_STATUS[d.detail.r.status].label} · ${PRIORITY[d.detail.r.priority].label} priority`} closeHref={here({ request: null })}
          footer={can.rooms && (d.detail.r.status === "OPEN" || d.detail.r.status === "IN_PROGRESS") ? (
            <div className="flex gap-2 w-full justify-end">
              <ButtonLink href={here({ request: null, assign: d.detail.r.id })} variant="secondary" scroll={false}>{d.detail.tech ? "Change technician" : "Assign technician"}</ButtonLink>
              <ButtonLink href={here({ request: null, close: d.detail.r.id })} variant="primary" scroll={false}>Close</ButtonLink>
            </div>
          ) : undefined}>
          <div className="flex flex-col gap-4">
            <p className="text-[15px] whitespace-pre-line">{d.detail.r.problem}</p>
            {d.detail.r.photoFileId && (
              <a href={fileLink(d.detail.r.photoFileId, current.ctx.schoolId)} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fileLink(d.detail.r.photoFileId, current.ctx.schoolId)} alt={`Photo of the problem: ${d.detail.r.problem.slice(0, 60)}`} className="max-h-72 rounded-xl border border-line object-contain" />
              </a>
            )}
            <DL cols={2} rows={[
              ["Raised", `${formatDateTime(d.detail.r.raisedAt, tz)}${d.detail.by ? ` by ${d.detail.by}` : ""}`],
              ["Asset", d.detail.asset ? <Link key="a" className="text-brand hover:underline" href={`${BASE}/assets/${d.detail.asset.id}`}>{d.detail.asset.tag} {d.detail.asset.name}</Link> : "None"],
              ["Technician", d.detail.tech ?? "Not assigned"], ["Done on", day(d.detail.r.doneOn) || "Not yet"],
              ["Cost", d.detail.r.costPaise !== null ? formatRupees(d.detail.r.costPaise) : ""], ["In Finance", d.detail.r.expenseId ? "Yes, as an expense" : "No"],
              ...(d.detail.r.closingNote ? [["Note", d.detail.r.closingNote] as [string, React.ReactNode]] : []),
            ]} />
          </div>
        </UrlSheet>
      )}
      {open === "raise" && <RaiseSheet closeHref={here({ open: null })} places={places} assets={d.raiseAssets} startPlace={mf.room} />}
      {open === "place" && <FacilitySheet closeHref={here({ open: null })} start={null} types={FACILITY_TYPES} campuses={d.campuses} staff={d.staff} />}
      {editRoom && (
        <FacilitySheet closeHref={here({ place: null })} types={FACILITY_TYPES} campuses={[]} staff={d.staff}
          start={{ roomId: editRoom.id, name: editRoom.name, type: typeOf(editRoom), capacity: editRoom.capacity !== null ? String(editRoom.capacity) : "", building: d.fac.get(editRoom.id)?.building ?? "", floor: d.fac.get(editRoom.id)?.floor ?? "", inChargeStaffId: d.fac.get(editRoom.id)?.inChargeStaffId ?? "", note: d.fac.get(editRoom.id)?.note ?? "" }} />
      )}
      {archiveRoom && <ArchiveFacilitySheet closeHref={here({ archive: null })} roomId={archiveRoom.id} name={archiveRoom.name} />}
      {assignId && d.target && (
        <AssignTechSheet closeHref={here({ assign: null })} requestId={d.target.id} words={`${d.target.number}: ${d.target.problem.slice(0, 80)}`} staff={d.staff} vendors={d.vendors}
          start={{ staffId: d.target.technicianStaffId ?? "", name: d.target.technicianName ?? "", vendorId: d.target.vendorId ?? "", priority: d.target.priority }} />
      )}
      {closeId && d.target && <CloseRequestSheet closeHref={here({ close: null })} requestId={d.target.id} words={`${d.target.number}: ${d.target.problem.slice(0, 80)}`} today={todayStr} />}
      {open === "experiment" && (() => {
        const e = d.experiments.find((x) => x.id === one(sp.exp));
        return <ExperimentSheet closeHref={here({ open: null, exp: null })} classes={d.classes} labs={labOpts} start={e ? { id: e.id, classId: e.classId, subject: e.subject, title: e.title, labId: e.roomId ?? "", materials: e.materials ?? "" } : null} />;
      })()}
      {open === "check" && <SafetyCheckSheet closeHref={here({ open: null })} labs={labOpts} lab={labOpts.length === 1 ? labOpts[0].value : ""} today={todayStr} checklist={LAB_CHECKLIST} />}
    </>
  );
}
