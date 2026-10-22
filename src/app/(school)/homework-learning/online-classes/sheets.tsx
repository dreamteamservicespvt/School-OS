"use client";

// Online Classes' sheets and buttons (mod-homework.jsx StaffOnline, SessionSheet and StudentOnline).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { Text } from "../sheets";
import { attendanceAction, cancelClassAction, materialAction, recordingAction, scheduleClassAction } from "./actions";
import { KeepCheck, KeepSelect } from "@/components/ui/keep-select";

export type OcSection = { id: string; label: string; subjects: { id: string; name: string }[] };

export function ScheduleSheet({ closeHref, sections, start }: { closeHref: string; sections: OcSection[]; start: string }) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const section = sections.find((x) => x.id === sectionId) ?? sections[0];
  const [subjectId, setSubjectId] = useState(section?.subjects[0]?.id ?? "");
  const [repeat, setRepeat] = useState(false);
  const when = useTyped("startsAt", start);
  const len = useTyped("lengthMin", "40");
  const link = useTyped("meetingLink", "");
  const weeks = useTyped("weeks", "4");
  return (
    <SheetForm title="Schedule an online class" sub="Paste the meeting link from Google Meet, Zoom or another app" closeHref={closeHref} action={scheduleClassAction}
      hidden={{ sectionId: section?.id ?? "", subjectId }} submitLabel={<><CalendarPlus size={16} aria-hidden="true" />Schedule</>} pendingText="Scheduling…">
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Class and section" id="oc-cls" required>
          <KeepSelect id="oc-cls" value={section?.id} onChange={(e) => { setSectionId(e.target.value); const n = sections.find((x) => x.id === e.target.value); if (n && !n.subjects.some((x) => x.id === subjectId)) setSubjectId(n.subjects[0]?.id ?? ""); }} className={cx(inputCls(), "h-11")}>
            {sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </KeepSelect>
        </FieldShell>
        <FieldShell label="Subject" id="oc-sub" required>
          <KeepSelect id="oc-sub" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={cx(inputCls(), "h-11")}>
            {section?.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </KeepSelect>
        </FieldShell>
      </div>
      <Text name="title" label="Title" placeholder="Half Yearly revision: geometry" help="Optional. Left empty, it is the subject and class." />
      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Date and time" id="oc-when" required error={when.error}><input id="oc-when" name="startsAt" type="datetime-local" defaultValue={when.value} key={when.key} className={cx(inputCls(when.error), "h-11 tnum")} /></FieldShell>
        <FieldShell label="Length" id="oc-len" required error={len.error}>
          <select id="oc-len" name="lengthMin" defaultValue={len.value} key={len.key} className={cx(inputCls(len.error), "h-11")}>{[30, 40, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
        </FieldShell>
      </div>
      <FieldShell label="Meeting link" id="oc-link" required error={link.error} help="Students see Join from 10 minutes before the start">
        <input id="oc-link" name="meetingLink" defaultValue={link.value} key={link.key} placeholder="https://meet.google.com/abc-defg-hij" className={cx(inputCls(link.error), "h-11")} inputMode="url" />
      </FieldShell>
      <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
        <Switch id="oc-rep" on={repeat} onChange={setRepeat} label="Repeat every week" name="repeat" />
        <label htmlFor="oc-rep" className="text-[13.5px] flex-1"><b className="font-semibold block">Repeat every week</b><span className="text-ink3 text-[12.5px]">Same day and time</span></label>
        {repeat && (
          <select aria-label="For how many weeks" name="weeks" defaultValue={weeks.value} key={weeks.key} className={cx(inputCls(weeks.error), "!h-9 !w-auto text-[13px]")}>
            {[2, 3, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>for {n} weeks</option>)}
          </select>
        )}
      </div>
      {weeks.error && <p className="text-[12.5px] text-bad" role="alert">{weeks.error}</p>}
    </SheetForm>
  );
}

export function CancelSheet({ closeHref, id, title }: { closeHref: string; id: string; title: string }) {
  return (
    <SheetForm title={`Cancel “${title}”?`} closeHref={closeHref} action={cancelClassAction} hidden={{ id }} submitLabel="Cancel class" pendingText="Cancelling…" submitVariant="danger">
      <p className="text-[14px] text-ink2">Students are told at once. You can undo it from the message that follows.</p>
      <Text name="note" label="Note for students" placeholder="For example: Moved to Sat 17 Oct" help="Optional" />
    </SheetForm>
  );
}

/** Who joined: tick the students who were in the class. */
export function AttendanceSheet({ closeHref, id, title, roster }: { closeHref: string; id: string; title: string; roster: { id: string; name: string; joined: boolean }[] }) {
  const [on, setOn] = useState(() => new Set(roster.filter((r) => r.joined).map((r) => r.id)));
  const all = on.size === roster.length;
  return (
    <SheetForm title="Who joined?" sub={title} closeHref={closeHref} action={attendanceAction} hidden={{ id }} submitLabel={`Save · ${on.size} of ${roster.length} joined`} pendingText="Saving…">
      <div className="flex justify-between items-center">
        <p className="text-[13px] text-ink3">Tick the students who were in the class.</p>
        <Button size="sm" variant="ghost" onClick={() => setOn(all ? new Set() : new Set(roster.map((r) => r.id)))}>{all ? "Clear all" : "Tick all"}</Button>
      </div>
      <ul className="flex flex-col divide-y divide-line/70 max-h-[50vh] overflow-y-auto scroll-thin">
        {roster.map((r) => (
          <li key={r.id}>
            <label className="flex items-center gap-3 py-2 cursor-pointer">
              <KeepCheck type="checkbox" name="joined" value={r.id} checked={on.has(r.id)} className="size-4"
                onChange={(e) => setOn((x) => { const n = new Set(x); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />
              <Avatar name={r.name} size={28} /><span className="flex-1 text-[14px]">{r.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </SheetForm>
  );
}

export function MaterialSheet({ closeHref, id, title }: { closeHref: string; id: string; title: string }) {
  const f = useTyped("file", null);
  const u = useTyped("url", "");
  return (
    <SheetForm title="Share a material" sub={title} closeHref={closeHref} action={materialAction} hidden={{ id }} submitLabel="Share" pendingText="Sharing…">
      <FieldShell label="File" id="mt-file" error={f.error} help="Photos or PDF, up to 10 MB"><input id="mt-file" name="file" type="file" accept="image/jpeg,image/png,application/pdf" className="text-[14px]" /></FieldShell>
      <FieldShell label="Or a link" id="mt-url" error={u.error}><input id="mt-url" name="url" defaultValue={u.value} key={u.key} placeholder="https://…" className={cx(inputCls(u.error), "h-11")} inputMode="url" /></FieldShell>
      <Text name="name" label="Name" placeholder="Light: notes" help="Optional" />
    </SheetForm>
  );
}

export function RecordingBox({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const add = () => start(async () => {
    const fd = new FormData();
    fd.set("id", id); fd.set("url", url);
    const r = await recordingAction(fd);
    if (r) setProblem(r); else { setUrl(""); setProblem(null); router.refresh(); }
  });
  return (
    <FieldShell label="Add a recording link" id="rec-link" error={problem ?? undefined}>
      <div className="flex gap-2">
        <input id="rec-link" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" className={cx(inputCls(problem), "!h-10")} inputMode="url" />
        <Button variant="secondary" disabled={!url.trim()} loading={busy} className="!h-10" onClick={add}>Add</Button>
      </div>
    </FieldShell>
  );
}

export function CopyLink({ link }: { link: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="secondary" icon={done ? Check : Copy} onClick={async () => { try { await navigator.clipboard.writeText(link); setDone(true); setTimeout(() => setDone(false), 2000); } catch { setDone(false); } }}>
      {done ? "Copied" : "Copy"}
    </Button>
  );
}
