import Link from "next/link";
import { BookOpenCheck, Check, ChevronRight, CirclePlay, Copy, FileText, FolderOpen, Library, Lightbulb, Link2, Plus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { chaptersFor, courseDetail, courseList, lessonViewers, openLesson, type CourseRow } from "@/lib/homework/material";
import { plural, shortDay } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips } from "@/components/ui/chips";
import { cx } from "@/components/ui/cx";
import { UrlSheet } from "@/components/ui/url-sheet";
import { Banner, Col, DL, Empty, Split, Stack } from "@/components/money/kit";
import { HomeworkHead } from "../_components/homework-head";
import { Ring } from "../_components/bits";
import { BASE, homeworkGuard, one, qs, UUID, type HomeworkPage, type SearchParams } from "../_lib/page";
import { ArchiveLessonSheet, CopyCourseSheet, DoneButton, LessonMenu, LessonSheet, MoveButtons, VisibleSwitch } from "./sheets";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Study Material") };
}

const HREF = `${BASE}/study-material`;
type Sp = Record<string, string | string[] | undefined>;
type Item = { id: string; kind: string; name: string; fileId: string | null; url: string | null; sizeBytes: number | null };

const keyOf = (c: CourseRow) => `${c.sectionId}.${c.subjectId}`;
const mb = (bytes: number) => (bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`);
const ITEM_ICON = { NOTES: FileText, DOCUMENT: FileText, VIDEO: CirclePlay, LINK: Link2 } as const;

function itemMeta(it: Item) {
  if (it.kind === "VIDEO") return "Video link";
  if (it.kind === "LINK") { try { return `Link · ${new URL(it.url ?? "").hostname.replace(/^www\./, "")}`; } catch { return "Link"; } }
  const type = /\.pdf$/i.test(it.name) ? "PDF" : /\.(jpe?g|png)$/i.test(it.name) ? "Photo" : "File";
  return it.sizeBytes ? `${type} · ${mb(it.sizeBytes)}` : type;
}
const itemHref = (it: Item, schoolId: string) => (it.url ? it.url : it.fileId ? fileLink(it.fileId, schoolId) : null);

/** Study Material (17 §2): a course workspace for each class and subject, with lessons in order; a student's own courses. */
export default async function StudyMaterialPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await homeworkGuard("study-material");
  const sp = await searchParams;
  if (p.student) return <StudentMaterial p={p} sp={sp} />;
  return <StaffMaterial p={p} sp={sp} />;
}

async function StaffMaterial({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const wanted = one(sp.c);
  const doing = one(sp.do);
  const lessonId = UUID.test(one(sp.id)) ? one(sp.id) : "";
  const whoId = UUID.test(one(sp.who)) ? one(sp.who) : "";

  const data = await withSchool(p.current.ctx, async (tx) => {
    const courses = await courseList(tx, s);
    const pick = courses.find((c) => keyOf(c) === wanted) ?? courses.find((c) => c.canWork) ?? courses[0] ?? null;
    if (!pick) return { courses, pick: null };
    const detail = pick.id ? await courseDetail(tx, s, pick.id) : null;
    const lessons = detail?.lessons ?? [];
    // The syllabus of the course's own year (each campus has its own).
    const chapters = (doing === "add" || doing === "edit") && pick.canWork && pick.yearId ? await chaptersFor(tx, pick.yearId, pick, p.today) : [];
    const who = whoId ? await lessonViewers(tx, s, whoId) : null;
    return { courses, pick, lessons, chapters, who };
  });

  const head = (actions?: React.ReactNode) => (
    <HomeworkHead page="study-material" pageName="Study Material" actions={actions}
      sub={p.own ? `Your courses: ${[...new Set(data.courses.filter((c) => c.canWork).map((c) => c.subject))].join(", ") || "none yet"}` : "A course workspace for each class and subject"} />
  );

  if (!data.pick) {
    return (
      <div>
        {head()}
        <Card><Empty icon={Library} title="No courses yet" body={p.own ? "Courses come from your teaching allocations. Ask the school office to add your classes and subjects." : "Courses appear once teachers are given classes and subjects for this year."} /></Card>
      </div>
    );
  }

  const c = data.pick;
  const lessons = data.lessons ?? [];
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { c: keyOf(c), ...extra });
  const course = { sectionId: c.sectionId, subjectId: c.subjectId, label: c.sectionLabel, subject: c.subject };
  const items = lessons.flatMap((l) => l.items);
  const bytes = items.reduce((a, it) => a + (it.sizeBytes ?? 0), 0);
  const newest = [...lessons].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const editing = doing === "edit" || doing === "archive" ? lessons.find((l) => l.id === lessonId) : undefined;
  const targets = data.courses.filter((x) => x.canWork && x.subjectId === c.subjectId && x.sectionId !== c.sectionId).map((x) => ({ id: x.sectionId, label: x.sectionLabel }));
  const opened = (l: (typeof lessons)[number]) => (l.views as { studentId: string }[]).length;

  return (
    <div>
      {head(c.canWork ? <>
        <ButtonLink href={here({ do: "copy" })} scroll={false} variant="secondary" icon={Copy}><Words k="Copy course" /></ButtonLink>
        <ButtonLink href={here({ do: "add" })} scroll={false} variant="primary" icon={Plus}><Words k="Add lesson" /></ButtonLink>
      </> : undefined)}
      <Stack>
        <Chips value={keyOf(c)} label="Courses" options={data.courses.map((x) => ({ value: keyOf(x), label: `${x.subject} · ${x.sectionLabel}`, href: qs(HREF, { c: keyOf(x) }) }))} />
        <Split side={340}>
          <Card>
            <CardHeader title={`Learning path · ${c.subject} · Class ${c.sectionLabel}`} icon={BookOpenCheck}
              description={`${plural(lessons.length, "lesson")} in order · ${lessons.filter((l) => l.visible).length} visible to students`} />
            {lessons.length === 0 ? (
              <Empty icon={BookOpenCheck} title="No lessons yet" body={c.canWork ? "Add the first lesson: notes, a file or a video link." : `${c.teacher || "The teacher"} has not added lessons yet.`}
                action={c.canWork ? <ButtonLink href={here({ do: "add" })} scroll={false} variant="primary" icon={Plus}><Words k="Add lesson" /></ButtonLink> : undefined} />
            ) : (
              <ol className="px-3 pb-3 flex flex-col gap-2">
                {lessons.map((l, i) => (
                  <li key={l.id} className={cx("rounded-2xl border p-3.5", l.visible ? "border-line" : "border-dashed border-line bg-sunken/40")}>
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center text-[13px] font-bold tnum shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14.5px]">{l.title}{l.chapterTitle && l.chapterTitle !== l.title && <span className="text-ink3 font-normal text-[13px]"> · {l.chapterTitle}</span>}</p>
                        {l.visible
                          ? <Link href={here({ who: l.id })} scroll={false} className="text-[12.5px] text-ink3 hover:text-brand"><Words k="Opened by" /> {opened(l)} <Words k="of" /> {c.students}</Link>
                          : <p className="text-[12.5px] text-ink3"><Words k="Hidden from students" /></p>}
                      </div>
                      {c.canWork && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <MoveButtons id={l.id} title={l.title} first={i === 0} last={i === lessons.length - 1} />
                          <VisibleSwitch id={l.id} on={l.visible} title={l.title} label={c.sectionLabel} />
                          <LessonMenu edit={here({ do: "edit", id: l.id })} archive={here({ do: "archive", id: l.id })} />
                        </div>
                      )}
                    </div>
                    {(l.notes || l.items.length > 0) && (
                      <ul className="mt-2.5 flex flex-col gap-1 pl-11">
                        {l.notes && <li className="text-[13.5px] text-ink2 px-2 py-1 whitespace-pre-line line-clamp-3">{l.notes}</li>}
                        {l.items.map((it) => {
                          const Ic = ITEM_ICON[it.kind as keyof typeof ITEM_ICON] ?? FileText;
                          const href = itemHref(it, p.current.ctx.schoolId);
                          return (
                            <li key={it.id}>
                              <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2.5 text-left text-[13.5px] rounded-lg px-2 py-1.5 hover:bg-sunken/70">
                                <Ic size={16} className="text-ink3 shrink-0" aria-hidden="true" /><span className="flex-1 min-w-0 truncate">{it.name}</span>
                                <span className="text-[12px] text-ink3 shrink-0 hidden sm:inline">{itemMeta(it)}</span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Col>
            <Card>
              <CardHeader title="This course" icon={FolderOpen} />
              <DL className="sm:!grid-cols-1" rows={[
                ["Teacher", c.teacher || "Not given yet"],
                ["Students", `${c.students} in ${c.sectionLabel}`],
                ["Files", `${items.length}${bytes ? ` · ${mb(bytes)}` : ""}`],
                ["Last added", newest ? `${newest.title}, ${shortDay(newest.createdAt)}` : "Nothing yet"],
              ]} />
            </Card>
            <Banner tone="info" icon={Lightbulb}><Words k="Students see lessons in this order. Hide a lesson until you teach it." /></Banner>
          </Col>
        </Split>
      </Stack>

      {doing === "add" && c.canWork && <LessonSheet closeHref={here()} course={course} chapters={data.chapters ?? []} maxMb={p.settings.maxFileMb} />}
      {doing === "edit" && c.canWork && editing && (
        <LessonSheet closeHref={here()} course={course} chapters={data.chapters ?? []} maxMb={p.settings.maxFileMb}
          lesson={{ id: editing.id, title: editing.title, chapterId: editing.chapterId ?? "", notes: editing.notes ?? "", visible: editing.visible, items: editing.items.map((it) => ({ id: it.id, name: it.name })) }} />
      )}
      {doing === "archive" && c.canWork && editing && <ArchiveLessonSheet closeHref={here()} id={editing.id} title={editing.title} />}
      {doing === "copy" && c.canWork && c.id && <CopyCourseSheet closeHref={here()} courseId={c.id} subject={c.subject} lessons={lessons.length} targets={targets} />}
      {data.who && (
        <UrlSheet closeHref={here()} title={`Who opened “${data.who.lesson.title}”`} sub={`${data.who.rows.filter((r) => r.openedAt).length} of ${data.who.rows.length} students in ${c.sectionLabel}`}>
          <ul className="flex flex-col">
            {data.who.rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 border-b border-line/70 last:border-0">
                <Avatar name={r.name} size={30} /><span className="flex-1 text-[14px]">{r.name}</span>
                {r.doneAt ? <span className="text-[12px] text-ok font-semibold"><Words k="Done" /></span> : r.openedAt ? <span className="text-[12px] text-ink3"><Words k="Opened" /> {shortDay(r.openedAt)}</span> : <Pill tone="warn"><Words k="Not opened" /></Pill>}
              </li>
            ))}
          </ul>
        </UrlSheet>
      )}
    </div>
  );
}

async function StudentMaterial({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const wanted = one(sp.c);
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const data = await withSchool(p.current.ctx, async (tx) => {
    const courses = await courseList(tx, s);
    const pick = courses.find((c) => keyOf(c) === wanted) ?? courses[0] ?? null;
    if (!pick?.id) return { courses, pick, lessons: [] as Awaited<ReturnType<typeof courseDetail>>["lessons"] };
    const d = await courseDetail(tx, s, pick.id);
    // The first time a student opens a lesson is kept, for "Opened by 31 of 38".
    if (openId && d.lessons.some((l) => l.id === openId)) await openLesson(tx, s, openId);
    return { courses, pick, lessons: d.lessons };
  });
  const head = <HomeworkHead page="study-material" pageName="Study Material" sub={`Class ${(s.student?.label ?? "").replace(/^Class\s+/i, "")} · notes, files and videos from your teachers`} />;
  if (!data.pick) return <div>{head}<Card><Empty icon={Library} title="Nothing to study yet" body="Your teachers have not shared lessons yet. They appear here when they do." /></Card></div>;

  const c = data.pick;
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { c: keyOf(c), ...extra });
  const isDone = (l: (typeof data.lessons)[number]) => (l.views as { doneAt: Date | null }[]).some((v) => v.doneAt);
  const done = data.lessons.filter(isDone).length;
  const next = data.lessons.findIndex((l) => !isDone(l));
  const open = data.lessons.find((l) => l.id === openId);

  return (
    <div>
      {head}
      <Stack>
        <Chips value={keyOf(c)} label="Subjects" options={data.courses.map((x) => ({ value: keyOf(x), label: x.subject, href: qs(HREF, { c: keyOf(x) }) }))} />
        <Card>
          <div className="flex items-center gap-4 p-5">
            <Ring value={data.lessons.length ? (done / data.lessons.length) * 100 : 0} size={64} stroke={7}><span className="text-[13px] font-bold tnum">{done}/{data.lessons.length}</span></Ring>
            <div className="min-w-0"><p className="font-semibold text-[16px]">{c.subject}</p><p className="text-[13px] text-ink3">{c.teacher ? `${c.teacher} · ` : ""}{done} <Words k="of" /> {data.lessons.length} <Words k="lessons done" /></p></div>
          </div>
          <ol className="px-3 pb-3 flex flex-col gap-2">
            {data.lessons.map((l, i) => {
              const d = isDone(l);
              const n = l.items.length + (l.notes ? 1 : 0);
              return (
                <li key={l.id}>
                  <Link href={here({ open: l.id })} scroll={false} className="w-full flex items-center gap-3 rounded-2xl border border-line p-3.5 text-left hover:bg-sunken/50 transition">
                    <span className={cx("w-9 h-9 rounded-full grid place-items-center text-[13px] font-bold tnum shrink-0", d ? "bg-ok/15 text-ok" : "bg-brand/10 text-brand")}>{d ? <Check size={16} strokeWidth={3} aria-label="Done" /> : i + 1}</span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{l.title}</p><p className="text-[12.5px] text-ink3">{l.chapterTitle && l.chapterTitle !== l.title ? `${l.chapterTitle} · ` : ""}{plural(n, "item")}</p></div>
                    {!d && i === next && <Pill tone="brand"><Words k="Up next" /></Pill>}
                    <ChevronRight size={18} className="text-ink3" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      </Stack>
      {open && (
        <UrlSheet closeHref={here()} title={open.title} sub={`${c.subject}${open.chapterTitle ? ` · ${open.chapterTitle}` : ""}${c.teacher ? ` · ${c.teacher}` : ""}`}
          footer={<div className="flex justify-end gap-2"><ButtonLink href={here()} scroll={false} variant="ghost"><Words k="Close" /></ButtonLink><DoneButton id={open.id} done={isDone(open)} after={here()} /></div>}>
          {open.notes && <p className="text-[14.5px] text-ink2 leading-relaxed whitespace-pre-line mb-3">{open.notes}</p>}
          <ul className="flex flex-col gap-2">
            {open.items.map((it) => {
              const Ic = ITEM_ICON[it.kind as keyof typeof ITEM_ICON] ?? FileText;
              const href = itemHref(it, p.current.ctx.schoolId);
              return (
                <li key={it.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", it.kind === "VIDEO" ? "bg-bad/10 text-bad" : "bg-sunken text-ink2")}><Ic size={19} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{it.name}</p><p className="text-[12.5px] text-ink3">{itemMeta(it)}</p></div>
                  {href && <ButtonLink href={href} target="_blank" size="sm" variant="secondary">{it.kind === "VIDEO" ? "Play" : "Open"}</ButtonLink>}
                </li>
              );
            })}
          </ul>
        </UrlSheet>
      )}
    </div>
  );
}
