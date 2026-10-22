import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { DoorOpen, LogOut, SearchX } from "lucide-react";
import { withSchool } from "@/lib/db";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { readListParams, orderByFor, listHref } from "@/lib/list";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Empty, ListFooter, Toolbar } from "@/components/ui/blocks";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { isCleared } from "@/lib/students/leaving";
import { shortDate, shownCount } from "@/lib/students/show";
import { BASE, studentPage } from "../_lib/page";
import { visibleStudentIds } from "@/lib/students/access";
import { StudentsHead } from "../_lib/head";
import { CERT_LABEL, CHECK_LABEL, LEAVING_TYPE_LABEL, studentFacts, tcFor } from "./load";
import { leavingTabs } from "./sub-tabs";
import { studentIdsForFilter } from "@/lib/students/find";

export const metadata: Metadata = { title: "Leaving & Alumni" };

const FILTERS = ["type", "clearance"] as const;
const STEP = 25;
const CHECK_PILL = { CLEAR: "ok", PENDING: "bad", WAIVER_ASKED: "warn", WAIVED: "neutral" } as const;

/** Students in the leaving process: reason, last date, clearance per check, TC status. */
export default async function LeavingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, can, tz } = await studentPage();
  const raw = await searchParams;
  const params = readListParams(raw, FILTERS);
  const take = shownCount(raw, STEP);
  const range = periodFromSearch(raw, { timeZone: tz });
  const path = `${BASE}/leaving`;
  const data = await withSchool(current.ctx, async (tx) => {
    const f = params.filters;
    // One campus: that campus's students only.
    const mine = await visibleStudentIds(tx, current);
    const where: Prisma.LeavingRequestWhereInput = {
      status: "IN_PROGRESS",
      ...(mine ? { AND: [{ studentId: { in: mine } }] } : {}),
      ...(range ? { lastDate: dateWhere(range) } : {}),
      ...(f.type ? { type: f.type as "TRANSFER" } : {}),
      ...(f.clearance === "pending" ? { checks: { some: { status: { in: ["PENDING", "WAIVER_ASKED"] } } } } : f.clearance === "clear" ? { checks: { none: { status: { in: ["PENDING", "WAIVER_ASKED"] } } } } : {}),
      ...(params.q ? { OR: [{ reason: { contains: params.q, mode: "insensitive" as const } }, { studentId: { in: await studentIdsForFilter(tx, params.q) } }] } : {}),
    };
    const orderBy = orderByFor(params, { lastDate: { lastDate: params.dir } }, [{ lastDate: "asc" }]);
    const [total, rows] = await Promise.all([
      tx.leavingRequest.count({ where }),
      tx.leavingRequest.findMany({ where, orderBy: orderBy as object, take, include: { checks: { orderBy: { name: "asc" } } } }),
    ]);
    const facts = await studentFacts(tx, rows.map((r) => r.studentId));
    const tcs = await tcFor(tx, rows.map((r) => r.id));
    return { total, rows, facts, tcs };
  });
  type Row = (typeof data.rows)[number];
  const tcState = (r: Row) => {
    const tc = data.tcs.get(r.id);
    if (tc) return { label: `${CERT_LABEL[tc.status]}${tc.number ? ` · ${tc.number}` : ""}`, tone: tc.status === "ISSUED" ? "ok" as const : tc.status === "REQUESTED" ? "info" as const : "neutral" as const };
    if (r.checks.some((c) => c.status === "WAIVER_ASKED")) return { label: "Waiver asked", tone: "warn" as const };
    if (!isCleared(r.checks)) return { label: "Blocked", tone: "bad" as const };
    return { label: "Ready to issue", tone: "ok" as const };
  };
  const checkPill = (c: Row["checks"][number], cls?: string) => (
    <Pill key={c.id} tone={CHECK_PILL[c.status as keyof typeof CHECK_PILL] ?? "neutral"} className={cls}>{c.status === "PENDING" && c.detail ? `${c.name}: ${c.detail}` : c.status === "CLEAR" ? c.name : `${c.name}: ${CHECK_LABEL[c.status].toLowerCase()}`}</Pill>
  );

  const columns: DataColumn<Row>[] = [
    { key: "student", label: "Student", render: (r) => {
      const s = data.facts.get(r.studentId);
      return (
        <div className="flex items-center gap-3">
          <Avatar name={s?.name ?? "?"} size={34} />
          <div className="min-w-0"><p className="font-semibold leading-tight whitespace-nowrap">{s?.name}</p><p className="text-[12px] text-ink3 whitespace-nowrap">{s?.short ? `${s.short} · ` : ""}<span className="font-mono">{s?.admissionNo}</span></p></div>
        </div>
      );
    } },
    { key: "reason", label: "Reason", className: "max-w-[240px]", render: (r) => <div><p className="text-[13.5px]">{LEAVING_TYPE_LABEL[r.type]}</p><p className="text-[12px] text-ink3 line-clamp-1">{r.reason}</p></div> },
    { key: "lastDate", label: "Last date", nowrap: true, sortHref: listHref(path, params, { sort: "lastDate", dir: params.sort === "lastDate" && params.dir === "asc" ? "desc" : "asc" }), sorted: params.sort === "lastDate" ? params.dir : null, render: (r) => <span className="tnum text-[13.5px]">{shortDate(r.lastDate, tz)}</span> },
    { key: "clearance", label: "Clearance", render: (r) => r.checks.length ? <div className="flex flex-wrap gap-1.5">{r.checks.map((c) => checkPill(c))}</div> : <span className="text-[12.5px] text-ink3">No checks yet</span> },
    { key: "tc", label: "TC", render: (r) => { const t = tcState(r); return <Pill tone={t.tone}>{t.label}</Pill>; } },
  ];
  const filtered = Boolean(params.q || Object.keys(params.filters).length || range);

  return (
    <>
      <StudentsHead page="Leaving & Alumni" href={path} sub="Transfer or withdrawal with fee and library clearance, and records of past students"
        actions={can.manage ? <ButtonLink href={`${path}/new`} variant="primary" icon={LogOut}>Start leaving</ButtonLink> : undefined}
        subTabs={await leavingTabs()} subLabel="Leaving & Alumni" />
      <Card className="overflow-hidden">
        <Toolbar>
          <ListToolbar placeholder="Student name, admission number or reason" showArchived={false} period={{ timeZone: tz, allLabel: "Last date: any" }}
            filters={[{ key: "clearance", label: "Clearance", allLabel: "Any clearance", options: [{ value: "pending", label: "Clearance pending" }, { value: "clear", label: "Cleared" }] }]}
            more={[{ key: "type", label: "Type", allLabel: "Every type", options: [{ value: "TRANSFER", label: "Transfer" }, { value: "WITHDRAWAL", label: "Withdrawal" }, { value: "GRADUATION", label: "Graduation" }] }]} />
        </Toolbar>
        <DataList caption="Students leaving" rows={data.rows} columns={columns} rowKey={(r) => r.id} minWidth={900}
          rowHref={(r) => `${path}/${r.id}`} rowLabel={(r) => `Open the leaving of ${data.facts.get(r.studentId)?.name ?? ""}`}
          mobile={(r) => {
            const s = data.facts.get(r.studentId);
            const t = tcState(r);
            return { title: s?.name ?? "", sub: `${s?.short ? `${s.short} · ` : ""}${LEAVING_TYPE_LABEL[r.type]} · last day ${shortDate(r.lastDate, tz)}`, avatar: s?.name ?? "?",
              pills: [...r.checks.filter((c) => c.status !== "CLEAR").map((c) => checkPill(c, cardPill)), <Pill key="tc" tone={t.tone} className={cardPill}>TC: {t.label.toLowerCase()}</Pill>] };
          }}
          footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={data.rows.length < data.total ? listHref(path, params, { n: take + STEP }) : null} />}
          empty={filtered
            ? <Empty icon={SearchX} title="Nothing matches these filters" action={<ButtonLink href={path}>Clear filters</ButtonLink>} />
            : <Empty icon={DoorOpen} title="Nobody is leaving right now" body="Students in the leaving process show here with their clearance and TC."
              action={can.manage ? <ButtonLink href={`${path}/new`} variant="primary" icon={LogOut}>Start leaving</ButtonLink> : undefined} />} />
        {data.rows.length > 0 && data.rows.every((r) => r.checks.length === 0) && (
          <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line/70">No clearance checks run yet: fee dues and library books are checked here once Fee Management and Library Management are in use.</p>
        )}
      </Card>
    </>
  );
}
