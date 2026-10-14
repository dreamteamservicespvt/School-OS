"use client";

// Study Material's sheets and buttons (mod-homework.jsx StaffMaterial and StudentMaterial).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowDown, ArrowUp, Check, Copy, Pencil, Plus } from "lucide-react";
import { Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { MoreMenu } from "@/components/money/more-menu";
import { cx } from "@/components/ui/cx";
import { AttachPicker } from "../_components/attach";
import { Text } from "../sheets";
import { addLessonAction, archiveLessonAction, copyCourseAction, editLessonAction, lessonDoneAction, lessonVisibleAction, moveLessonAction } from "./actions";

export type CourseRef = { sectionId: string; subjectId: string; label: string; subject: string };
export type LessonForm = { id: string; title: string; chapterId: string; notes: string; visible: boolean; items: { id: string; name: string }[] };

/** Add lesson, or Edit lesson: title, chapter from the syllabus, content (notes, files, video links), visible to students. */
export function LessonSheet({ closeHref, course, chapters, lesson, maxMb }: {
  closeHref: string; course: CourseRef; chapters: { id: string; title: string }[]; lesson?: LessonForm; maxMb: number;
}) {
  const [visible, setVisible] = useState(lesson ? lesson.visible : true);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const ch = useTyped("chapterId", lesson?.chapterId ?? "");
  const edit = !!lesson;
  return (
    <SheetForm title={edit ? `Edit: ${lesson.title}` : "Add lesson"} sub={`${course.subject} · Class ${course.label}`} closeHref={closeHref}
      action={edit ? editLessonAction : addLessonAction} submitLabel={edit ? "Save changes" : <><Plus size={16} aria-hidden="true" />Add lesson</>} pendingText="Saving…"
      hidden={edit ? { id: lesson.id } : { sectionId: course.sectionId, subjectId: course.subjectId, label: course.label }}>
      <FieldShell label="Course" id="ls-course" required>
        <input id="ls-course" value={`${course.subject} · Class ${course.label}`} readOnly className={cx(inputCls(), "h-11 bg-sunken/50")} />
      </FieldShell>
      <Text name="title" label="Lesson title" required start={lesson?.title} placeholder="For example: Simple Equations" />
      <FieldShell label="Chapter" id="ls-ch" help={chapters.length ? "From the syllabus" : "The syllabus for this class has no chapters yet"} error={ch.error}>
        <select id="ls-ch" name="chapterId" defaultValue={ch.value} key={ch.key} className={cx(inputCls(ch.error), "h-11")}>
          <option value="">No chapter</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </FieldShell>
      <Text name="notes" label="Notes" area rows={3} start={lesson?.notes} placeholder="Typed notes students read with the lesson" help="Optional when you add a file or link" />
      {edit && lesson.items.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[13px] font-semibold text-ink2 mb-1">In this lesson</legend>
          {lesson.items.map((f) => (
            <label key={f.id} className={cx("flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13.5px]", remove.has(f.id) && "opacity-50 line-through")}>
              <span className="flex-1 min-w-0 truncate">{f.name}</span>
              <input type="checkbox" name="remove" value={f.id} checked={remove.has(f.id)} className="size-4"
                onChange={(e) => setRemove((x) => { const n = new Set(x); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} />
              <span className="text-[12.5px] text-ink3">Remove</span>
            </label>
          ))}
        </fieldset>
      )}
      <FieldShell label="Content" id="ls-content" required={!edit} help="Notes, files, video links">
        <AttachPicker lesson maxMb={maxMb} errorName="files" />
      </FieldShell>
      <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
        <Switch id="ls-vis" on={visible} onChange={setVisible} label="Visible to students" name="visible" />
        <label htmlFor="ls-vis" className="text-[13.5px]"><b className="font-semibold block">Visible to students</b><span className="text-ink3 text-[12.5px]">{visible ? "Students with a login get a notification" : "Hidden until you show it"}</span></label>
      </div>
    </SheetForm>
  );
}

export function ArchiveLessonSheet({ closeHref, id, title }: { closeHref: string; id: string; title: string }) {
  return (
    <SheetForm title={`Archive “${title}”?`} closeHref={closeHref} action={archiveLessonAction} submitLabel="Archive lesson" pendingText="Archiving…" hidden={{ id }}>
      <p className="text-[14px] text-ink2">Students no longer see it. Its files and who opened it are kept, and you can undo it from the message that follows.</p>
    </SheetForm>
  );
}

/** Copy this course to another section of the same subject. Lessons start hidden there. */
export function CopyCourseSheet({ closeHref, courseId, subject, label, lessons, targets }: {
  closeHref: string; courseId: string; subject: string; label: string; lessons: number; targets: { id: string; label: string }[];
}) {
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const name = targets.find((t) => t.id === to)?.label ?? "";
  return (
    <SheetForm title="Copy this course?" closeHref={closeHref} action={copyCourseAction} hidden={{ courseId, toSectionId: to }} submitDisabled={!to || !lessons}
      submitLabel={<><Copy size={16} aria-hidden="true" />{name ? `Copy to ${name}` : "Copy"}</>} pendingText="Copying…">
      {targets.length > 1 && (
        <FieldShell label="Copy to" id="cp-to" required>
          <select id="cp-to" value={to} onChange={(e) => setTo(e.target.value)} className={cx(inputCls(), "h-11")}>
            {targets.map((t) => <option key={t.id} value={t.id}>Class {t.label}</option>)}
          </select>
        </FieldShell>
      )}
      <p className="text-[14px] text-ink2">
        {!targets.length ? `You teach ${subject} in no other section, so there is nowhere to copy this course.`
          : !lessons ? "This course has no lessons to copy yet."
            : `All ${lessons} lessons and their files are copied to ${subject} for Class ${name}. They start hidden there, so you choose when students see them.`}
      </p>
    </SheetForm>
  );
}

/** Show or hide a lesson; the change is saved at once, with Undo in the message. */
export function VisibleSwitch({ id, on, title, label }: { id: string; on: boolean; title: string; label: string }) {
  const [value, setValue] = useState(on);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end">
      <Switch on={value} label={`Visible: ${title}`} disabled={busy} onChange={(v) => {
        setValue(v);
        start(async () => {
          const fd = new FormData();
          fd.set("id", id); fd.set("visible", v ? "1" : "0"); fd.set("label", label);
          const r = await lessonVisibleAction(fd);
          if (r) { setProblem(r); setValue(!v); } else { setProblem(null); router.refresh(); }
        });
      }} />
      {problem && <span role="alert" className="mt-1 max-w-xs text-[12.5px] text-bad">{problem}</span>}
    </span>
  );
}

/** Move up and Move down in the learning path. */
export function MoveButtons({ id, first, last, title }: { id: string; first: boolean; last: boolean; title: string }) {
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const router = useRouter();
  const move = (dir: "up" | "down") => start(async () => {
    const fd = new FormData();
    fd.set("id", id); fd.set("dir", dir);
    const r = await moveLessonAction(fd);
    if (r) setProblem(r); else { setProblem(null); router.refresh(); }
  });
  const btn = "w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken disabled:opacity-30";
  return (
    <>
      <button type="button" aria-label={`Move ${title} up`} disabled={first || busy} onClick={() => move("up")} className={btn}><ArrowUp size={16} aria-hidden="true" /></button>
      <button type="button" aria-label={`Move ${title} down`} disabled={last || busy} onClick={() => move("down")} className={btn}><ArrowDown size={16} aria-hidden="true" /></button>
      {problem && <span role="alert" className="sr-only">{problem}</span>}
    </>
  );
}

export function LessonMenu({ edit, archive }: { edit: string; archive: string }) {
  return (
    <MoreMenu size="sm" label="More for this lesson" items={[
      { icon: Pencil, label: "Edit", href: edit },
      { icon: Archive, label: "Archive", href: archive, tone: "bad" as const },
    ]} />
  );
}

/** A student's "Mark as done" or "Mark as not done". */
export function DoneButton({ id, done, after }: { id: string; done: boolean; after: string }) {
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" disabled={busy} onClick={() => start(async () => {
        const fd = new FormData();
        fd.set("id", id); fd.set("done", done ? "0" : "1");
        const r = await lessonDoneAction(fd);
        if (r) setProblem(r); else { setProblem(null); router.push(after, { scroll: false }); router.refresh(); }
      })} className={cx("h-11 px-4 rounded-xl inline-flex items-center gap-2 text-[14px] font-semibold transition disabled:opacity-60", done ? "border border-line bg-surface hover:bg-sunken" : "bg-brand text-white hover:bg-brand/90")}>
        <Check size={16} aria-hidden="true" />{done ? "Mark as not done" : "Mark as done"}
      </button>
      {problem && <span role="alert" className="mt-1 text-[12.5px] text-bad">{problem}</span>}
    </span>
  );
}
