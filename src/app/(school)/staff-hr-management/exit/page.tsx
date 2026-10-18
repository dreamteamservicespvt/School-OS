import type { Metadata } from "next";
import { ArrowRightLeft, ListChecks, LogOut, UserMinus, Wallet } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { hrPage, BASE } from "@/lib/staff/page";
import { staffIdOnCampus } from "@/lib/staff/list";
import { exitTypeLabel } from "@/lib/staff/exit";
import { StaffHead } from "../_components/head";
import { Avatar } from "../_components/bits";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Empty, Stats, Toolbar } from "@/components/ui/blocks";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EXIT_STATUS } from "./exit-status";

export const metadata: Metadata = { title: "Staff Exit" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUSES = Object.keys(EXIT_STATUS);

export default async function StaffExitPage({ searchParams }: Search) {
  const { current, viewer, tz, today } = await hrPage();
  const sp = await searchParams;
  const range = periodFromSearch(sp, { timeZone: tz });
  const q = one(sp.q).trim().slice(0, 80);
  const status = STATUSES.includes(one(sp.status)) ? one(sp.status) : "";
  const type = ["RESIGNATION", "RETIREMENT", "TERMINATION"].includes(one(sp.type)) ? one(sp.type) : "";

  const data = await withSchool(current.ctx, async (tx) => {
    const named = q ? await tx.staff.findMany({ where: { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { staffCode: { contains: q, mode: "insensitive" } }] }, select: { id: true }, take: 500 }) : null;
    // One campus: the exits of their campus's staff only (the list, the open ones and the count).
    const mine = staffIdOnCampus(viewer);
    const where = {
      ...(range ? { lastWorkingDay: dateWhere(range) } : {}),
      ...(status ? { status: status as "IN_PROGRESS" } : {}),
      ...(type ? { type: type as "RESIGNATION" } : {}),
      AND: [mine, named ? { staffId: { in: named.map((n) => n.id) } } : {}],
    };
    const yearStart = new Date(Date.UTC(today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1, 3, 1));
    const [exits, openAll, closedThisYear] = await Promise.all([
      tx.exitCase.findMany({ where, orderBy: [{ status: "asc" }, { lastWorkingDay: "desc" }], take: 200, include: { handover: { select: { doneAt: true } }, clearance: { select: { status: true } } } }),
      tx.exitCase.findMany({ where: { status: { in: ["WAITING_APPROVAL", "IN_PROGRESS"] }, ...mine }, select: { lastWorkingDay: true, handover: { select: { doneAt: true } }, clearance: { select: { status: true } } } }),
      tx.exitCase.count({ where: { status: "COMPLETED", lastWorkingDay: { gte: yearStart }, ...mine } }),
    ]);
    const staff = await tx.staff.findMany({ where: { id: { in: exits.map((e) => e.staffId) } }, select: { id: true, fullName: true, designation: true, photoFileId: true } });
    return { exits, staff: new Map(staff.map((s) => [s.id, s])), openAll, closedThisYear };
  });
  type Row = (typeof data.exits)[number];

  const handoverLeft = data.openAll.reduce((n, e) => n + e.handover.filter((h) => !h.doneAt).length, 0);
  const clearanceLeft = data.openAll.reduce((n, e) => n + e.clearance.filter((c) => c.status === "PENDING").length, 0);
  const lastDays = [...data.openAll].sort((a, b) => a.lastWorkingDay.getTime() - b.lastWorkingDay.getTime()).slice(0, 2).map((e) => formatDate(e.lastWorkingDay, tz));
  const anyFilter = Boolean(range || q || status || type);

  const progress = (e: Row, cls = "") => {
    if (e.status !== "IN_PROGRESS") return <Pill tone={EXIT_STATUS[e.status].tone} className={cls}>{EXIT_STATUS[e.status].label}</Pill>;
    const done = e.handover.filter((h) => h.doneAt).length;
    return <Pill tone={done === e.handover.length ? "ok" : "warn"} className={cls}>{done} of {e.handover.length} handed</Pill>;
  };

  const columns: DataColumn<Row>[] = [
    { key: "who", label: "Staff member", render: (e) => {
      const s = data.staff.get(e.staffId);
      return (
        <div className="flex items-center gap-3">
          <Avatar name={s?.fullName ?? "Staff"} photoFileId={s?.photoFileId ?? null} size="sm" />
          <div className="min-w-0"><p className="font-semibold leading-tight">{s?.fullName ?? "Staff"}</p><p className="text-[12.5px] text-ink3">{s?.designation}</p></div>
        </div>
      );
    } },
    { key: "type", label: "Type", render: (e) => exitTypeLabel(e.type) },
    { key: "last", label: "Last working day", nowrap: true, render: (e) => <span className="tnum">{formatDate(e.lastWorkingDay, tz)}</span> },
    { key: "clearance", label: "Clearance", render: (e) => e.status === "IN_PROGRESS" ? <span className="tnum">{e.clearance.filter((c) => c.status !== "PENDING").length} of {e.clearance.length} cleared</span> : <span className="text-ink3">–</span> },
    { key: "state", label: "Status", render: (e) => progress(e) },
  ];

  return (
    <>
      <StaffHead page="Staff Exit" href={`${BASE}/exit`} sub="Resignations, retirements and terminations: handover, clearance and final settlement"
        actions={viewer.change === "all" ? <ButtonLink href={`${BASE}/exit/new`} variant="primary" icon={LogOut}>Record exit</ButtonLink> : undefined} />

      <Stats label="Staff exits" className="mb-5" items={[
        { label: "Leaving now", icon: UserMinus, value: data.openAll.length, sub: lastDays.length ? `last day${lastDays.length > 1 ? "s" : ""} ${lastDays.join(" and ")}` : "Nobody is leaving" },
        { label: "Handover left", icon: ArrowRightLeft, value: handoverLeft, sub: "items to give to someone", tone: handoverLeft ? "warn" : undefined },
        { label: "Clearance left", icon: ListChecks, value: clearanceLeft, sub: "checks across modules", tone: clearanceLeft ? "warn" : undefined },
        { label: "Closed this year", icon: Wallet, value: data.closedThisYear, sub: "exits completed since April" },
      ]} />

      <Card className="overflow-hidden">
        <CardHeader title="Staff leaving" divided={false} />
        <Toolbar>
          <ListToolbar placeholder="Staff name or staff ID" showArchived={false} period={{ timeZone: tz, allLabel: "Last day: any" }}
            filters={[{ key: "status", label: "Status", allLabel: "Every status", options: STATUSES.map((s) => ({ value: s, label: EXIT_STATUS[s].label })) }]}
            more={[{ key: "type", label: "Type", options: [{ value: "RESIGNATION", label: "Resignation" }, { value: "RETIREMENT", label: "Retirement" }, { value: "TERMINATION", label: "Termination" }] }]} />
        </Toolbar>
        <DataList caption="Staff exits" rows={data.exits} columns={columns} rowKey={(e) => e.id} minWidth={760}
          rowHref={(e) => `${BASE}/exit/${e.id}`} rowLabel={(e) => `Open the exit of ${data.staff.get(e.staffId)?.fullName ?? "this staff member"}`}
          mobile={(e) => {
            const s = data.staff.get(e.staffId);
            return { title: s?.fullName ?? "Staff", avatar: s?.fullName ?? "Staff", sub: `${exitTypeLabel(e.type)} · last day ${formatDate(e.lastWorkingDay, tz)}`, pills: [<span key="p" className="contents">{progress(e, cardPill)}</span>] };
          }}
          empty={anyFilter
            ? <Empty title="No exits match" body="Try a different date, status or name." action={<ButtonLink href={`${BASE}/exit`}>Clear filters</ButtonLink>} />
            : <Empty icon={LogOut} title="No staff exits" body="Record a resignation, retirement or termination here. The classes are handed over, checks cleared, and the login is switched off on the last working day." />} />
      </Card>
    </>
  );
}
