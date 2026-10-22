import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { DoorClosed, SearchX } from "lucide-react";
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
import { shortDate, shownCount } from "@/lib/students/show";
import { BASE, studentPage } from "../../_lib/page";
import { visibleStudentIds } from "@/lib/students/access";
import { StudentsHead } from "../../_lib/head";
import { CERT_LABEL, LEAVING_TYPE_LABEL, studentFacts, tcFor } from "../load";
import { leavingTabs } from "../sub-tabs";
import { studentIdsForFilter } from "@/lib/students/find";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Left" };

const FILTERS = ["type", "status"] as const;
const STEP = 25;

/** Students who have left (and, with the filter, leaving requests that were cancelled). The records stay. */
export default async function LeftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, tz } = await studentPage();
  const raw = await searchParams;
  const params = readListParams(raw, FILTERS);
  const take = shownCount(raw, STEP);
  const range = periodFromSearch(raw, { timeZone: tz });
  const path = `${BASE}/leaving/left`;
  const data = await withSchool(current.ctx, async (tx) => {
    const f = params.filters;
    const nameIds = params.q ? await studentIdsForFilter(tx, params.q) : null;
    // One campus: that campus's students only.
    const mine = await visibleStudentIds(tx, current);
    const where: Prisma.LeavingRequestWhereInput = {
      status: f.status === "CANCELLED" ? "CANCELLED" : "LEFT",
      ...(mine ? { AND: [{ studentId: { in: mine } }] } : {}),
      ...(f.type ? { type: f.type as "TRANSFER" } : {}),
      ...(range ? { lastDate: dateWhere(range) } : {}),
      ...(nameIds ? { studentId: { in: nameIds } } : {}),
    };
    const orderBy = orderByFor(params, { lastDate: { lastDate: params.dir } }, [{ lastDate: "desc" }]);
    const [total, rows] = await Promise.all([tx.leavingRequest.count({ where }), tx.leavingRequest.findMany({ where, orderBy: orderBy as object, take })]);
    return { total, rows, facts: await studentFacts(tx, rows.map((r) => r.studentId)), tcs: await tcFor(tx, rows.map((r) => r.id)) };
  });
  type Row = (typeof data.rows)[number];
  const cancelled = params.filters.status === "CANCELLED";
  const tcLabel = (r: Row) => { const tc = data.tcs.get(r.id); return tc ? `${CERT_LABEL[tc.status]}${tc.number ? ` · ${tc.number}` : ""}` : "Not issued"; };
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
    { key: "type", label: "Type", render: (r) => <Pill>{LEAVING_TYPE_LABEL[r.type]}</Pill> },
    { key: "reason", label: cancelled ? "Why cancelled" : "Reason", className: "max-w-[260px]", render: (r) => <span className="line-clamp-2 text-[13.5px]">{(cancelled ? r.cancelReason : r.reason) ?? "–"}</span> },
    { key: "lastDate", label: "Last date", nowrap: true, sortHref: listHref(path, params, { sort: "lastDate", dir: params.sort === "lastDate" && params.dir === "desc" ? "asc" : "desc" }), sorted: params.sort === "lastDate" ? params.dir : null, render: (r) => <span className="tnum text-[13.5px]">{shortDate(r.lastDate, tz)}</span> },
    { key: "destination", label: "Going to", render: (r) => <span className="text-[13.5px]">{r.destinationSchool ?? "–"}</span> },
    { key: "tc", label: "TC", render: (r) => <Pill tone={data.tcs.get(r.id)?.status === "ISSUED" ? "ok" : "neutral"}>{tcLabel(r)}</Pill> },
  ];
  const filtered = Boolean(params.q || params.filters.type || range);

  return (
    <>
      <StudentsHead page="Leaving & Alumni" href={path} sub="Students who transferred, withdrew or graduated. Their records are kept."
        subTabs={await leavingTabs()} subLabel="Leaving & Alumni" />
      <Card className="overflow-hidden">
        <Toolbar>
          <ListToolbar placeholder="Student name or admission number" showArchived={false} period={{ timeZone: tz, allLabel: "Last date: any" }}
            filters={[
              { key: "status", label: "Show", allLabel: "Left", options: [{ value: "CANCELLED", label: "Cancelled requests" }] },
              { key: "type", label: "Type", allLabel: "Every type", options: [{ value: "TRANSFER", label: "Transfer" }, { value: "WITHDRAWAL", label: "Withdrawal" }, { value: "GRADUATION", label: "Graduation" }] },
            ]} />
        </Toolbar>
        <DataList caption={cancelled ? "Cancelled leaving requests" : "Students who left"} rows={data.rows} columns={columns} rowKey={(r) => r.id} minWidth={880}
          rowHref={(r) => `${BASE}/leaving/${r.id}`} rowLabel={(r) => `Open the leaving of ${data.facts.get(r.studentId)?.name ?? ""}`}
          mobile={(r) => {
            const s = data.facts.get(r.studentId);
            return { title: s?.name ?? "", sub: `${s?.short ? `${s.short} · ` : ""}${LEAVING_TYPE_LABEL[r.type]} · ${shortDate(r.lastDate, tz)}`, avatar: s?.name ?? "?",
              pills: [<Pill key="tc" tone={data.tcs.get(r.id)?.status === "ISSUED" ? "ok" : "neutral"} className={cardPill}><Words k="TC:" /> {tcLabel(r).toLowerCase()}</Pill>] };
          }}
          footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={data.rows.length < data.total ? listHref(path, params, { n: take + STEP }) : null} />}
          empty={filtered
            ? <Empty icon={SearchX} title="Nothing matches these filters" action={<ButtonLink href={path}><Words k="Clear filters" /></ButtonLink>} />
            : <Empty icon={DoorClosed} title={cancelled ? "No cancelled requests" : "Nobody has left yet"} body="Students who transferred, withdrew or graduated show here. Their records are kept." />} />
      </Card>
    </>
  );
}
