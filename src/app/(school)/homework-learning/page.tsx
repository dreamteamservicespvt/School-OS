import Link from "next/link";
import { CalendarCheck2, CalendarDays, Eye, LayoutGrid, ListChecks, NotebookPen, PartyPopper, Repeat, Rows3, Upload, Users } from "lucide-react";
import { withSchool, type Tx } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { rangeWords } from "@/lib/periods";
import { formatTime } from "@/lib/format";
import { listHomework, bandTotals, nextClassDay, nextWorkingDay, sectionStudents, type HomeworkRow } from "@/lib/homework/homework";
import { byTeacher, loadByDay } from "@/lib/homework/overview";
import { handInState } from "@/lib/homework/submissions";
import { mayWork, workSections, workSubjects } from "@/lib/homework/scope";
import { dayDate, gradeFor, HW_TONE, momentWords, pct, plural, quizWord, sessionWord, shortDay } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Band, DataList, Empty, Progress, Stack, Toolbar } from "@/components/money/kit";
import { UrlSearch, UrlSegmented, UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { HomeworkHead } from "./_components/homework-head";
import { FileRow, Ring, SubIcon, subjectIcon, subjectTone } from "./_components/bits";
import { BASE, homeworkGuard, homeworkPeriod, iso, one, qs, UUID, type HomeworkPage, type SearchParams } from "./_lib/page";
import { ArchiveSheet, CardMenu, EditSheet, GiveSheet, RemindButton, SubmitSheet, type GiveSection } from "./sheets";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Homework" };

const DAY = 86_400_000;

/** Homework (17 §2): give it in three taps, see who handed in and who has seen it; a student's own homework. */
export default async function HomeworkPageView({ searchParams }: { searchParams: SearchParams }) {
  const p = await homeworkGuard("homework");
  const sp = await searchParams;
  if (p.student) return <StudentHomework p={p} sp={sp} />;
  return <StaffHomework p={p} sp={sp} />;
}

type Sp = Record<string, string | string[] | undefined>;

async function giveSections(tx: Tx, p: HomeworkPage): Promise<GiveSection[]> {
  const sections = await workSections(tx, p.scope);
  const out: GiveSection[] = [];
  for (const sec of sections) {
    const subjects = await workSubjects(tx, p.scope, sec.id, sec.classId, p.today);
    if (!subjects.length) continue;
    const subs = [];
    for (const x of subjects) {
      const next = await nextClassDay(tx, p.current.ctx, sec.id, x.id, p.today);
      subs.push({ id: x.id, name: x.name, next: { date: iso(next.date), words: next.words } });
    }
    const tomorrow = await nextWorkingDay(tx, p.current.ctx, sec.id, p.today);
    // The section's own year: in a school with two campuses, each campus has its own.
    const roster = await sectionStudents(tx, sec.yearId, sec.id);
    out.push({ id: sec.id, label: sec.label, classId: sec.classId, className: sec.className, students: sec.students, subjects: subs, tomorrow: { date: iso(tomorrow), words: dayDate(tomorrow) }, roster: roster.map((r) => ({ id: r.id, name: r.name, rollNo: r.rollNo })) });
  }
  return out;
}

async function StaffHomework({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const per = homeworkPeriod(sp, p.dates, "thismonth");
  const tab = ["history", "archived"].includes(one(sp.tab)) ? one(sp.tab) : "current";
  const q = one(sp.q).trim().slice(0, 80);
  const sectionF = UUID.test(one(sp.section)) ? one(sp.section) : "";
  const subjectF = UUID.test(one(sp.subject)) ? one(sp.subject) : "";
  const view = ["cards", "list"].includes(one(sp.view)) ? one(sp.view) : p.settings.listView === "list" ? "list" : "cards";
  const editsHere = p.edits("homework");
  const doing = editsHere ? one(sp.do) : "";
  const target = UUID.test(one(sp.id)) ? one(sp.id) : "";

  const data = await withSchool(p.current.ctx, async (tx) => {
    const [{ all }, archived] = await Promise.all([listHomework(tx, s, p.today), tab === "archived" ? listHomework(tx, s, p.today, { archived: true }) : null]);
    const inPeriod = (r: HomeworkRow) => !per.from || !per.to || (r.startDate >= per.from && r.startDate <= per.to);
    const inP = all.filter(inPeriod);
    const overview = s.level === "full" ? await byTeacher(tx, inP, s, p.today, p.tz) : null;
    const give = doing === "give" ? await giveSections(tx, p) : null;
    const editing = doing === "edit" && target ? await tx.homework.findFirst({ where: { id: target, archivedAt: null }, include: { attachments: { where: { archivedAt: null } } } }) : null;
    const archiving = doing === "archive" && target ? all.find((r) => r.id === target) ?? null : null;
    return { all, inP, archived: archived?.rows.filter(inPeriod) ?? [], overview, give, editing, archiving };
  });

  const { inP } = data;
  const cur = inP.filter((r) => r.status === "Current");
  const hist = inP.filter((r) => r.status !== "Current");
  const base = tab === "archived" ? data.archived : tab === "history" ? hist : cur;
  const rows = base
    .filter((r) => !sectionF || r.sectionId === sectionF)
    .filter((r) => !subjectF || r.subjectId === subjectF)
    .filter((r) => !q || r.title.toLowerCase().includes(q.toLowerCase()));
  if (tab === "history" || tab === "archived") rows.sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());
  const mine = s.level === "own";
  // A teacher's own band counts their own homework; a class teacher also reads other subjects of their class.
  const t = bandTotals(mine ? cur.filter((r) => mayWork(s, r)) : cur);
  const keep = { ...per.keep, q: q || null, section: sectionF || null, subject: subjectF || null, view: one(sp.view) || null, tab: tab === "current" ? null : tab };
  const here = (extra: Record<string, string | null> = {}) => qs(BASE, { ...keep, ...extra });
  const sectionOpts = [...new Map(data.all.map((r) => [r.sectionId, r.sectionLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1], "en", { numeric: true }));
  const subjectOpts = [...new Map(data.all.map((r) => [r.subjectId, r.subject])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const subsOpen = p.may("submissions");
  const checkLabel = (r: HomeworkRow) => (p.edits("submissions") && mayWork(s, r, "submissions") ? "Check work" : "Who handed in");
  const isToday = (d: Date) => d.getTime() === p.today.getTime();
  const range = per.range ? rangeWords(per.range.from, per.range.to) : "";
  const showing = `Showing: ${per.label}${range ? ` · ${range}` : ""} · ${plural(rows.length, "homework", "homework")}`;
  const subjectsTaught = [...new Set(data.all.filter((r) => mayWork(s, r)).map((r) => r.subject))];
  const classesTaught = [...new Set(s.pairs.map((x) => data.all.find((r) => r.sectionId === x.sectionId)?.sectionLabel).filter(Boolean))];
  const sub = mine
    ? `${subjectsTaught.length ? subjectsTaught.join(", ") : "Your subjects"}${classesTaught.length ? ` · ${classesTaught.join(", ")}` : ""} · only your classes and subjects`
    : "Homework given across the school this week";
  const menu = (r: HomeworkRow) => (
    <CardMenu detail={`${BASE}/homework/${r.id}`} edit={editsHere && mayWork(s, r) && !r.archived ? here({ do: "edit", id: r.id }) : undefined} archive={editsHere && mayWork(s, r) && !r.archived ? here({ do: "archive", id: r.id }) : undefined} />
  );

  return (
    <div>
      <HomeworkHead page="homework" pageName="Homework" sub={sub}
        actions={<ButtonLink href={here({ do: "give" })} scroll={false} variant="primary" icon={NotebookPen}><Words k="Give homework" /></ButtonLink>} />
      <Stack>
        <Band items={[
          { label: `Current · ${per.label.toLowerCase()}`, big: String(t.given), foot: `${plural(t.assigned, "student")} in ${plural(t.classes, "class", "classes")}` },
          { label: "Handed in", big: `${pct(t.submitted, t.assigned)}%`, foot: `${t.submitted} of ${t.assigned}` },
          subsOpen
            ? { label: mine ? "Waiting for you to check" : "Waiting to be checked", big: String(t.toCheck), foot: "Open Submissions & Grading", href: `${BASE}/submissions` }
            : { label: "Waiting to be checked", big: String(t.toCheck), foot: "Teachers check these in their classes" },
          { label: "Seen by parents", big: t.messaged ? `${pct(t.seen, t.seenOf)}%` : "—", foot: t.messaged ? "From WhatsApp read receipts" : "No homework messages yet" },
        ]} />

        {data.overview && <Overview lines={data.overview.lines} idle={data.overview.idle.filter((t) => t.subjects.some((x) => inP.some((r) => r.subject === x)))} load={loadByDay(inP)} per={per.label} today={p.today} tz={p.tz} canRemind={p.current.permissions["homework-learning"]?.change === "all"} />}

        <Card>
          <Toolbar>
            <UrlSearch id="hw-search" placeholder="Search homework title" label="Search homework" />
            <PeriodFilter {...p.dates} fallback="thismonth" className="w-full md:w-auto" />
            {sectionOpts.length > 1 && <UrlSelect param="section" id="hw-class" label="Class" className="md:w-36" options={[{ value: "", label: "All classes" }, ...sectionOpts.map(([v, l]) => ({ value: v, label: `Class ${l}` }))]} />}
            {!mine && subjectOpts.length > 1 && <UrlSelect param="subject" id="hw-sub" label="Subject" className="md:w-44" options={[{ value: "", label: "All subjects" }, ...subjectOpts.map(([v, l]) => ({ value: v, label: l }))]} />}
            <UrlSegmented param="view" fallback={p.settings.listView === "list" ? "list" : "cards"} className="hidden md:inline-flex" label="Show as"
              options={[{ value: "cards", label: <><LayoutGrid size={15} aria-hidden="true" /><Words k="Cards" /></> }, { value: "list", label: <><Rows3 size={15} aria-hidden="true" /><Words k="List" /></> }]} />
          </Toolbar>
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3">
            <UrlSegmented param="tab" fallback="current" label="Which homework"
              options={[{ value: "current", label: `Current · ${cur.length}` }, { value: "history", label: `History · ${hist.length}` }, ...(tab === "archived" || editsHere ? [{ value: "archived", label: "Archived" }] : [])]} />
            <ExportButton href={qs(`${BASE}/export`, keep)} />
          </div>
          {rows.length === 0 ? (
            <Empty icon={NotebookPen} title={tab === "current" ? "No current homework here" : tab === "archived" ? "Nothing archived" : "Nothing in history yet"}
              body={`Nothing given in ${per.label.toLowerCase()}${range ? ` (${range})` : ""}. Pick other dates${editsHere ? ", or give homework" : ""}.`}
              action={editsHere && tab === "current" ? <ButtonLink href={here({ do: "give" })} scroll={false} variant="primary" icon={NotebookPen}><Words k="Give homework" /></ButtonLink> : undefined} />
          ) : view === "cards" ? (
            <>
              <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
                {rows.map((r) => {
                  const dueToday = r.status === "Current" && isToday(r.dueDate);
                  const n = r.counts.assigned;
                  return (
                    <li key={r.id} className="rounded-2xl border border-line p-4 flex flex-col gap-3 hover:border-ink3/40 transition">
                      <div className="flex items-start gap-3">
                        <SubIcon subject={r.subject} />
                        <Link href={`${BASE}/homework/${r.id}`} className="min-w-0 flex-1 text-left">
                          <p className="font-semibold text-[14.5px] leading-snug hover:underline">{r.title}</p>
                          <p className="text-[12.5px] text-ink3 mt-0.5">{r.subject} <Words k="· Class" /> {r.sectionLabel}{(!mine || !mayWork(s, r)) && r.teacher && ` · ${r.teacher}`}</p>
                        </Link>
                        {r.archived ? <Pill tone="neutral"><Words k="Archived" /></Pill> : r.status !== "Current" ? <Pill tone={HW_TONE[r.status]}>{r.status}</Pill> : dueToday ? <Pill tone="warn"><Words k="Due today" /></Pill> : null}
                      </div>
                      <div>
                        <div className="flex justify-between text-[12.5px] mb-1"><span className="text-ink2"><b className="font-semibold text-ink tnum">{n}</b> <Words k="assigned," /> <b className="font-semibold text-ink tnum">{r.counts.submitted}</b> <Words k="submitted" /></span><span className="text-ink3 tnum">{r.counts.graded} <Words k="checked" /></span></div>
                        <Progress value={pct(r.counts.submitted, n)} tone={r.status === "Past due" && r.counts.submitted < n ? "warn" : "brand"} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[12.5px] text-ink3">
                        <span className="tnum"><Words k="Given" /> {dayDate(r.startDate)} <Words k="· due" /> <b className={cx("font-semibold", dueToday ? "text-warn" : "text-ink2")}>{dueToday ? "today" : dayDate(r.dueDate)}</b></span>
                        {p.settings.cardShowsSeen && r.seen !== null && <span className="inline-flex items-center gap-1 shrink-0"><Eye size={13} aria-hidden="true" /><Words k="Seen by" /> {r.seen} <Words k="of" /> {n}</span>}
                        {p.settings.cardShowsFiles && r.files > 0 && <span className="shrink-0">{plural(r.files, "file")}</span>}
                      </div>
                      <div className="flex gap-2 mt-auto">
                        {subsOpen
                          ? <ButtonLink href={`${BASE}/submissions?hw=${r.id}`} size="sm" variant="secondary" className="flex-1" icon={ListChecks}>{checkLabel(r)}</ButtonLink>
                          : <ButtonLink href={`${BASE}/homework/${r.id}`} size="sm" variant="secondary" className="flex-1" icon={Eye}><Words k="Who handed in" /></ButtonLink>}
                        {menu(r)}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">{showing}</div>
            </>
          ) : (
            <div className="mt-3 border-t border-line">
              <DataList rows={rows} rowKey={(r) => r.id} rowHref={(r) => `${BASE}/homework/${r.id}`} minWidth={760} caption="Homework" footer={showing}
                columns={[
                  { key: "t", label: "Homework", render: (r) => <div className="flex items-center gap-3"><SubIcon subject={r.subject} size={34} /><div><p className="font-semibold leading-tight">{r.title}</p><p className="text-[12.5px] text-ink3">{r.subject} · {r.sectionLabel}{!mine && r.teacher ? ` · ${r.teacher}` : ""}</p></div></div> },
                  { key: "d", label: "Due", nowrap: true, render: (r) => <span className="tnum">{dayDate(r.dueDate)}</span> },
                  { key: "c", label: "Handed in", render: (r) => <span className="tnum">{r.counts.submitted} <Words k="of" /> {r.counts.assigned}</span> },
                  { key: "p", label: "Seen by parent", render: (r) => <span className="tnum">{r.seen === null ? "—" : `${r.seen} of ${r.counts.assigned}`}</span> },
                  { key: "s", label: "Status", render: (r) => <Pill tone={r.archived ? "neutral" : HW_TONE[r.status]}>{r.archived ? "Archived" : r.status}</Pill> },
                ]}
                phone={(r) => ({ icon: subjectIcon(r.subject), iconTone: subjectTone(r.subject), title: r.title, sub: `${r.sectionLabel} · due ${dayDate(r.dueDate)} · ${r.counts.submitted} of ${r.counts.assigned} in` })} />
            </div>
          )}
        </Card>
      </Stack>

      {data.give && (data.give.length ? (
        <GiveSheet closeHref={here({ do: null })} sections={data.give} own={mine} today={iso(p.today)} defaultMax={p.settings.defaultMaxMarks} onlineOn={p.settings.onlineSubmission} ai={p.ai} startSection={sectionF || undefined} />
      ) : (
        <UrlSheet title="Give homework" closeHref={here({ do: null })}>
          <Empty icon={Users} title="No class to give homework to" body="Homework goes to your classes that have students. Ask the Academic Head to check your Teacher Allocation, or add students to the class first." />
        </UrlSheet>
      ))}
      {data.editing && mayWork(s, data.editing) && (
        <EditSheet closeHref={here({ do: null, id: null })} onlineOn={p.settings.onlineSubmission}
          hw={{ id: data.editing.id, title: data.editing.title, instructions: data.editing.instructions ?? "", startDate: iso(data.editing.startDate), dueDate: iso(data.editing.dueDate), maxMarks: data.editing.maxMarks, onlineSubmission: data.editing.onlineSubmission, label: data.all.find((r) => r.id === data.editing!.id)?.sectionLabel ?? "" }}
          files={data.editing.attachments.map((a) => ({ id: a.id, name: a.name }))} />
      )}
      {data.archiving && mayWork(s, data.archiving) && <ArchiveSheet closeHref={here({ do: null, id: null })} id={data.archiving.id} title={data.archiving.title} />}
    </div>
  );
}

/** For people who look after homework across the school: who gives how much, and the load on each class (HomeworkOverview). */
function Overview({ lines, idle, load, per, today, tz, canRemind }: {
  lines: Awaited<ReturnType<typeof byTeacher>>["lines"]; idle: Awaited<ReturnType<typeof byTeacher>>["idle"]; load: ReturnType<typeof loadByDay>; per: string; today: Date; tz: string; canRemind: boolean;
}) {
  return (
    <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
      <Card>
        <CardHeader title="By teacher" description={`Homework given · ${per.toLowerCase()}`} icon={Users} />
        {lines.length + idle.length === 0 ? <Empty icon={Users} title="No homework yet" body="Homework given in these dates shows here, by teacher." /> : (
          <ul className="px-2 pb-2">
            {lines.map((t) => (
              <li key={t.staffId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                <Avatar name={t.name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] leading-snug truncate">{t.name} <span className="font-normal text-ink3">· {t.subjects.join(", ")}</span></p>
                  <p className="text-[12.5px] text-ink3 truncate tnum">{t.given} <Words k="given ·" /> {t.classes.join(", ")} · {pct(t.handed, t.assigned)}<Words k="% handed in" />{t.toCheck ? ` · ${t.toCheck} to check` : ""}</p>
                </div>
                {canRemind && t.toCheck >= 10 && <RemindButton staffId={t.staffId} done={t.remindedAt ? formatTime(t.remindedAt, tz) : null} />}
              </li>
            ))}
            {idle.map((t) => (
              <li key={t.staffId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                <Avatar name={t.name} size={34} />
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] leading-snug truncate">{t.name} <span className="font-normal text-ink3">· {t.subjects.join(", ")}</span></p><p className="text-[12.5px] text-ink3"><Words k="No homework given in these dates" /></p></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Load on each day" description="Current homework by due date · more than one for a class on the same day shows in amber" icon={CalendarDays} />
        {load.length === 0 ? <Empty icon={CalendarCheck2} title="Nothing due" body="No current homework in these dates." /> : (
          <ul className="px-2 pb-2">
            {load.map((x) => (
              <li key={x.day} className="flex items-start gap-3 px-3 py-2.5 rounded-xl">
                <span className={cx("w-11 h-11 rounded-xl grid place-items-center shrink-0 font-display text-[18px] font-semibold tnum", x.heavy.length ? "bg-warn/12 text-warn" : "bg-sunken text-ink2")}>{x.due.length}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] leading-snug"><Words k="Due" /> {x.date.getTime() === today.getTime() ? `today, ${dayDate(x.date)}` : dayDate(x.date)}</p>
                  <p className="text-[12.5px] text-ink3">{x.due.map((h) => `${h.sectionLabel} ${h.subject}`).join(" · ")}</p>
                  {x.heavy.length > 0 && <p className="text-[12.5px] text-warn font-semibold mt-0.5">{x.heavy.map(([c, n]) => `${c} has ${n} due`).join(" · ")}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- the student's own homework */

async function StudentHomework({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const st = s.student;
  const per = homeworkPeriod(sp, p.dates, "acyear");
  const tab = ["submitted", "checked"].includes(one(sp.tab)) ? one(sp.tab) : "todo";
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const submitId = UUID.test(one(sp.submit)) ? one(sp.submit) : "";
  const monthStart = new Date(Date.UTC(p.today.getUTCFullYear(), p.today.getUTCMonth(), 1));

  const data = st ? await withSchool(p.current.ctx, async (tx) => {
    const subs = await tx.submission.findMany({
      where: { studentId: st.id, archivedAt: null, homework: { archivedAt: null, academicYearId: s.yearId ?? undefined, startDate: { lte: p.today } } },
      include: { homework: { include: { attachments: { where: { archivedAt: null } } } } },
      orderBy: { homework: { dueDate: "asc" } },
    });
    const subjects = await tx.subject.findMany({ where: { id: { in: [...new Set(subs.map((x) => x.homework.subjectId))] } }, select: { id: true, name: true } });
    const teachers = await tx.staff.findMany({ where: { id: { in: [...new Set(subs.map((x) => x.homework.teacherId).filter((x): x is string => !!x))] } }, select: { id: true, fullName: true } });
    const quizzes = p.may("quizzes") ? await tx.quiz.findMany({ where: { sectionId: st.sectionId, archivedAt: null, status: "OPEN" }, select: { id: true, title: true, status: true, opensAt: true, closesAt: true, attempts: { where: { studentId: st.id, submittedAt: { not: null } }, select: { id: true } } } }) : [];
    const nextClass = p.may("online-classes") ? await tx.onlineClassSession.findFirst({ where: { sectionId: st.sectionId, archivedAt: null, status: "SCHEDULED", startsAt: { gte: new Date(p.now.getTime() - 2 * 3600_000) } }, orderBy: { startsAt: "asc" } }) : null;
    const mineFiles = subs.flatMap((x) => (x.id === openId ? x.fileIds : []));
    const fileRows = mineFiles.length ? await tx.storedFile.findMany({ where: { id: { in: mineFiles } }, select: { id: true, fileName: true } }) : [];
    return { subs, subjects: new Map(subjects.map((x) => [x.id, x.name])), teachers: new Map(teachers.map((x) => [x.id, x.fullName])), quizzes, nextClass, fileRows };
  }) : null;

  const head = <HomeworkHead page="homework" pageName="Homework" sub={st ? `${st.name} · ${st.label.replace(/^Class\s+/i, "Class ")}${st.rollNo ? ` · roll ${st.rollNo}` : ""} · only your own work` : "Only your own work"} />;
  if (!st || !data) {
    return <div>{head}<Card><Empty icon={NotebookPen} title="You are not in a class this year" body="Homework shows here once the school puts you in a class for this academic year. Ask your class teacher." /></Card></div>;
  }

  const state = (x: (typeof data.subs)[number]) => (x.status === "GRADED" ? "checked" : x.status === "SUBMITTED" || x.status === "LATE" ? "submitted" : x.status === "EXCUSED" ? "excused" : "todo");
  const inPer = (d: Date) => !per.from || !per.to || (d >= per.from && d <= per.to);
  const todo = data.subs.filter((x) => state(x) === "todo");
  const handed = data.subs.filter((x) => state(x) === "submitted");
  const checked = data.subs.filter((x) => state(x) === "checked");
  const shown = (tab === "todo" ? todo : tab === "submitted" ? handed : checked).filter((x) => inPer(x.homework.dueDate));
  if (tab !== "todo") shown.reverse();
  const checkedMonth = checked.filter((x) => x.score !== null && x.gradedAt && x.gradedAt >= monthStart);
  const avg = checkedMonth.length ? Math.round(checkedMonth.reduce((a, x) => a + (x.score! / x.homework.maxMarks) * 100, 0) / checkedMonth.length) : null;
  const openQuizzes = data.quizzes.filter((z) => quizWord(z, p.now) === "Open" && !z.attempts.length);
  const closing = openQuizzes.filter((z) => z.closesAt).sort((a, b) => a.closesAt!.getTime() - b.closesAt!.getTime())[0];
  const nc = data.nextClass && sessionWord(data.nextClass, p.now) !== "Done" ? data.nextClass : null;
  const keep = { ...per.keep, tab: tab === "todo" ? null : tab };
  const here = (extra: Record<string, string | null> = {}) => qs(BASE, { ...keep, ...extra });
  const subjectOf = (x: (typeof data.subs)[number]) => data.subjects.get(x.homework.subjectId) ?? "";
  const teacherOf = (x: (typeof data.subs)[number]) => (x.homework.teacherId ? data.teachers.get(x.homework.teacherId) ?? "" : "");
  const isToday = (d: Date) => d.getTime() === p.today.getTime();
  const dueWords = (d: Date) => (isToday(d) ? `today, ${dayDate(d)}` : dayDate(d));
  const open = openId ? data.subs.find((x) => x.homework.id === openId) ?? null : null;
  const submitting = submitId ? data.subs.find((x) => x.homework.id === submitId) ?? null : null;
  const canHandIn = (x: (typeof data.subs)[number]) => handInState(x, x.homework, p.today, p.settings.onlineSubmission);
  const ncWhen = nc ? (nc.startsAt.getTime() - p.now.getTime() < DAY && iso(nc.startsAt) === iso(p.today) ? `Today ${clock(nc.startsAt, p.tz)}` : `${dayDate(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: p.tz }).format(nc.startsAt)}T00:00:00Z`)).split(" ")[0]} ${clock(nc.startsAt, p.tz)}`) : "";
  const grade = (x: (typeof data.subs)[number]) => x.grade ?? (x.score !== null ? gradeFor(x.score, x.homework.maxMarks, p.settings.gradeBands) : null);

  return (
    <div>
      {head}
      <Stack>
        <Band items={[
          { label: "Homework to do", big: String(todo.length), foot: `${todo.filter((x) => isToday(x.homework.dueDate)).length} due today`, href: here({ tab: null }) },
          ...(p.may("quizzes") ? [{ label: "Quizzes open", big: String(openQuizzes.length), foot: closing ? `${closing.title} closes ${clock(closing.closesAt!, p.tz)}` : openQuizzes.length ? "Take them in Quizzes" : "Nothing open now", href: `${BASE}/quizzes` }] : []),
          ...(p.may("online-classes") ? [{ label: "Next online class", big: nc ? ncWhen : "—", foot: nc ? nc.title : "Nothing scheduled", href: `${BASE}/online-classes` }] : []),
          { label: "Checked this month", big: avg === null ? "—" : `${avg}%`, foot: checkedMonth.length ? `Average of ${plural(checkedMonth.length, "homework", "homework")}` : "Nothing checked yet this month" },
        ]} />
        <Card>
          <CardHeader title="My homework" description="Hand it in here before the due date. After that it is marked late." icon={NotebookPen} />
          <div className="px-3 flex flex-col md:flex-row gap-2.5 md:items-center">
            <PeriodFilter {...p.dates} fallback="acyear" ahead className="w-full md:w-auto" />
            <UrlSegmented param="tab" fallback="todo" className="w-full md:w-auto" label="Which homework"
              options={[{ value: "todo", label: `To do · ${todo.length}` }, { value: "submitted", label: `Handed in · ${handed.length}` }, { value: "checked", label: `Checked · ${checked.length}` }]} />
          </div>
          {shown.length === 0 ? (
            <Empty icon={PartyPopper} title={tab === "todo" ? "All done" : "Nothing here"} body={`Nothing due in ${per.label.toLowerCase()}. New homework shows here as soon as a teacher gives it.`} />
          ) : (
            <ul className="p-2">
              {shown.map((x) => {
                const h = x.homework;
                const can = canHandIn(x);
                const g = grade(x);
                return (
                  <li key={x.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                    <SubIcon subject={subjectOf(x)} />
                    <Link href={here({ open: h.id })} scroll={false} className="min-w-0 flex-1 text-left">
                      <p className="font-semibold text-[14.5px] leading-snug">{h.title}</p>
                      <p className="text-[12.5px] text-ink3">{subjectOf(x)}{teacherOf(x) && ` · ${teacherOf(x)}`}</p>
                      <p className={cx("text-[12.5px] mt-0.5", state(x) === "todo" && isToday(h.dueDate) ? "text-warn font-semibold" : state(x) === "todo" && h.dueDate < p.today ? "text-bad font-semibold" : "text-ink3")}>
                        {state(x) === "todo" ? (h.dueDate < p.today ? `Was due ${dayDate(h.dueDate)} · hand in now, it is marked late` : `Due ${dueWords(h.dueDate)}`)
                          : state(x) === "submitted" ? `Handed in ${x.submittedAt ? momentWords(x.submittedAt, p.tz) : ""}`
                            : x.score !== null ? `Score ${x.score} of ${h.maxMarks}` : x.checkResult === "INCORRECT" ? "Checked · needs another look" : "Checked · complete"}
                      </p>
                    </Link>
                    {state(x) === "todo" && can.can && <ButtonLink href={here({ submit: h.id })} scroll={false} size="sm" variant="primary" icon={Upload}><Words k="Submit" /></ButtonLink>}
                    {state(x) === "todo" && !can.can && <Pill tone="neutral"><Words k="In class" /></Pill>}
                    {state(x) === "submitted" && <Pill tone={x.status === "LATE" ? "warn" : "info"}>{x.status === "LATE" ? "Late" : "Waiting to be checked"}</Pill>}
                    {state(x) === "checked" && (can.can ? <ButtonLink href={here({ submit: h.id })} scroll={false} size="sm" variant="secondary" icon={Repeat}><Words k="Hand in again" /></ButtonLink>
                      : g ? <Pill tone={g === "A" ? "ok" : "brand"}><Words k="Grade" /> {g}</Pill> : <Pill tone={x.checkResult === "INCORRECT" ? "warn" : "ok"}>{x.checkResult === "INCORRECT" ? "Incorrect" : "Complete"}</Pill>)}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Stack>

      {open && (() => {
        const h = open.homework;
        const can = canHandIn(open);
        const g = grade(open);
        return (
          <UrlSheet closeHref={here({ open: null })} title={h.title} sub={`${subjectOf(open)}${teacherOf(open) ? ` · ${teacherOf(open)}` : ""} · due ${dueWords(h.dueDate)} · out of ${h.maxMarks}`}
            footer={can.can ? <div className="flex justify-end gap-2"><ButtonLink href={here({ open: null, submit: h.id })} scroll={false} variant={can.again ? "secondary" : "primary"} icon={can.again ? Repeat : Upload}>{can.again ? "Hand in again" : "Submit"}</ButtonLink></div> : null}>
            <div className="flex flex-col gap-4">
              {h.instructions && <p className="text-[14.5px] text-ink2 leading-relaxed whitespace-pre-line">{h.instructions}</p>}
              {h.attachments.length > 0 && <ul>{h.attachments.map((a) => <FileRow key={a.id} name={a.name} kind={a.kind} meta={a.kind === "link" ? "Link" : a.kind === "photo" ? "Photo" : "File"} href={a.kind === "link" ? a.url : a.fileId ? fileLink(a.fileId, p.current.ctx.schoolId) : null} />)}</ul>}
              {(open.fileIds.length > 0 || open.note) && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-1"><Words k="What you handed in" /></p>
                  {open.note && <p className="text-[14px] text-ink2 mb-1">{open.note}</p>}
                  <ul>{data.fileRows.map((f) => <FileRow key={f.id} name={f.fileName} kind="photo" meta={open.submittedAt ? momentWords(open.submittedAt, p.tz) : undefined} href={fileLink(f.id, p.current.ctx.schoolId)} />)}</ul>
                </div>
              )}
              {open.status === "GRADED" && (
                <div className="rounded-2xl bg-sunken/60 p-4">
                  <div className="flex items-center gap-3">
                    <Ring value={open.score !== null ? (open.score / h.maxMarks) * 100 : open.checkResult === "COMPLETE" ? 100 : 0} tone={open.checkResult === "INCORRECT" ? "warn" : "ok"}><span className="text-[13px] font-bold tnum">{open.score ?? (open.checkResult === "COMPLETE" ? "✓" : "")}</span></Ring>
                    <div>
                      <p className="font-semibold text-[15px]">{open.score !== null ? `${open.score} of ${h.maxMarks}` : open.checkResult === "INCORRECT" ? "Incorrect" : "Complete"}{g ? ` · Grade ${g}` : ""}</p>
                      <p className="text-[12.5px] text-ink3"><Words k="Checked by" /> {teacherOf(open) || "your teacher"}{open.gradedAt ? ` · ${shortDay(open.gradedAt)}` : ""}</p>
                    </div>
                  </div>
                  {p.settings.feedbackVisible && open.feedback && <p className="text-[14px] text-ink2 mt-3"><b className="font-semibold text-ink"><Words k="Feedback:" /> </b>{open.feedback}</p>}
                  {open.resubmitAllowed && <p className="text-[13px] text-info mt-2 flex gap-1.5"><Repeat size={15} className="shrink-0 mt-0.5" aria-hidden="true" /><Words k="Your teacher lets you hand this in again" />{open.resubmitUntil ? ` until ${dayDate(open.resubmitUntil)}` : ""}.</p>}
                </div>
              )}
              {!can.can && open.status !== "GRADED" && <p className="text-[13px] text-ink3">{can.why}</p>}
            </div>
          </UrlSheet>
        );
      })()}
      {submitting && canHandIn(submitting).can && (
        <SubmitSheet closeHref={here({ submit: null })} id={submitting.homework.id} title={submitting.homework.title} maxMb={p.settings.maxFileMb}
          again={!!canHandIn(submitting).again} sub={`${subjectOf(submitting)} · due ${dueWords(submitting.homework.dueDate)}`} />
      )}
    </div>
  );
}

function clock(at: Date, tz: string) {
  return at.toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase().replace(":00 ", " ");
}
