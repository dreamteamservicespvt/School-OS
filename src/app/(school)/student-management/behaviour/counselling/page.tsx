import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HeartHandshake, Lock, SearchX, UserPlus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { readListParams, listHref } from "@/lib/list";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardHeader } from "@/components/ui/card";
import { Empty, ListFooter, Toolbar } from "@/components/ui/blocks";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataList, cardPill, type DataColumn } from "@/components/ui/data-list";
import { classShort, shortDate, shownCount } from "@/lib/students/show";
import { BASE, studentPage } from "../../_lib/page";
import { StudentsHead } from "../../_lib/head";
import { sectionNames } from "../../_lib/queries";
import { behaviourTabs } from "../sub-tabs";
import { studentIdsForFilter } from "@/lib/students/find";

export const metadata: Metadata = { title: "Counselling" };
const STEP = 25;

/** Counselling cases: only for the roles set in Student Settings, and each counsellor's own cases. */
export default async function CounsellingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, can, settings, yearIds, tz } = await studentPage();
  if (!settings.counsellingOn) redirect(`${BASE}/behaviour`);
  const raw = await searchParams;
  const params = readListParams(raw, ["status"]);
  const take = shownCount(raw, STEP);
  const range = periodFromSearch(raw, { timeZone: tz });
  const path = `${BASE}/behaviour/counselling`;
  const data = await withSchool(current.ctx, async (tx) => {
    // A person limited to one campus sees that campus's cases only.
    const campusStudents = current.campusId ? (await tx.student.findMany({ where: { campusId: current.campusId }, select: { id: true } })).map((s) => s.id) : null;
    const where = {
      archivedAt: null,
      ...(can.seeCounselling ? {} : { counsellorId: current.ctx.userId ?? "" }),
      ...(params.filters.status ? { status: params.filters.status } : {}),
      ...(range ? { openedOn: dateWhere(range) } : {}),
      ...(campusStudents ? { studentId: { in: campusStudents } } : {}),
    };
    const ids = params.q ? await studentIdsForFilter(tx, params.q) : null;
    const full = ids ? { ...where, AND: [{ studentId: { in: ids } }] } : where;
    const [total, rows, open] = await Promise.all([
      tx.counsellingCase.count({ where: full }),
      tx.counsellingCase.findMany({ where: full, orderBy: [{ status: "desc" }, { nextSessionOn: "asc" }, { openedOn: "desc" }], take, include: { _count: { select: { sessions: true } } } }),
      tx.counsellingCase.count({ where: { ...where, status: "OPEN" } }),
    ]);
    const studentIds = rows.map((r) => r.studentId);
    const [students, people, enrol] = await Promise.all([
      tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true } }),
      tx.userLogin.findMany({ where: { id: { in: rows.flatMap((r) => [r.counsellorId, r.referredById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
      yearIds.length ? tx.enrolment.findMany({ where: { studentId: { in: studentIds }, academicYearId: { in: yearIds }, archivedAt: null }, select: { studentId: true, sectionId: true } }) : [],
    ]);
    const names = await sectionNames(tx, enrol.map((e) => e.sectionId));
    const cls = new Map(enrol.map((e) => { const n = names.get(e.sectionId); return [e.studentId, n ? classShort(n.className, n.sectionName) : ""]; }));
    return { total, rows, students, people, cls, open };
  });
  type Row = (typeof data.rows)[number];
  const name = (id: string) => data.students.find((s) => s.id === id)?.fullName ?? "";
  const person = (id: string | null) => data.people.find((p) => p.id === id)?.displayName ?? null;
  const filtered = Boolean(params.q || params.filters.status || range);

  const columns: DataColumn<Row>[] = [
    { key: "student", label: "Student", render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={name(r.studentId)} size={32} />
        <div className="min-w-0">
          <p className="font-semibold leading-tight whitespace-nowrap">{name(r.studentId)}</p>
          <p className="text-[12px] text-ink3">{[data.cls.get(r.studentId), person(r.referredById) && `from ${person(r.referredById)}`].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
    ) },
    { key: "case", label: "Reason", className: "max-w-[280px]", render: (r) => <span className="line-clamp-2 text-[13.5px]">{r.reason}</span> },
    { key: "counsellor", label: "Counsellor", nowrap: true, render: (r) => person(r.counsellorId) ?? <span className="text-ink3">Not given yet</span> },
    { key: "status", label: "Status", render: (r) => <Pill tone={r.status === "OPEN" ? "info" : "neutral"}>{r.status === "OPEN" ? "Open" : "Closed"}</Pill> },
    { key: "next", label: "Next session", nowrap: true, render: (r) => <span className="text-[13.5px] tnum">{r.nextSessionOn ? shortDate(r.nextSessionOn, tz) : "–"}</span> },
    { key: "sessions", label: "Sessions", align: "right", render: (r) => r._count.sessions },
  ];

  return (
    <>
      <StudentsHead page="Behaviour & Counselling" href={path}
        sub={can.seeCounselling ? "Highly restricted. Confidential notes are seen only by the Counsellor." : "The counselling cases given to you. Only you can read the notes."}
        actions={can.contribute ? <ButtonLink href={`${path}/new`} variant="primary" icon={UserPlus}>Refer to counselling</ButtonLink> : undefined}
        subTabs={await behaviourTabs()} subLabel="Behaviour & Counselling" />
      {(can.seeCounselling || data.total > 0 || filtered) ? (
        <Card className="overflow-hidden">
          <CardHeader title={can.seeCounselling ? "Counselling cases" : "My cases"} description={`${data.open} open · nobody else can read sessions or notes`} icon={Lock} />
          <Toolbar>
            <ListToolbar placeholder="Search by student’s name" showArchived={false} period={{ timeZone: tz, allLabel: "Opened: any date" }}
              filters={[{ key: "status", label: "Status", allLabel: "Open and closed", options: [{ value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }] }]} />
          </Toolbar>
          <DataList caption="Counselling cases" rows={data.rows} columns={columns} rowKey={(r) => r.id} minWidth={820}
            rowHref={(r) => `${path}/${r.id}`} rowLabel={(r) => `Open the case of ${name(r.studentId)}`}
            mobile={(r) => ({
              title: name(r.studentId),
              sub: `${data.cls.get(r.studentId) ?? ""}${r.nextSessionOn ? ` · Next ${shortDate(r.nextSessionOn, tz)}` : ""}`,
              avatar: name(r.studentId),
              pills: [<Pill key="s" tone={r.status === "OPEN" ? "info" : "neutral"} className={cardPill}>{r.status === "OPEN" ? "Open" : "Closed"}</Pill>],
            })}
            footer={<ListFooter shown={data.rows.length} total={data.total} moreHref={data.rows.length < data.total ? listHref(path, params, { n: take + STEP }) : null} />}
            empty={filtered
              ? <Empty icon={SearchX} title="No cases match" action={<ButtonLink href={path}>Clear filters</ButtonLink>} />
              : <Empty icon={HeartHandshake} title="No counselling cases" body="Students referred to counselling show here." />} />
        </Card>
      ) : (
        <Card>
          <Empty icon={Lock} title="Counselling cases are private"
            body="You can refer a student; the counsellor is told at once. The case is then seen only by the counsellor and the roles the school allows."
            action={can.contribute ? <ButtonLink href={`${path}/new`} variant="primary" icon={UserPlus}>Refer a student</ButtonLink> : undefined} />
        </Card>
      )}
    </>
  );
}
