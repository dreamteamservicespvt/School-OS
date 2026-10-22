import { CheckCheck, CircleCheck, Hourglass, ListChecks, NotebookPen, Send, Upload, User } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { rangeWords } from "@/lib/periods";
import { listHomework, sectionStudents, type HomeworkRow } from "@/lib/homework/homework";
import { mayWork } from "@/lib/homework/scope";
import { dayDate, gradeFor, isPastDue, momentWords, SUB_TONE, submissionWord } from "@/lib/homework/words";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips } from "@/components/ui/chips";
import { DataList } from "@/components/ui/data-list";
import { InlineBulkBar } from "@/components/ui/list-controls";
import { UrlSheet } from "@/components/ui/url-sheet";
import { Banner, Empty, Stack, Stats, Toolbar } from "@/components/money/kit";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { HomeworkHead } from "../_components/homework-head";
import { FileRow } from "../_components/bits";
import { BASE, homeworkGuard, homeworkPeriod, iso, one, qs, UUID, type SearchParams } from "../_lib/page";
import { AcceptLateButton, BulkCompleteSheet, ExcuseButton, GradeSheet, RemindSheet, Thread } from "./sheets";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Submissions & Grading" };

const HREF = `${BASE}/submissions`;
const FILTERS = ["all", "check", "graded", "not"] as const;

/** Submissions & Grading (17 §2): who handed in, marks and feedback, bulk Complete with Undo, reminders to parents. */
export default async function SubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await homeworkGuard("submissions");
  const sp = await searchParams;
  const s = p.scope;
  const per = homeworkPeriod(sp, p.dates, "thismonth");
  const f = (FILTERS as readonly string[]).includes(one(sp.f)) ? one(sp.f) : "all";
  const q = one(sp.q).trim().toLowerCase().slice(0, 80);
  const wanted = UUID.test(one(sp.hw)) ? one(sp.hw) : "";
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const doing = one(sp.do);
  const ids = one(sp.ids).split(",").filter((x) => UUID.test(x));
  // Select mode on phones and tablets (TEACHING-11): tapping a student ticks them for a bulk action.
  const picking = one(sp.pick) === "1";

  const data = await withSchool(p.current.ctx, async (tx) => {
    const { all } = await listHomework(tx, s, p.today);
    const list = all.filter((r) => (per.from && per.to ? r.startDate >= per.from && r.startDate <= per.to : true) || r.id === wanted)
      .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());
    const pick = list.find((r) => r.id === wanted) ?? list.find((r) => mayWork(s, r, "submissions") && r.counts.toCheck > 0) ?? list[0] ?? null;
    if (!pick) return { list, hw: null };
    const hw = await tx.homework.findUniqueOrThrow({ where: { id: pick.id } });
    const [roster, subs] = await Promise.all([sectionStudents(tx, hw.academicYearId, hw.sectionId), tx.submission.findMany({ where: { homeworkId: hw.id, archivedAt: null } })]);
    const byStudent = new Map(subs.map((x) => [x.studentId, x]));
    const rows = roster.filter((st) => byStudent.has(st.id)).map((st) => ({ st, sub: byStudent.get(st.id)! }));
    const open = openId ? rows.find((r) => r.sub.id === openId) ?? null : null;
    const [files, comments, grader] = open ? await Promise.all([
      open.sub.fileIds.length ? tx.storedFile.findMany({ where: { id: { in: open.sub.fileIds } }, select: { id: true, fileName: true, contentType: true } }) : [],
      tx.homeworkComment.findMany({ where: { homeworkId: hw.id, studentId: open.st.id }, orderBy: { createdAt: "asc" } }),
      open.sub.gradedById ? tx.userLogin.findUnique({ where: { id: open.sub.gradedById }, select: { displayName: true } }) : null,
    ]) : [[], [], null];
    return { list, hw: { ...pick, row: hw }, rows, open, files, comments, grader };
  });

  const head = (sub: string) => <HomeworkHead page="submissions" pageName="Submissions & Grading" sub={sub} />;
  const own = s.level === "own";
  const subLine = own ? "Your homework · who handed in, marks and feedback · only your classes and subjects" : "Who handed in, and the marks and feedback";
  const range = per.range ? rangeWords(per.range.from, per.range.to) : "";
  if (!data.hw) {
    return (
      <div>{head(subLine)}<Stack>
        <Card className="p-3 flex flex-col md:flex-row gap-2.5 md:items-center"><PeriodFilter {...p.dates} fallback="thismonth" className="w-full md:w-auto" /></Card>
        <Card><Empty icon={NotebookPen} title="No homework given in these dates" body={`${per.label}${range ? ` · ${range}` : ""}. Pick other dates to check work.`} action={<ButtonLink href={HREF} variant="secondary"><Words k="This month" /></ButtonLink>} /></Card>
      </Stack></div>
    );
  }

  const hw = data.hw as HomeworkRow & { row: { id: string; maxMarks: number; title: string; dueDate: Date } };
  const rows = data.rows!;
  const canEdit = p.edits("submissions") && mayWork(s, hw, "submissions");
  const pastDue = isPastDue(hw.dueDate, p.today);
  const word = (st: string) => submissionWord(st, pastDue);
  const toCheck = (st: string) => st === "SUBMITTED" || st === "LATE";
  const notIn = (st: string) => st === "ASSIGNED" || st === "MISSING";
  const count = (fn: (st: string) => boolean) => rows.filter((r) => fn(r.sub.status)).length;
  const counted = rows.filter((r) => r.sub.status !== "EXCUSED");
  const keep = { ...per.keep, hw: hw.id, f: f === "all" ? null : f, q: q || null, pick: picking && canEdit ? "1" : null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const shown = rows.filter((r) => f === "all" || (f === "check" ? toCheck(r.sub.status) : f === "graded" ? r.sub.status === "GRADED" : notIn(r.sub.status)))
    .filter((r) => !q || r.st.name.toLowerCase().includes(q) || String(r.st.rollNo ?? "") === q || r.st.admissionNo.toLowerCase().includes(q));
  const showGrade = p.settings.gradingShow !== "scores";
  const showScore = p.settings.gradingShow !== "grades";
  const until = new Date(Math.max(p.today.getTime(), hw.dueDate.getTime()) + 2 * 86_400_000);
  const scoreCell = (r: (typeof rows)[number]) => r.sub.score !== null
    ? <b className="font-semibold tnum">{showScore ? r.sub.score : ""}{showGrade && r.sub.grade ? <span className="text-ink3 font-normal">{showScore ? " · " : ""}{r.sub.grade}</span> : null}</b>
    : r.sub.checkResult ? <span className="text-ink3 text-[13px]">{r.sub.checkResult === "INCORRECT" ? "Incorrect" : "Complete"}</span> : <span className="text-ink3">—</span>;
  const chosen = rows.filter((r) => ids.includes(r.st.id));
  const open = data.open;

  return (
    <div>
      {head(subLine)}
      <Stack>
        <Card className="p-3 flex flex-col md:flex-row gap-2.5 md:items-center">
          <PeriodFilter {...p.dates} fallback="thismonth" className="w-full md:w-auto" />
          <UrlSelect param="hw" id="sg-hw" label="Homework" className="flex-1 min-w-0" options={data.list.map((h) => ({ value: h.id, label: `${h.sectionLabel} · ${h.title} · due ${dayDate(h.dueDate)}` }))} />
          <p className="text-[13px] text-ink3 px-1"><Words k="Out of" /> {hw.maxMarks} · {hw.subject}{hw.teacher ? ` · ${hw.teacher}` : ""}</p>
        </Card>
        <Stats items={[
          { label: "Handed in", value: `${counted.filter((r) => !notIn(r.sub.status)).length} of ${counted.length}`, icon: Upload, href: here({ f: null }) },
          { label: "To check", value: String(count(toCheck)), tone: count(toCheck) ? "warn" : undefined, icon: ListChecks, href: here({ f: "check" }), active: f === "check" },
          { label: "Checked", value: String(count((x) => x === "GRADED")), tone: "ok", icon: CircleCheck, href: here({ f: "graded" }), active: f === "graded" },
          { label: pastDue ? "Missing" : "Not handed in yet", value: String(count(notIn)), tone: pastDue && count(notIn) ? "bad" : undefined, icon: Hourglass, href: here({ f: "not" }), active: f === "not" },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <UrlSearch id="sg-search" placeholder="Student name or roll" label="Search students" />
            <span className="flex-1" />
            <div className="flex gap-2.5">
              {/* Phones and tablets show cards, not the table's tick boxes: Select turns a tap on a card into a tick. */}
              {canEdit && (
                <ButtonLink href={here({ pick: picking ? null : "1" })} scroll={false} variant={picking ? "primary" : "secondary"} icon={picking ? CircleCheck : ListChecks} className="lg:hidden flex-1">
                  {picking ? "Done" : "Select students"}
                </ButtonLink>
              )}
              <ExportButton href={qs(`${HREF}/export`, { hw: hw.id, f: f === "all" ? null : f, q: q || null })} />
            </div>
          </Toolbar>
          {canEdit && picking && <p className="px-4 pt-3 text-[13px] text-ink3 lg:hidden"><Words k="Tap students to tick them, then choose Mark Complete or Remind parents. You see what will change before anything is saved." /></p>}
          <div className="px-3 pt-3">
            <Chips value={f} label="Show" options={[
              { value: "all", label: "Everyone", count: rows.length, href: here({ f: null }) },
              { value: "check", label: "To check", count: count(toCheck), href: here({ f: "check" }) },
              { value: "graded", label: "Checked", count: count((x) => x === "GRADED"), href: here({ f: "graded" }) },
              { value: "not", label: "Not handed in", count: count(notIn), href: here({ f: "not" }) },
            ]} />
          </div>
          {canEdit && <InlineBulkBar form="subs-bulk" actions={[
            { label: "Mark Complete", href: here({ do: "complete" }), icon: <CheckCheck size={15} aria-hidden="true" /> },
            { label: "Remind parents", href: here({ do: "remind" }), icon: <Send size={15} aria-hidden="true" /> },
          ]} />}
          <div className="mt-3 border-t border-line">
            <DataList rows={shown} rowKey={(r) => r.st.id} rowHref={(r) => here({ open: r.sub.id })} scroll={false} minWidth={780} caption={`Submissions for ${hw.title}`}
              select={canEdit ? { form: "subs-bulk", label: (r) => `Select ${r.st.name}`, allLabel: "Select every student shown" } : undefined} pickMode={canEdit && picking}
              footer={<p className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum"><Words k="Showing" /> {shown.length} <Words k="of" /> {rows.length}</p>}
              empty={<Empty icon={ListChecks} title="Nobody here" body="Try another filter or search." />}
              columns={[
                { key: "n", label: "Student", render: (r) => <div className="flex items-center gap-2.5"><span className="text-ink3 tnum w-5 text-[13px]">{r.st.rollNo ?? ""}</span><Avatar name={r.st.name} size={32} /><span className="font-semibold">{r.st.name}</span></div> },
                { key: "a", label: "Admission no.", render: (r) => <span className="font-mono text-[12.5px]">{r.st.admissionNo}</span> },
                { key: "w", label: "Submission", render: (r) => (r.sub.submittedAt ? <span className="text-[13px] tnum">{momentWords(r.sub.submittedAt, p.tz)}</span> : r.sub.status === "GRADED" ? <span className="text-[13px] text-ink3"><Words k="Checked in class" /></span> : <span className="text-[13px] text-ink3"><Words k="Not submitted" /></span>) },
                { key: "s", label: "Status", render: (r) => <Pill tone={SUB_TONE[word(r.sub.status)]}>{word(r.sub.status)}</Pill> },
                { key: "sc", label: `Score / ${hw.maxMarks}`, align: "right", render: scoreCell },
              ]}
              mobile={(r) => ({ avatar: r.st.name, title: `${r.st.rollNo ?? ""}. ${r.st.name}`, sub: r.sub.submittedAt ? momentWords(r.sub.submittedAt, p.tz) : "Not submitted", right: r.sub.score !== null ? <b className="font-semibold tnum">{r.sub.score}/{hw.maxMarks}</b> : null, pills: [<Pill key="s" tone={SUB_TONE[word(r.sub.status)]} className="!h-[22px] !text-[11.5px]">{word(r.sub.status)}</Pill>] })} />
          </div>
        </Card>
      </Stack>

      {canEdit && doing === "complete" && chosen.length > 0 && (
        <BulkCompleteSheet closeHref={here({ do: null, ids: null })} hw={hw.id} ids={chosen.map((r) => r.st.id).join(",")}
          rows={chosen.map((r) => ({ name: r.st.name, from: word(r.sub.status), skip: r.sub.status === "EXCUSED" || (r.sub.status === "GRADED" && r.sub.checkResult === "COMPLETE") }))} />
      )}
      {canEdit && doing === "remind" && chosen.length > 0 && (
        <RemindSheet closeHref={here({ do: null, ids: null })} hw={hw.id} ids={chosen.map((r) => r.st.id).join(",")} title={hw.title} names={chosen.filter((r) => notIn(r.sub.status)).map((r) => r.st.name)} />
      )}

      {open && (() => {
        const r = open;
        const handedIn = (
          <>
            {data.files!.length || r.sub.note ? (
              <>
                {data.files!.filter((x) => x.contentType.startsWith("image/")).length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {data.files!.filter((x) => x.contentType.startsWith("image/")).map((x, i) => (
                      <a key={x.id} href={fileLink(x.id, p.current.ctx.schoolId)} target="_blank" rel="noopener noreferrer" className="aspect-[3/4] rounded-xl border border-line bg-sunken/60 overflow-hidden block" aria-label={`Page ${i + 1}, full size`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fileLink(x.id, p.current.ctx.schoolId)} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                <ul>{data.files!.filter((x) => !x.contentType.startsWith("image/")).map((x) => <FileRow key={x.id} name={x.fileName} kind="file" href={fileLink(x.id, p.current.ctx.schoolId)} />)}</ul>
                {r.sub.note && <p className="text-[13.5px] text-ink2 rounded-xl bg-sunken/60 px-3 py-2">“{r.sub.note}”</p>}
                <p className="text-[12.5px] text-ink3">{r.sub.status === "LATE" && <span className="text-warn font-semibold"><Words k="Late ·" /> </span>}<Words k="Handed in" /> {r.sub.submittedAt ? momentWords(r.sub.submittedAt, p.tz) : ""}{data.files!.length ? " · tap a page to see it full size" : ""}</p>
              </>
            ) : <Banner tone="warn">{r.sub.status === "GRADED" ? "Checked in class; nothing was handed in online." : canEdit ? "Nothing handed in online yet. If you checked the notebook in class, mark it Complete." : "Nothing handed in yet."}</Banner>}
            {canEdit && r.sub.status === "LATE" && <div><AcceptLateButton id={r.sub.id} /></div>}
          </>
        );
        const thread = p.settings.discussionOn ? (
          <Thread submissionId={r.sub.id} canReply={canEdit}
            items={data.comments!.map((c) => ({ id: c.id, who: c.fromStudent ? r.st.name : c.authorName, when: momentWords(c.createdAt, p.tz), text: c.body, fromStudent: c.fromStudent, hidden: c.hiddenAt ? c.hiddenReason ?? "Hidden" : null }))} />
        ) : null;
        const profile = p.current.permissions["student-management"]?.see !== "none" ? <ButtonLink href={`/student-management/${r.st.id}`} variant="ghost" size="sm" icon={User}><Words k="Profile" /></ButtonLink> : null;
        const sub = `Roll ${r.st.rollNo ?? "—"} · ${hw.title}`;
        if (canEdit) {
          return (
            <GradeSheet closeHref={here({ open: null })} id={r.sub.id} name={r.st.name} sub={sub} max={hw.maxMarks} bands={p.settings.gradeBands} showGrade={showGrade} ai={p.ai}
              resubmitDefault={{ words: dayDate(until), iso: iso(until) }} handedIn={handedIn}
              extra={<>{thread}<div className="flex gap-2 items-center">{profile}{r.sub.status !== "GRADED" && <ExcuseButton id={r.sub.id} excused={r.sub.status === "EXCUSED"} />}</div></>}
              start={{ result: r.sub.checkResult ?? "COMPLETE", score: r.sub.score !== null ? String(r.sub.score) : "", feedback: r.sub.feedback ?? "", resubmit: r.sub.resubmitAllowed }} />
          );
        }
        const g = r.sub.grade ?? (r.sub.score !== null ? gradeFor(r.sub.score, hw.maxMarks, p.settings.gradeBands) : null);
        return (
          <UrlSheet wide closeHref={here({ open: null })} title={r.st.name} sub={sub} footer={profile ? <div className="flex justify-start">{profile}</div> : undefined}>
            <div className="grid md:grid-cols-[1fr_1fr] gap-5">
              <div className="flex flex-col gap-3"><p className="text-[13px] font-semibold text-ink2"><Words k="What" /> {r.st.name.split(" ")[0]} <Words k="handed in" /></p>{handedIn}{thread}</div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-semibold text-ink2"><Words k="Checked by" /> {data.grader?.displayName ?? hw.teacher ?? "the teacher"}</p>
                <div className="grid grid-cols-3 gap-2">
                  {[["Status", word(r.sub.status)], ["Score", r.sub.score !== null ? `${r.sub.score} / ${hw.maxMarks}` : "—"], ["Grade", g ?? "—"]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5 min-w-0"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className="font-semibold text-[15px] tnum truncate">{v}</p></div>
                  ))}
                </div>
                <div className="rounded-xl border border-line px-3.5 py-3"><p className="text-[12px] text-ink3 font-semibold mb-1"><Words k="Feedback to the student" /></p><p className="text-[13.5px] text-ink2">{r.sub.feedback || (r.sub.status === "GRADED" ? "No written feedback." : "Not checked yet.")}</p></div>
              </div>
            </div>
          </UrlSheet>
        );
      })()}
    </div>
  );
}
