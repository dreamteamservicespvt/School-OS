"use client";

import { useState } from "react";
import { Award, CalendarClock, EyeOff, History, Send, UserRound } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Segmented, Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { HBars } from "@/components/ui/kit";
import { MenuItem, MoreMenu } from "@/components/ui/kit-client";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { ActionSheet } from "../_components/sheets";
import { cancelScheduledAction, publishAction, unpublishAction } from "./actions";

type Sec = { id: string; label: string; ready: boolean; problems: string[]; published: boolean; scheduled: string | null; students: number };

const TIMES = Array.from({ length: 27 }, (_, i) => {
  const m = 7 * 60 + i * 30;
  const h = Math.floor(m / 60), mm = m % 60;
  return { value: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, label: `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}` };
});

const asMessage = (r: FormState | undefined) => (r?.ok ? undefined : r?.message ?? "That did not work. Please try again.");

/** Publish results (design PublishSheet): choose sections and when, then confirm what will happen. */
export function PublishFlow({ keyName, title, sections, chosen, today, label = "Publish results", size = "md" }: { keyName: string; title: string; sections: Sec[]; chosen: string; today: string; label?: string; size?: "sm" | "md" }) {
  const open = sections.filter((s) => !s.published && !s.scheduled);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [msg, setMsg] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const n = open.filter((s) => picked.includes(s.id)).reduce((a, s) => a + s.students, 0);
  const start = () => { setPicked(open.filter((s) => s.ready && (s.id === chosen || open.length <= 8)).map((s) => s.id)); setProblem(null); setStep(1); };
  const timeWords = TIMES.find((t) => t.value === time)?.label ?? time;
  const dateWords = date ? date.split("-").reverse().join("-") : "";
  const next = () => {
    if (!picked.length) return setProblem("Choose at least one section that is ready.");
    if (when === "later" && !date) return setProblem("Choose the date to publish.");
    setProblem(null); setStep(2);
  };
  return (
    <>
      <Button variant="primary" size={size} icon={Send} onClick={start}>{label}</Button>
      <Dialog open={step === 1} onClose={() => setStep(0)} title={`Publish ${title} results`} sub={`${picked.length} ${picked.length === 1 ? "section" : "sections"} · ${n} students`}
        footer={<><Button variant="ghost" onClick={() => setStep(0)}>Cancel</Button><Button variant="primary" icon={when === "now" ? Send : CalendarClock} onClick={next}>{when === "now" ? "Publish now" : "Set publish date"}</Button></>}>
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[13px] font-semibold text-ink2 mb-1.5">Classes</legend>
            {open.length === 0 && <p className="text-ink3 text-[14px]">Every section is already published or has a publish date.</p>}
            {open.map((s) => (
              <label key={s.id} className={cx("flex items-start gap-3 rounded-xl border px-3.5 py-3", s.ready ? "border-line" : "border-bad/30 bg-bad/[.04]")}>
                <input type="checkbox" checked={picked.includes(s.id)} disabled={!s.ready} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} className="mt-0.5 size-5 accent-brand" />
                <span className="text-[14px]">
                  <b className="font-semibold">{s.label}</b> <span className="text-ink3">· {s.students} students</span>
                  {s.ready ? <span className="block text-[12.5px] text-ok">All marks are in</span> : <span className="block text-[12.5px] text-bad">{s.problems.join(" ")}</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink2">Publish on</span>
            <Segmented value={when} onChange={(v) => setWhen(v as "now" | "later")} options={[{ value: "now", label: "Now" }, { value: "later", label: "Date and time" }]} className="w-full" label="Publish on" />
          </div>
          {when === "later" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">Date<input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} className={cx(inputCls(), "h-11 tnum")} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">Time
                <select value={time} onChange={(e) => setTime(e.target.value)} className={cx(inputCls(), "h-11")}>{TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
              </label>
            </div>
          )}
          <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
            <Switch id="pb-msg" on={msg} onChange={setMsg} label="Message parents" />
            <label htmlFor="pb-msg" className="text-[13.5px]"><b className="font-semibold block">Message parents</b><span className="text-ink3 text-[12.5px]">Uses the “Results published” template, one message to each family</span></label>
          </div>
          {problem && <p role="alert" className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{problem}</p>}
        </div>
      </Dialog>
      <ActionSheet open={step === 2} onClose={() => setStep(0)} title={when === "now" ? `Publish results for ${n} students now?` : `Publish on ${dateWords} at ${timeWords}?`}
        confirmLabel={when === "now" ? (msg ? `Publish and tell ${n} parents` : "Publish now") : "Set the publish date"} confirmIcon={<Send size={16} />} pendingText="Publishing…"
        run={async () => {
          const fd = new FormData();
          fd.set("key", keyName);
          for (const id of picked) fd.append("sectionIds", id);
          fd.set("when", when);
          if (when === "later") fd.set("publishOn", `${date}T${time}`);
          if (msg) fd.set("messageParents", "on");
          return asMessage(await publishAction({ ok: false }, fd));
        }}>
        <ul className="flex flex-col gap-2 text-[14px] text-ink2">
          <li className="flex gap-2"><Award size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />{n} report cards become ready and appear on each guardian’s Parent Link{when === "later" ? " on that day" : ""}.</li>
          {msg && <li className="flex gap-2"><Send size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />Parents get one message each. A message cannot be unsent.</li>}
          <li className="flex gap-2"><History size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />The result is kept in the result history. Changing the grade scale later will not change it. The marks of these sections lock.</li>
          {when === "later" && <li className="flex gap-2"><CalendarClock size={17} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />They publish by themselves then, if every mark is still complete. You can cancel the date until then.</li>}
        </ul>
      </ActionSheet>
    </>
  );
}

/** The ⋯ menu on a published result: unpublish with a reason (design UnpublishSheet). */
export function PublishedMenu({ keyName, title, sections, chosen }: { keyName: string; title: string; sections: { id: string; label: string }[]; chosen: string }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [picked, setPicked] = useState<string[]>([chosen]);
  const short = why.trim().length > 0 && why.trim().length < 8;
  return (
    <>
      <MoreMenu label={`More actions for ${title}`} size="sm">
        <MenuItem icon={<EyeOff size={16} />} onSelect={() => { setPicked([chosen]); setWhy(""); setOpen(true); }}>Unpublish</MenuItem>
      </MoreMenu>
      <ActionSheet open={open} onClose={() => setOpen(false)} title={`Unpublish ${title} results?`} sub="Report cards come off Parent Link until you publish again. Parents are not messaged again."
        confirmLabel="Unpublish" confirmVariant="danger" confirmIcon={<EyeOff size={16} />} pendingText="Unpublishing…"
        run={async () => {
          if (!picked.length) return "Choose at least one section.";
          if (why.trim().length < 8) return "Write a little more so the history makes sense.";
          const fd = new FormData();
          fd.set("key", keyName); fd.set("reason", why.trim());
          for (const id of picked) fd.append("sectionIds", id);
          return asMessage(await unpublishAction({ ok: false }, fd));
        }}>
        {sections.length > 1 && (
          <fieldset className="grid grid-cols-2 sm:grid-cols-3 gap-x-3">
            <legend className="text-[13px] font-semibold text-ink2 mb-1">Sections</legend>
            {sections.map((s) => (
              <label key={s.id} className="flex min-h-10 items-center gap-2.5 text-[14px] text-ink">
                <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} className="size-5 accent-brand" />{s.label}
              </label>
            ))}
          </fieldset>
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
          <span>Reason <span className="text-bad">*</span></span>
          <textarea value={why} onChange={(e) => setWhy(e.target.value)} rows={3} placeholder="For example: Science marks of 3 students are being corrected" className={cx(inputCls(short), "py-2 font-normal")} />
          <span className={cx("text-[12.5px] font-normal", short ? "text-bad" : "text-ink3")}>{short ? "Write a little more so the history makes sense." : "Kept in the result history"}</span>
        </label>
      </ActionSheet>
    </>
  );
}

export function CancelScheduleButton({ id, when }: { id: string; when: string }) {
  return (
    <ActionSheet trigger={{ label: "Cancel date", size: "sm", variant: "secondary" }} title="Cancel the publish date?" confirmLabel="Cancel publish date" pendingText="Cancelling…" run={() => cancelScheduledAction(id)}>
      <p className="text-ink2">The results were set to publish on {when}. They stay in draft until you publish them.</p>
    </ActionSheet>
  );
}

export type TableCol = { id: string; name: string; short: string; max: number; gradeOnly: boolean; notIn: boolean };
export type TableCell = { text: string; tone: "bad" | "info" | "warn" | null; grade: string | null; v: number | null };
export type TableRow = {
  id: string; roll: number | null; name: string; cells: Record<string, TableCell>; total: string; percent: string; grade: string | null; gradeTone: PillTone;
  rank: number | null; result: { text: string; tone: "ok" | "bad" | "warn" | "info" | "neutral" }; profile: string | null;
};

/** The class result sheet (design ResultsPage table): tap a student for their marks by subject. */
/** subjectOnly: a subject teacher's view. Only their subjects show, with no total, %, grade, rank or result. */
export function ResultTable({ columns, rows, ranks, examTitle, section, passMark, subjectOnly = false }: { columns: TableCol[]; rows: TableRow[]; ranks: boolean; examTitle: string; section: string; passMark: number; subjectOnly?: boolean }) {
  const [one, setOne] = useState<TableRow | null>(null);
  const RES = { ok: "text-ok", bad: "text-bad", warn: "text-warn", info: "text-info", neutral: "text-ink3" };
  return (
    <>
      <div className="overflow-x-auto scroll-thin border-t border-line">
        <table className="text-[13.5px] min-w-full">
          <caption className="sr-only">Class result sheet for {section}. Choose a student to see their marks by subject.</caption>
          <thead>
            <tr className="border-b border-line text-ink3 text-[12px]">
              <th scope="col" className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2.5 min-w-[180px]">Student</th>
              {columns.map((c) => <th key={c.id} scope="col" className="font-semibold px-2 py-2.5 text-center whitespace-nowrap" title={`${c.name}${c.gradeOnly ? ", graded" : ` out of ${c.max}`}${c.notIn ? ", marks not submitted" : ""}`}>{c.short}{c.notIn && <span className="text-warn"> •</span>}</th>)}
              {!subjectOnly && (
                <>
                  <th scope="col" className="font-semibold px-3 py-2.5 text-right">Total</th><th scope="col" className="font-semibold px-3 py-2.5 text-right">%</th>
                  <th scope="col" className="font-semibold px-3 py-2.5 text-center">Grade</th>{ranks && <th scope="col" className="font-semibold px-3 py-2.5 text-center">Rank</th>}<th scope="col" className="font-semibold px-4 py-2.5 text-left">Result</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setOne(r)} className="border-b border-line/60 last:border-0 cursor-pointer hover:bg-sunken/60 group">
                <th scope="row" className="sticky left-0 z-10 bg-surface group-hover:bg-sunken px-4 py-2 whitespace-nowrap text-left font-normal">
                  <button type="button" onClick={(e) => { e.stopPropagation(); setOne(r); }} className="text-left">
                    <span className="text-ink3 tnum inline-block w-7">{r.roll ?? ""}</span><span className="font-medium">{r.name}</span>
                  </button>
                </th>
                {columns.map((c) => {
                  const x = r.cells[c.id];
                  return <td key={c.id} className={cx("px-2 py-2 text-center tnum", x?.tone === "bad" && "text-bad font-semibold", x?.tone === "info" && "text-info font-semibold", x?.tone === "warn" && "text-warn")}>{x?.text ?? "—"}</td>;
                })}
                {!subjectOnly && (
                  <>
                    <td className="px-3 text-right font-semibold tnum whitespace-nowrap">{r.total}</td>
                    <td className="px-3 text-right tnum">{r.percent}</td>
                    <td className="px-3 text-center">{r.grade ? <Pill tone={r.gradeTone} className="!h-5 !text-[11px]">{r.grade}</Pill> : <span className="text-ink3">—</span>}</td>
                    {ranks && <td className="px-3 text-center tnum">{r.rank ?? "—"}</td>}
                    <td className={cx("px-4 whitespace-nowrap font-semibold text-[13px]", RES[r.result.tone])}>{r.result.text}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={Boolean(one)} onClose={() => setOne(null)} title={one?.name ?? ""} sub={one ? `${section}${one.roll ? ` · roll ${one.roll}` : ""} · ${examTitle}` : undefined}
        footer={one?.profile ? <ButtonLink href={one.profile} variant="ghost" icon={UserRound}>Open profile</ButtonLink> : undefined}>
        {one && (
          <div className="flex flex-col gap-4">
            {!subjectOnly && <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-sunken/70 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Total</p><p className="font-display text-[20px] font-semibold tnum">{one.total}</p></div>
              <div className="rounded-xl bg-sunken/70 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Percent</p><p className="font-display text-[20px] font-semibold tnum">{one.percent}</p></div>
              <div className="rounded-xl bg-sunken/70 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Grade{ranks ? " · rank" : ""}</p><p className="font-display text-[20px] font-semibold tnum">{one.grade ?? "—"}{ranks && one.rank ? ` · ${one.rank}` : ""}</p></div>
            </div>}
            <HBars labelWidth={110} lowBelow={passMark} unit="%"
              rows={columns.filter((c) => !c.gradeOnly).map((c) => ({ k: c.name, v: one.cells[c.id]?.v ?? 0, label: one.cells[c.id]?.text ? `${one.cells[c.id].text}${/^\d/.test(one.cells[c.id].text) ? `/${c.max}` : ""}` : "—" }))} />
            {columns.some((c) => c.gradeOnly) && <p className="text-[13.5px] text-ink2">{columns.filter((c) => c.gradeOnly).map((c) => `${c.name}: ${one.cells[c.id]?.text || "—"}`).join(" · ")}</p>}
          </div>
        )}
      </Dialog>
    </>
  );
}
