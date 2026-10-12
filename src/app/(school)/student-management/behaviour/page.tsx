import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Award, BarChart3, Plus, SearchX, ShieldCheck } from "lucide-react";
import { withSchool } from "@/lib/db";
import { readListParams, orderByFor, listHref } from "@/lib/list";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { Col, Empty, FilterMenu, HBars, ListFooter, Split, Toolbar } from "@/components/ui/blocks";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { UrlSearch, UrlSelect, UrlToggle } from "@/components/ui/list-controls";
import { cx } from "@/components/ui/cx";
import { studentScope } from "@/lib/students/access";
import { BEHAVIOUR_KINDS, BEHAVIOUR_KIND_LABEL, isPositive, type BehaviourKind } from "@/lib/students/labels";
import { classShort, shortDate, shownCount } from "@/lib/students/show";
import { BASE, studentPage } from "../_lib/page";
import { StudentsHead } from "../_lib/head";
import { sectionNames, sectionOptions } from "../_lib/queries";
import { behaviourTabs } from "./sub-tabs";

export const metadata: Metadata = { title: "Behaviour & Counselling" };

const FILTERS = ["kind", "status", "section"] as const;
const STEP = 25;
const kindTone = (k: string) => isPositive(k) ? "ok" : k === "incident" ? "warn" : "bad";

export default async function BehaviourPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, year, can, settings, tz } = await studentPage();
  if (!can.seeBehaviour) redirect(`${BASE}/behaviour/counselling`);
  const raw = await searchParams;
  const params = readListParams(raw, FILTERS);
  const take = shownCount(raw, STEP);
  const path = `${BASE}/behaviour`;

  const data = await withSchool(current.ctx, async (tx) => {
    const scope = await studentScope(tx, current, year?.id);
    const f = params.filters;
    const studentWhere: Prisma.StudentWhereInput = { AND: [scope, ...(f.section && year ? [{ enrolments: { some: { sectionId: f.section, academicYearId: year.id, archivedAt: null } } }] : []), ...(params.q ? [{ fullName: { contains: params.q, mode: "insensitive" as const } }] : [])] };
    const base: Prisma.BehaviourIncidentWhereInput = { archivedAt: params.archived ? { not: null } : null, ...(year ? { academicYearId: year.id } : {}) };
    const mine = can.reach === "all" ? null : (await tx.student.findMany({ where: scope, select: { id: true } })).map((x) => x.id);
    if (mine) base.students = { some: { studentId: { in: mine } } };
    const where: Prisma.BehaviourIncidentWhereInput = { ...base, ...(f.kind ? { kind: f.kind } : {}), ...(f.status ? { status: f.status } : {}) };
    // Incident rows link to students by id only: narrow to the students in the filters.
    if (f.section || params.q) {
      const ids = (await tx.student.findMany({ where: studentWhere, select: { id: true } })).map((x) => x.id);
      const byStudent: Prisma.BehaviourIncidentWhereInput = { students: { some: { studentId: { in: ids } } } };
      // A search also finds the words in "What happened" (within the chosen class, if any).
      if (params.q && f.section) {
        const inClass = (await tx.student.findMany({ where: { AND: [scope, { enrolments: { some: { sectionId: f.section, academicYearId: year?.id, archivedAt: null } } }] }, select: { id: true } })).map((x) => x.id);
        where.AND = [{ OR: [byStudent, { AND: [{ description: { contains: params.q, mode: "insensitive" } }, { students: { some: { studentId: { in: inClass } } } }] }] }];
      } else if (params.q) where.AND = [{ OR: [byStudent, { description: { contains: params.q, mode: "insensitive" } }] }];
      else where.AND = [byStudent];
    }
    const orderBy = orderByFor(params, { date: { date: params.dir } }, [{ date: "desc" }, { createdAt: "desc" }]);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [total, rows, sections, month] = await Promise.all([
      tx.behaviourIncident.count({ where }),
      tx.behaviourIncident.findMany({ where, orderBy: orderBy as object, take, include: { students: true } }),
      sectionOptions(tx, current, year?.id, { own: can.reach === "own" }),
      tx.behaviourIncident.groupBy({ by: ["kind"], where: { ...base, archivedAt: null, date: { gte: monthStart } }, _count: true }),
    ]);
    const studentIds = [...new Set(rows.flatMap((r) => r.students.map((s) => s.studentId)))];
    // Points this year (optional): the highest and the lowest totals.
    const pointWhere = mine ? { studentId: { in: mine } } : {};
    const [top, bottom] = settings.pointsOn ? await Promise.all([
      tx.behaviourPointEntry.groupBy({ by: ["studentId"], where: pointWhere, _sum: { points: true }, orderBy: { _sum: { points: "desc" } }, take: 3 }),
      tx.behaviourPointEntry.groupBy({ by: ["studentId"], where: pointWhere, _sum: { points: true }, orderBy: { _sum: { points: "asc" } }, take: 3 }),
    ]) : [[], []];
    const points = [...top, ...bottom.filter((b) => !top.some((t) => t.studentId === b.studentId)).reverse()];
    const allIds = [...new Set([...studentIds, ...points.map((p) => p.studentId)])];
    const [students, reporters, enrol, toCounselling] = await Promise.all([
      tx.student.findMany({ where: { id: { in: allIds } }, select: { id: true, fullName: true } }),
      tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.reportedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
      year ? tx.enrolment.findMany({ where: { studentId: { in: allIds }, academicYearId: year.id, archivedAt: null }, select: { studentId: true, sectionId: true } }) : [],
      can.seeCounselling ? tx.counsellingCase.findMany({ where: { incidentId: { in: rows.map((r) => r.id) } }, select: { incidentId: true } }) : [],
    ]);
    const names = await sectionNames(tx, enrol.map((e) => e.sectionId));
    const cls = new Map(enrol.map((e) => { const n = names.get(e.sectionId); return [e.studentId, n ? classShort(n.className, n.sectionName) : ""]; }));
    return { total, rows, sections, students, reporters, points, cls, month, referred: new Set(toCounselling.map((c) => c.incidentId)) };
  });
  type Row = (typeof data.rows)[number];
  const name = (id: string) => data.students.find((s) => s.id === id)?.fullName ?? "";
  const typeLabel = (r: Row) => settings.incidentTypes.find((t) => t.key === r.typeKey)?.label ?? BEHAVIOUR_KIND_LABEL[r.kind as BehaviourKind] ?? r.kind;
  const who = (r: Row) => r.students.length > 2 ? [r.students[0]] : r.students;

  const columns: DataColumn<Row>[] = [
    { key: "date", label: "Date", nowrap: true, sortHref: listHref(path, params, { sort: "date", dir: params.sort === "date" && params.dir === "desc" ? "asc" : "desc" }), sorted: params.sort === "date" ? params.dir : null, render: (r) => <span className="tnum text-[13.5px]">{shortDate(r.date, tz)}</span> },
    { key: "student", label: "Student", render: (r) => (
      <div className="flex flex-col">
        {who(r).map((s) => <span key={s.studentId} className="whitespace-nowrap"><b className="font-semibold">{name(s.studentId)}</b>{data.cls.get(s.studentId) && <span className="text-ink3 text-[12.5px]"> · {data.cls.get(s.studentId)}</span>}</span>)}
        {r.students.length > 2 && <span className="text-[12.5px] text-ink3">and {r.students.length - 1} others</span>}
      </div>
    ) },
    { key: "type", label: "Type", render: (r) => <Pill tone={kindTone(r.kind)}>{typeLabel(r)}</Pill> },
    { key: "what", label: "What happened", className: "max-w-[260px]", render: (r) => <span className="line-clamp-2 text-[13.5px]">{r.description}</span> },
    { key: "by", label: "Reported by", nowrap: true, render: (r) => <span className="text-[13.5px]">{data.reporters.find((u) => u.id === r.reportedById)?.displayName ?? "–"}</span> },
    { key: "status", label: "Status", render: (r) => (
      <div>
        <Pill tone={r.status === "OPEN" ? "info" : "neutral"}>{r.status === "OPEN" ? "Open" : "Closed"}</Pill>
        {data.referred.has(r.id) && <p className="text-[11.5px] text-ink3 mt-0.5 whitespace-nowrap">To counselling</p>}
      </div>
    ) },
  ];
  const filtered = Boolean(params.q || Object.keys(params.filters).length || params.archived);
  const count = (k: BehaviourKind) => data.month.find((m) => m.kind === k)?._count ?? 0;
  const monthRows = [
    { k: "Incidents", v: count("incident") },
    { k: "Warnings", v: count("warning") },
    { k: "Suspensions", v: count("suspension") },
    { k: "Rewards", v: count("reward") + count("recognition") },
  ];
  const monthMax = Math.max(4, ...monthRows.map((r) => r.v));

  return (
    <>
      <StudentsHead page="Behaviour & Counselling" href={path} sub="Incidents, warnings and rewards. Counselling notes stay with the counsellor."
        actions={can.contribute ? <ButtonLink href={`${path}/new`} variant="primary" icon={Plus}>Report incident</ButtonLink> : undefined}
        subTabs={await behaviourTabs()} subLabel="Behaviour & Counselling" />
      <Split side={300}>
        <Card className="overflow-hidden">
          <Toolbar>
            <UrlSearch id="beh-search" placeholder="Student or what happened" />
            <div className="flex gap-2.5 items-center">
              <UrlSelect id="beh-kind" param="kind" label="Type" allLabel="All types" options={BEHAVIOUR_KINDS.map((k) => ({ value: k, label: BEHAVIOUR_KIND_LABEL[k] }))} className="flex-1 md:w-40" />
              <FilterMenu on={[params.filters.status, params.filters.section, params.archived].filter(Boolean).length} clearHref={listHref(path, params, { status: null, section: null, archived: null })}>
                <UrlSelect id="beh-status" param="status" label="Status" allLabel="Open and closed" options={[{ value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }]} />
                {data.sections.length > 1 && <UrlSelect id="beh-section" param="section" label="Class" allLabel="Every class" options={data.sections.map((s) => ({ value: s.value, label: s.label }))} />}
                {can.manage && <UrlToggle param="archived" label="Show archived records" />}
              </FilterMenu>
            </div>
          </Toolbar>
          <DataList caption="Behaviour records" rows={data.rows} columns={columns} rowKey={(r) => r.id} minWidth={860}
            rowHref={(r) => `${path}/${r.id}`} rowLabel={(r) => `Open the ${typeLabel(r).toLowerCase()} of ${shortDate(r.date, tz)}`}
            mobile={(r) => ({
              title: r.students.length > 1 ? `${name(r.students[0].studentId)} and ${r.students.length - 1} other${r.students.length > 2 ? "s" : ""}` : name(r.students[0]?.studentId ?? ""),
              sub: `${shortDate(r.date, tz)} · ${r.description}`,
              avatar: name(r.students[0]?.studentId ?? "") || "?",
              pills: [
                <Pill key="t" tone={kindTone(r.kind)} className={cardPill}>{typeLabel(r)}</Pill>,
                r.status === "OPEN" ? <Pill key="s" tone="info" className={cardPill}>Open</Pill> : null,
              ].filter(Boolean) as React.ReactNode[],
            })}
            footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={data.rows.length < data.total ? listHref(path, params, { n: take + STEP }) : null} />}
            empty={filtered
              ? <Empty icon={SearchX} title="Nothing matches these filters" body="Try another type or clear the search." action={<ButtonLink href={path}>Clear filters</ButtonLink>} />
              : <Empty icon={ShieldCheck} title="No behaviour records this year" body="Incidents, warnings, suspensions, rewards and recognition show here. Three taps on a phone: student, type, note."
                action={can.contribute ? <ButtonLink href={`${path}/new`} variant="primary" icon={Plus}>Report incident</ButtonLink> : undefined} />} />
        </Card>
        <Col>
          {settings.pointsOn && (
            <Card>
              <CardHeader title="Behaviour points" description="Highest and lowest this year" icon={Award} />
              {data.points.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No points given yet.</p> : (
                <ul className="px-3 pb-3">
                  {data.points.map((p) => {
                    const v = p._sum.points ?? 0;
                    return (
                      <li key={p.studentId}>
                        <Link href={`${BASE}/students/${p.studentId}?tab=behaviour`} className="flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-sunken/60">
                          <Avatar name={name(p.studentId)} size={28} />
                          <span className="flex-1 min-w-0 truncate text-[14px]">{name(p.studentId)}</span>
                          <span className={cx("font-semibold tnum text-[14px]", v > 0 ? "text-ok" : v < 0 ? "text-bad" : "text-ink3")}>{v > 0 ? `+${v}` : v}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="This month" icon={BarChart3} />
            <div className="px-5 pb-5"><HBars rows={monthRows.map((r) => ({ ...r, label: String(r.v) }))} max={monthMax} labelWidth={88} /></div>
          </Card>
          {!settings.counsellingOn && can.manage && (
            <p className="text-[13px] text-ink3 px-1">Counselling and career guidance are optional. Switch them on in <Link className="font-semibold text-brand underline" href={`${BASE}/settings?tab=behaviour`}>Student Settings</Link>.</p>
          )}
        </Col>
      </Split>
    </>
  );
}
