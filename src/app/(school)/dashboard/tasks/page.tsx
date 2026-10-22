import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, TaskStatus } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { readListParams, PAGE_SIZE } from "@/lib/list";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { formatDateTime } from "@/lib/format";
import { assignable, isOverdue, taskAccess, taskReport, taskWhere, TASK_STATUSES, statusLabel } from "@/lib/dashboard/tasks";
import { todayFor } from "@/lib/periods";
import { PageHead } from "@/components/ui/display";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable, type Column } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { AddTaskButton, TaskDetail } from "./task-parts";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("My Tasks") };
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUS_TONE = { TODO: "neutral", IN_PROGRESS: "brand", DONE: "ok", CANCELLED: "warn" } as const;

export default async function TasksPage({ searchParams }: Search) {
  const current = await requirePage("dashboard");
  const sp = await searchParams;
  const tz = current.school.timeZone;
  const now = new Date();
  const access = taskAccess(current);
  const who = { ctx: current.ctx, access };
  const viewRaw = one(sp.view);
  const view: "mine" | "given" | "all" = viewRaw === "given" ? "given" : viewRaw === "all" && access === "full" ? "all" : "mine";
  const params = readListParams(sp, ["status", "to", "by"]);
  const range = periodFromSearch(sp, { timeZone: tz });
  const openId = one(sp.task);

  const where: Prisma.TaskWhereInput = {
    AND: [
      taskWhere(who, view),
      params.archived ? { archivedAt: { not: null } } : { archivedAt: null },
      params.q ? { title: { contains: params.q, mode: "insensitive" } } : {},
      params.filters.status === "OVERDUE" ? { status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: now } }
        : params.filters.status && TASK_STATUSES.some((s) => s.value === params.filters.status) ? { status: params.filters.status as TaskStatus } : {},
      params.filters.to ? { assignedToId: params.filters.to } : {},
      params.filters.by ? { givenById: params.filters.by } : {},
      range ? { dueAt: momentWhere(range, tz) } : {},
    ],
  };

  const data = await withSchool(current.ctx, async (tx) => {
    const [rows, people, counts, report] = await Promise.all([
      tx.task.findMany({ where, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: 1000 }),
      assignable(tx, who),
      Promise.all((["mine", "given", "all"] as const).map((v) => tx.task.count({ where: { AND: [taskWhere(who, v), { archivedAt: null, status: { in: ["TODO", "IN_PROGRESS"] } }] } }))),
      taskReport(tx, { AND: [taskWhere(who, view), range ? { dueAt: momentWhere(range, tz) } : {}] }, now),
    ]);
    const ids = [...new Set(rows.flatMap((r) => [r.assignedToId, r.givenById]))];
    const names = new Map((await tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    let detail = null;
    if (openId) {
      const t = await tx.task.findFirst({ where: { AND: [{ id: openId }, taskWhere(who, "all")] }, include: { comments: { orderBy: { createdAt: "asc" } } } });
      if (t) {
        const more = await tx.userLogin.findMany({ where: { id: { in: [t.assignedToId, t.givenById, ...t.comments.map((c) => c.authorId)] } }, select: { id: true, displayName: true } });
        const nm = new Map(more.map((u) => [u.id, u.displayName]));
        const history = await tx.auditLogEntry.findMany({ where: { recordType: "Task", recordId: t.id }, orderBy: { at: "asc" }, take: 50, select: { id: true, action: true, at: true, userLoginId: true } });
        const hn = new Map((await tx.userLogin.findMany({ where: { id: { in: history.map((h) => h.userLoginId).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        detail = { t, nm, history: history.map((h) => ({ id: h.id, what: h.action, when: formatDateTime(h.at, tz), who: h.userLoginId ? hn.get(h.userLoginId) ?? "Someone" : "School OS" })) };
      }
    }
    return { rows, people, counts, report, names, detail };
  });

  // Overdue tasks in red at the top, then by due date (01 §2, My Tasks).
  const sorted = [...data.rows].sort((a, b) => Number(isOverdue(b, now)) - Number(isOverdue(a, now)));
  const total = sorted.length;
  const page = sorted.slice((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE);
  const name = (id: string) => data.names.get(id) ?? "Someone";
  const due = (d: Date | null) => (d ? formatDateTime(d, tz) : "No due date");
  const peopleOptions = data.people.map((p) => ({ value: p.id, label: p.id === current.user.id ? `Me (${p.name})` : p.name }));

  type Row = (typeof sorted)[number];
  const columns: Column<Row>[] = [
    { key: "title", label: "Task", phone: "title", cell: (t) => t.title },
    { key: "to", label: "Assigned to", phone: "meta", cell: (t) => (t.assignedToId === current.user.id ? "Me" : name(t.assignedToId)) },
    { key: "by", label: "Given by", phone: "meta", cell: (t) => (t.givenById === current.user.id ? "Me" : name(t.givenById)) },
    { key: "due", label: "Due", phone: "meta", cell: (t) => <span className={cx(isOverdue(t, now) && "text-bad font-semibold")}>{isOverdue(t, now) ? "Overdue · " : ""}{due(t.dueAt)}</span> },
    { key: "status", label: "Status", phone: "badge", cell: (t) => <Pill tone={STATUS_TONE[t.status]}>{statusLabel(t.status)}</Pill> },
    { key: "updated", label: "Last update", cell: (t) => <span className="text-ink3 text-sm">{formatDateTime(t.updatedAt, tz)}</span> },
  ];

  const tabs = [
    { v: "mine", label: "My tasks", count: data.counts[0] },
    ...(access === "full" ? [{ v: "given", label: "Given by me", count: data.counts[1] }, { v: "all", label: "All tasks", count: data.counts[2] }] : [{ v: "given", label: "Given by me", count: data.counts[1] }]),
  ];
  const r = data.report;
  const today = todayFor(tz, now).toISOString().slice(0, 10);
  const d = data.detail;

  return (
    <>
      <PageHead
        crumbs={<Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft size={14} aria-hidden="true" /><Words k="Dashboard" /></Link>}
        title="My Tasks"
        sub={access === "full" ? "Tasks for any staff member, with due dates and reminders." : "Your own tasks and the ones given to you, with reminders."}
        actions={<AddTaskButton access={access} people={data.people.map((p) => ({ id: p.id, name: p.name }))} meId={current.user.id} today={today} />}
      />

      {d && (
        <TaskDetail
          key={d.t.id + d.t.updatedAt.toISOString()}
          task={{
            id: d.t.id, title: d.t.title, details: d.t.details, status: d.t.status, statusLabel: statusLabel(d.t.status),
            to: d.nm.get(d.t.assignedToId) ?? "Someone", by: d.nm.get(d.t.givenById) ?? "Someone",
            due: due(d.t.dueAt), overdue: isOverdue(d.t, now), remind: d.t.remind, archived: Boolean(d.t.archivedAt),
            canEdit: access === "full" || d.t.givenById === current.user.id,
            form: {
              id: d.t.id, title: d.t.title, assignedToId: d.t.assignedToId, details: d.t.details ?? "", remind: d.t.remind,
              dueDate: d.t.dueAt ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d.t.dueAt) : "",
              dueTime: d.t.dueAt ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d.t.dueAt) : "",
            },
            comments: d.t.comments.map((c) => ({ id: c.id, who: d.nm.get(c.authorId) ?? "Someone", when: formatDateTime(c.createdAt, tz), text: c.text })),
            history: d.history,
          }}
          access={access} people={data.people.map((p) => ({ id: p.id, name: p.name }))} meId={current.user.id} today={today}
          closeHref={`/dashboard/tasks${view === "mine" ? "" : `?view=${view}`}`}
        />
      )}

      <nav aria-label="Which tasks" className="mb-4 inline-flex p-1 rounded-xl bg-sunken gap-1 max-w-full overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <Link key={t.v} href={t.v === "mine" ? "/dashboard/tasks" : `/dashboard/tasks?view=${t.v}`} aria-current={view === t.v ? "page" : undefined}
            className={cx("h-9 px-3.5 rounded-lg text-[13.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap", view === t.v ? "bg-surface shadow-card text-ink" : "text-ink2 hover:text-ink")}>
            {t.label}<span className="text-ink3 text-[11.5px] tnum">{t.count}</span>
          </Link>
        ))}
      </nav>

      <ListToolbar placeholder="Search tasks"
        period={{ timeZone: tz, allLabel: "Due: any date" }}
        filters={[{ key: "status", label: "Status", options: [{ value: "OVERDUE", label: "Overdue" }, ...TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))] }]}
        more={access === "full" ? [{ key: "to", label: "Assigned to", options: peopleOptions }, { key: "by", label: "Given by", options: peopleOptions }] : []}
      />

      <DataTable rows={page} columns={columns} rowKey={(t) => t.id} total={total} params={params} path="/dashboard/tasks"
        rowHref={(t) => `/dashboard/tasks?${new URLSearchParams({ ...(view === "mine" ? {} : { view }), task: t.id })}`}
        caption="Tasks" empty={
          <EmptyState title={params.q || Object.keys(params.filters).length || range ? "No tasks match these filters" : view === "given" ? "You have not given anyone a task" : "No tasks here yet"}>
            {view === "given" ? "Use Add task and pick a person. They are told in the app." : "Use Add task to note something to do. A reminder goes out before it is due."}
          </EmptyState>
        } />

      <Card className="mt-6">
        <CardHeader title="Task report" description={`${view === "all" ? "Everyone's tasks" : view === "given" ? "Tasks you gave" : "Your tasks"}${range ? ` · due ${range.label}` : ""}`} />
        <div className="px-5 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[["Open", r.totals.open], ["Done", r.totals.done], ["Overdue", r.totals.overdue], ["Average days to close", r.totals.avgDays ?? "None yet"]].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-sunken/70 px-3 py-2.5">
              <p className={cx("font-display font-semibold text-[20px] tnum", k === "Overdue" && Number(v) > 0 && "text-bad")}>{String(v)}</p>
              <p className="text-[12px] text-ink3">{k}</p>
            </div>
          ))}
        </div>
        {r.people.length > 1 && (
          <div className="px-5 pb-5 overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <caption className="sr-only"><Words k="Tasks by person" /></caption>
              <thead className="text-[12.5px] text-ink3"><tr><th scope="col" className="py-2 pr-3 font-medium"><Words k="Person" /></th><th scope="col" className="py-2 px-3 font-medium text-right"><Words k="Open" /></th><th scope="col" className="py-2 px-3 font-medium text-right"><Words k="Overdue" /></th><th scope="col" className="py-2 px-3 font-medium text-right"><Words k="Done" /></th><th scope="col" className="py-2 pl-3 font-medium text-right"><Words k="Average days to close" /></th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.people.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">{access === "full" ? <Link className="hover:text-brand" href={`/dashboard/tasks?view=all&to=${p.id}`}>{p.name}</Link> : p.name}</td>
                    <td className="py-2 px-3 text-right tnum">{p.open}</td>
                    <td className={cx("py-2 px-3 text-right tnum", p.overdue > 0 && "text-bad font-semibold")}>{p.overdue}</td>
                    <td className="py-2 px-3 text-right tnum">{p.done}</td>
                    <td className="py-2 pl-3 text-right tnum">{p.avgDays ?? "None yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
