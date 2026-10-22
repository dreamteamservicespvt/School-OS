"use client";

// The Gallery sheets and forms (mod-events.jsx AlbumForm, TagSheet, the
// publish confirmation, "Who can see it" and Upload).

import { useActionState, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Tag, Upload } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SChips, SDate, SSelect, SText } from "@/components/ui/sheet-fields";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { albumAccessAction, publishAlbumAction, saveAlbumAction, tagAction } from "../actions";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

type Opt = { value: string; label: string };

const VIS: Opt[] = [{ value: "STAFF", label: "Staff only" }, { value: "CLASSES", label: "Parents of chosen classes" }, { value: "EVERYONE", label: "Everyone" }];
const RULES: Opt[] = [{ value: "OUT", label: "Leave the photo out" }, { value: "BLUR", label: "Blur them" }];

export function AlbumSheet({ closeHref, start, events, classes, rule }: { closeHref: string; start: { id?: string; name?: string; date?: string; eventId?: string }; events: (Opt & { date: string })[]; classes: Opt[]; rule: string }) {
  const editing = Boolean(start.id);
  const v = useTyped("visibleTo", "STAFF");
  const [vis, setVis] = useState(v.value || "STAFF");
  const r = useTyped("consentRule", rule);
  const [cr, setCr] = useState(r.value || rule);
  const [ev, setEv] = useState(start.eventId ?? "");
  const [name, setName] = useState(start.name ?? "");
  const [date, setDate] = useState(start.date ?? "");
  return (
    <SheetForm title={editing ? "Change album" : "New album"} sub={editing ? undefined : "Link it to an event. Upload photos from a phone or computer."} closeHref={closeHref} action={saveAlbumAction}
      submitLabel={editing ? "Save" : "Make album"} hidden={{ ...(start.id ? { albumId: start.id } : {}), ...(editing ? {} : { visibleTo: vis, consentRule: cr }) }}>
      <SSelect key={`ev-${ev}`} name="eventId" label="Event" options={[{ value: "", label: "No event" }, ...events]} start={ev}
        onChange={(e) => { const id = e.target.value; setEv(id); const x = events.find((o) => o.value === id); if (x) { setName(x.label); setDate(x.date); } }} />
      <SText key={`n-${name}`} name="name" label="Name" required start={name} maxLength={80} placeholder="For example: Fire drill, October" />
      <SDate key={`d-${date}`} name="date" label="Date" required start={date} />
      {!editing && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink2"><Words k="Visible to" /><span className="text-bad" aria-hidden="true"> *</span></span>
            <Segmented label="Visible to" value={vis} onChange={setVis} options={VIS.map((o) => ({ ...o, label: o.value === "CLASSES" ? "Chosen classes" : o.label }))} className="w-full" />
            <span className="text-[12.5px] text-ink3"><Words k="Staff only until you change it" /></span>
          </div>
          {vis === "CLASSES" && <SChips name="classIds" label="Classes" options={classes} required />}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink2"><Words k="Students without photo consent" /><span className="text-bad" aria-hidden="true"> *</span></span>
            <Segmented label="Students without photo consent" value={cr} onChange={setCr} options={RULES} className="w-full" />
          </div>
        </>
      )}
    </SheetForm>
  );
}

export function PublishStaffOnlySheet({ closeHref, changeHref, albumId }: { closeHref: string; changeHref: string; albumId: string }) {
  return (
    <SheetForm title="Visible to staff only. Change before publishing?" sub="Parents cannot see this album yet. Pick who can see it, or publish for staff only." closeHref={closeHref}
      action={publishAlbumAction} submitLabel="Publish for staff only" hidden={{ albumId, staffOnly: "on" }}
      extraButtons={<a href={changeHref} className="h-10 px-4 inline-flex items-center rounded-xl text-[14px] font-semibold text-brand hover:bg-brand/8"><Words k="Change who can see it" /></a>}>
      <p className="text-[14px] text-ink2"><Words k="Untagged photos stay staff only either way." /></p>
    </SheetForm>
  );
}

export type TagPick = { id: string; name: string; place: string; consent: boolean; tagged: boolean; x: number | null; y: number | null };

/** Tag the students in a photo; tap the photo to mark where a student is, so only their face is blurred. */
export function TagSheet({ closeHref, removeHref, mediaId, src, video, students }: { closeHref: string; removeHref: string; mediaId: string; src: string; video: boolean; students: TagPick[] }) {
  const [on, setOn] = useState<Set<string>>(() => new Set(students.filter((s) => s.tagged).map((s) => s.id)));
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() => Object.fromEntries(students.filter((s) => s.tagged && s.x != null && s.y != null).map((s) => [s.id, { x: s.x!, y: s.y! }])));
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return students.filter((s) => !t || s.name.toLowerCase().includes(t) || s.place.toLowerCase().includes(t)).slice(0, 120);
  }, [q, students]);
  const miss = students.filter((s) => on.has(s.id) && !s.consent).length;
  const box = useRef<HTMLDivElement>(null);
  return (
    <SheetForm wide title="Tag students in this photo" sub="Pick from the event’s list. Photo consent is shown for each. Tap a name, then tap the photo to mark where they are."
      closeHref={closeHref} action={tagAction} submitLabel={<><Tag size={16} aria-hidden="true" />{on.size === 1 ? "Tag 1 student" : `Tag ${on.size || ""} students`.replace("  ", " ")}</>} submitDisabled={!on.size} hidden={{ mediaId }}
      extraButtons={<Button type="submit" variant="ghost" name="noStudents" value="yes"><Words k="No students in it" /></Button>}>
      <div ref={box} className="relative rounded-xl overflow-hidden bg-sunken select-none"
        onClick={(e) => {
          if (!active || video || !box.current) return;
          const r = box.current.getBoundingClientRect();
          setPos((p) => ({ ...p, [active]: { x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000 } }));
          setOn((x) => new Set(x).add(active));
        }}>
        {video
          ? <video src={src} controls className="w-full max-h-[40vh] object-contain" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={src} alt="The photo to tag" className={cx("w-full max-h-[40vh] object-contain", active && "cursor-crosshair")} />}
        {!video && [...on].filter((id) => pos[id]).map((id) => {
          const s = students.find((x) => x.id === id);
          return <span key={id} className={cx("absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 pointer-events-none", s?.consent ? "border-ok" : "border-warn", id === active && "ring-2 ring-brand")} style={{ left: `${pos[id].x * 100}%`, top: `${pos[id].y * 100}%` }} aria-hidden="true" />;
        })}
      </div>
      {miss > 0 && <p className="text-[13px] text-warn font-medium">{miss} <Words k="without photo consent: they are left out or blurred when shared" />{video ? " (videos are left out)" : ""}.</p>}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student name or class" aria-label="Search students" className={cx(inputCls(false), "h-11 pl-10")} />
      </div>
      <ul className="flex flex-col max-h-[34vh] overflow-y-auto scroll-thin">
        {list.map((s) => (
          <li key={s.id} className={cx("flex items-center gap-3 px-2 py-2 rounded-xl", active === s.id ? "bg-brand/8" : "hover:bg-sunken/60")}>
            <Checkbox checked={on.has(s.id)} onChange={(v) => setOn((x) => { const n = new Set(x); if (v) n.add(s.id); else n.delete(s.id); return n; })} label={s.name} />
            <button type="button" onClick={() => { setActive(active === s.id ? null : s.id); setOn((x) => new Set(x).add(s.id)); }} className="flex items-center gap-3 min-w-0 flex-1 text-left">
              <Avatar name={s.name} size={32} />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium truncate">{s.name}</span><span className="block text-[12px] text-ink3">{s.place}{pos[s.id] && on.has(s.id) ? " · marked on the photo" : ""}</span></span>
            </button>
            <Pill tone={s.consent ? "ok" : "warn"} className="!h-[22px] !text-[11px]">{s.consent ? "Photo consent" : "No consent"}</Pill>
          </li>
        ))}
        {!list.length && <li className="px-2 py-4 text-[14px] text-ink3"><Words k="No students match." /></li>}
      </ul>
      <a href={removeHref} className="self-start text-[13px] font-semibold text-bad hover:underline"><Words k="Remove this" /> {video ? "video" : "photo"} <Words k="from the album" /></a>
      {[...on].map((id) => (
        <span key={id} hidden>
          <input type="hidden" name="studentIds" value={id} />
          <input type="hidden" name={`x_${id}`} value={pos[id]?.x ?? ""} />
          <input type="hidden" name={`y_${id}`} value={pos[id]?.y ?? ""} />
        </span>
      ))}
    </SheetForm>
  );
}

/** "Who can see it" on the album page. */
export function AccessForm({ albumId, visibleTo, classIds, consentRule, classes, canEdit }: { albumId: string; visibleTo: string; classIds: string[]; consentRule: string; classes: Opt[]; canEdit: boolean }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(albumAccessAction, null);
  const [vis, setVis] = useState(visibleTo);
  const [cr, setCr] = useState(consentRule);
  const [cls, setCls] = useState<Set<string>>(new Set(classIds));
  const changed = vis !== visibleTo || cr !== consentRule || (vis === "CLASSES" && [...cls].sort().join() !== [...classIds].sort().join());
  return (
    <form action={run} className="px-5 pb-5 flex flex-col gap-4">
      <input type="hidden" name="albumId" value={albumId} />
      <input type="hidden" name="consentRule" value={cr} />
      {vis === "CLASSES" && [...cls].map((c) => <input key={c} type="hidden" name="classIds" value={c} />)}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Visible to" /></span>
        <KeepSelect name="visibleTo" value={vis} disabled={!canEdit} onChange={(e) => setVis(e.target.value)} className={cx(inputCls(false), "h-11")} id="al-vis">
          {VIS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </KeepSelect>
        <span className="text-[12.5px] text-ink3">{vis === "STAFF" ? "Change before publishing so parents can see it" : "Parents get it through a link in a message"}</span>
      </label>
      {vis === "CLASSES" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Classes">
          {classes.map((c) => (
            <button key={c.value} type="button" aria-pressed={cls.has(c.value)} onClick={() => setCls((x) => { const n = new Set(x); if (n.has(c.value)) n.delete(c.value); else n.add(c.value); return n; })}
              className={cx("h-8 px-3 rounded-full border text-[13px] font-medium transition", cls.has(c.value) ? "border-brand bg-brand/8 text-brand" : "border-line text-ink2 hover:border-ink3/40")}>{c.label}</button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Students without photo consent" /></span>
        <Segmented label="Students without photo consent" value={cr} onChange={(v) => canEdit && setCr(v)} options={[{ value: "OUT", label: "Leave photo out" }, { value: "BLUR", label: "Blur them" }]} className="w-full" />
      </div>
      {canEdit && changed && <Button type="submit" variant="primary" loading={pending} className="self-start"><Words k="Save" /></Button>}
      {state && <p role={state.ok ? "status" : "alert"} className={cx("text-[12.5px]", state.ok ? "text-ok" : "text-bad")}>{state.message}</p>}
    </form>
  );
}

type Act = (s: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

/** A plain "are you sure" sheet that runs one action. */
export function ConfirmSheet({ closeHref, doneHref, title, sub, action, hidden, submitLabel, danger, children }: { closeHref: string; doneHref?: string; title: string; sub?: string; action: Act; hidden: Record<string, string>; submitLabel: string; danger?: boolean; children?: React.ReactNode }) {
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} doneHref={doneHref} action={action} hidden={hidden} submitLabel={submitLabel} submitVariant={danger ? "danger" : "primary"}>
      {children ?? <span className="sr-only">{title}</span>}
    </SheetForm>
  );
}

/** Upload photos and videos (several at once) into an album. */
export function UploadButton({ albumId }: { albumId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" className="sr-only" aria-label="Choose photos or videos" id="al-upload"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          if (!files.length) return;
          setBusy(true);
          setMsg(null);
          const fd = new FormData();
          for (const f of files) fd.append("files", f);
          try {
            const res = await fetch(`/events-calendar/gallery/${albumId}/upload`, { method: "POST", body: fd });
            const body = (await res.json().catch(() => null)) as { message?: string } | null;
            setMsg({ ok: res.ok, text: body?.message ?? (res.ok ? "Uploaded." : "The upload did not go through. Try again.") });
            if (res.ok) router.refresh();
          } catch {
            setMsg({ ok: false, text: "The upload did not go through. Check the connection and try again." });
          } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
          }
        }} />
      <Button variant="secondary" icon={Upload} loading={busy} loadingText="Uploading…" onClick={() => input.current?.click()}><Words k="Upload" /></Button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={cx("text-[12.5px] max-w-[280px]", msg.ok ? "text-ok" : "text-bad")}>{msg.text}</span>}
    </span>
  );
}
