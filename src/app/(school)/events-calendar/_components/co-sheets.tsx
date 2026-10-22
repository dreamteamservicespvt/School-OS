"use client";

// The Co-curricular & Sports sheets (mod-events.jsx AchievementForm, the
// house points sheet, members, meetings, training, fixtures and fitness).
// Every one posts to a server action that checks the role again.

import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented, Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { tickCls } from "@/components/ui/data-list";
import { HOUSE_BG } from "@/lib/events/words";
import {
  achievementAction, archiveAchievementAction, assignHousesAction, certificatesAction, clubAction, creditCorrectionAction, fitnessAction, fixtureAction,
  houseAction, housePointsAction, membersAction, resultAction, sessionAction, teamAction,
} from "../activity-actions";
import { KeepCheck, KeepSelect } from "@/components/ui/keep-select";

type Opt = { value: string; label: string };
export type PickStudent = { id: string; name: string; place: string };

/** Tick students from a long list: search by name or class, tick a whole class at once. */
export function StudentPicker({ students, name = "studentIds", start = [], label = "Student(s)", required = true, single = false, help }: { students: PickStudent[]; name?: string; start?: string[]; label?: string; required?: boolean; single?: boolean; help?: string }) {
  const t = useTyped(name, null);
  const [on, setOn] = useState<Set<string>>(() => new Set(start));
  const [q, setQ] = useState("");
  const places = useMemo(() => [...new Set(students.map((s) => s.place).filter(Boolean))], [students]);
  const [place, setPlace] = useState("");
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return students.filter((s) => (!place || s.place === place) && (!k || s.name.toLowerCase().includes(k) || s.place.toLowerCase().includes(k)));
  }, [q, place, students]);
  const shown = list.slice(0, 150);
  const toggle = (id: string, v: boolean) => setOn((x) => { const n = single ? new Set<string>() : new Set(x); if (v) n.add(id); else n.delete(id); return n; });
  const allOn = !single && list.length > 0 && list.every((s) => on.has(s.id));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[13px] font-semibold text-ink2 mb-1.5">{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}<span className="font-normal text-ink3"> · {on.size} {single ? "chosen" : "ticked"}</span></legend>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or class" aria-label="Search students" className={cx(inputCls(false), "h-11 pl-10")} />
        </div>
        {places.length > 1 && (
          <KeepSelect value={place} onChange={(e) => setPlace(e.target.value)} aria-label="Class" className={cx(inputCls(false), "h-11 !w-[130px] shrink-0")}>
            <option value="">All classes</option>
            {places.map((p) => <option key={p} value={p}>{p}</option>)}
          </KeepSelect>
        )}
      </div>
      {!single && place && list.length > 0 && (
        <button type="button" onClick={() => setOn((x) => { const n = new Set(x); for (const s of list) { if (allOn) n.delete(s.id); else n.add(s.id); } return n; })} className="self-start text-[12.5px] font-semibold text-brand h-8">
          {allOn ? `Untick all of ${place}` : `Tick all of ${place} (${list.length})`}
        </button>
      )}
      <ul className="flex flex-col max-h-[30vh] overflow-y-auto scroll-thin rounded-xl border border-line divide-y divide-line/60">
        {shown.map((s) => (
          <li key={s.id}>
            <label className={cx("flex items-center gap-3 px-3 py-2 cursor-pointer", on.has(s.id) ? "bg-brand/5" : "hover:bg-sunken/60")}>
              <KeepCheck type={single ? "radio" : "checkbox"} name={`pick-${name}`} checked={on.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} className={single ? "size-4 accent-[var(--color-brand)]" : tickCls} />
              <Avatar name={s.name} size={28} />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium truncate">{s.name}</span><span className="block text-[12px] text-ink3">{s.place || "—"}</span></span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="px-3 py-4 text-[14px] text-ink3">No students match.</li>}
        {list.length > shown.length && <li className="px-3 py-2 text-[12.5px] text-ink3">{list.length - shown.length} more. Search or pick a class to see them.</li>}
      </ul>
      {[...on].map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      {t.error ? <p className="text-[12.5px] text-bad">{t.error}</p> : help ? <p className="text-[12.5px] text-ink3">{help}</p> : null}
    </fieldset>
  );
}

/* ---------- Achievements ---------- */

export function AchievementSheet({ closeHref, students, kinds, levels, credits, creditsOn, today, teams, events, start }: {
  closeHref: string; students: PickStudent[]; kinds: string[]; levels: string[]; credits: { take: number[]; win: number[] }; creditsOn: boolean; today: string;
  teams: Opt[]; events: Opt[]; start?: { studentIds?: string[]; teamId?: string };
}) {
  const lv = useTyped("level", "School");
  const [level, setLevel] = useState(lv.value || "School");
  const rs = useTyped("result", "won");
  const [result, setResult] = useState(rs.value || "won");
  const ct = useTyped("certificate", "on");
  const [cert, setCert] = useState(ct.value === "on");
  const i = levels.indexOf(level);
  const n = i < 0 ? 0 : result === "won" ? credits.win[i] ?? 0 : credits.take[i] ?? 0;
  return (
    <SheetForm title="Record achievement" sub="For a whole team or class, pick several students." closeHref={closeHref} action={achievementAction} submitLabel="Record" hidden={{ level, result, certificate: cert ? "on" : "" }}>
      <StudentPicker students={students} start={start?.studentIds} />
      <SText name="activity" label="Activity or competition" required maxLength={120} placeholder="For example: Inter-school quiz" />
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="kind" label="Kind of activity" required options={kinds.map((k) => ({ value: k, label: k }))} start={kinds[0]} />
        <SDate name="date" label="Date" required start={today} max={today} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Level</span>
        <Segmented label="Level" value={level} onChange={setLevel} options={levels} className="w-full" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Result</span>
        <Segmented label="Result" value={result} onChange={setResult} options={[{ value: "won", label: "Won or placed" }, { value: "part", label: "Took part" }]} className="w-full" />
      </div>
      {result === "won" && <SText name="position" label="Position or result" maxLength={60} placeholder="1st, Winners, Gold medal…" />}
      {(teams.length > 0 || events.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {events.length > 0 && <SSelect name="eventId" label="School event" options={[{ value: "", label: "Not a school event" }, ...events]} start={""} />}
          {teams.length > 0 && <SSelect name="teamId" label="Team" options={[{ value: "", label: "No team" }, ...teams]} start={start?.teamId ?? ""} />}
        </div>
      )}
      <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
        <Switch id="af-cert" on={cert} onChange={setCert} label="Issue a certificate now" />
        <label htmlFor="af-cert" className="text-[14px] flex-1"><b className="font-semibold">Issue a certificate now</b><span className="block text-[12.5px] text-ink3">Parents are told by message; print it from the list</span></label>
      </div>
      {creditsOn && <p className="text-[13px] text-ink2 flex items-center gap-2"><Star size={15} className="text-brand" aria-hidden="true" />Activity credits: <b className="font-semibold">+{n}</b> <span className="text-ink3">for {result === "won" ? "a" : "taking part in a"} {level.toLowerCase()}-level {result === "won" ? "result" : "activity"}</span></p>}
    </SheetForm>
  );
}

export function IssueSheet({ closeHref, ids, names }: { closeHref: string; ids: string[]; names: string[] }) {
  return (
    <SheetForm title={`Issue ${ids.length === 1 ? "1 certificate" : `${ids.length} certificates`}?`} sub="Each gets its number now, in the design from Settings, Document Designs. Parents are told by message." closeHref={closeHref}
      action={certificatesAction} submitLabel={`Issue ${ids.length === 1 ? "1 certificate" : `${ids.length} certificates`}`}>
      {ids.map((i) => <input key={i} type="hidden" name="achievementIds" value={i} />)}
      <ul className="text-[14px] text-ink2 flex flex-col gap-1 max-h-[30vh] overflow-y-auto scroll-thin">{names.map((n, i) => <li key={i}>{n}</li>)}</ul>
    </SheetForm>
  );
}

export function ArchiveAchievementSheet({ closeHref, achievementId, what, credits }: { closeHref: string; achievementId: string; what: string; credits: number }) {
  return (
    <SheetForm title="Take this achievement off the record?" sub={`${what}. It is kept in the history.${credits ? ` Its ${credits} activity credits are reversed.` : ""}`} closeHref={closeHref}
      action={archiveAchievementAction} submitLabel="Take it off" submitVariant="danger" hidden={{ achievementId }}>
      <SArea name="reason" label="Reason" required rows={2} placeholder="For example: recorded for the wrong student" />
    </SheetForm>
  );
}

export function CreditSheet({ closeHref, students, studentId, total }: { closeHref: string; students: PickStudent[]; studentId?: string; total?: number }) {
  return (
    <SheetForm title="Correct activity credits" sub="A reason is needed. Every change is kept." closeHref={closeHref} action={creditCorrectionAction} submitLabel="Save credits" hidden={studentId ? { studentId } : undefined}>
      {!studentId && <StudentPicker students={students} name="studentId" single label="Student" />}
      {total != null && <p className="text-[13.5px] text-ink2">Total this year: <b className="font-semibold tnum">{total}</b></p>}
      <SText name="points" label="Credits" required inputMode="numeric" help="Use a minus sign to take credits away, like -5" className="tnum" />
      <SText name="reason" label="Reason" required maxLength={160} placeholder="For example: Debate credits missed on 6 Sep" />
    </SheetForm>
  );
}

/* ---------- Houses ---------- */

export function PointsSheet({ closeHref, houses }: { closeHref: string; houses: Opt[] }) {
  return (
    <SheetForm title="Add or remove house points" sub="A reason is needed. Every change is kept." closeHref={closeHref} action={housePointsAction} submitLabel="Save points">
      <SSelect name="houseId" label="House" required options={houses} start={houses[0]?.value} />
      <SText name="points" label="Points" required inputMode="numeric" start="10" help="Use a minus sign to take points away, like -10" className="tnum" />
      <SText name="reason" label="Reason" required maxLength={160} placeholder="For example: Inter-house debate, winners" />
    </SheetForm>
  );
}

export function AssignHousesSheet({ closeHref, houses, students, without }: { closeHref: string; houses: Opt[]; students: PickStudent[]; without: number }) {
  const m = useTyped("mode", without ? "turn" : "hand");
  const [mode, setMode] = useState(m.value || "turn");
  return (
    <SheetForm title="Assign students to houses" sub="For this school year. Moving a student keeps where they were before." closeHref={closeHref} action={assignHousesAction}
      submitLabel={mode === "turn" ? `Give ${without} students a house` : "Move to this house"} hidden={{ mode }} submitDisabled={mode === "turn" && !without}>
      <Segmented label="How" value={mode} onChange={setMode} options={[{ value: "turn", label: "In turn, by class and roll" }, { value: "hand", label: "By hand" }]} className="w-full" />
      {mode === "turn" ? (
        <p className="text-[14px] text-ink2">{without ? `${without} students have no house this year. They are given houses one after another, in class and roll order, so the houses stay even.` : "Every student has a house this year. Choose By hand to move someone."}</p>
      ) : (
        <>
          <SSelect name="houseId" label="House" required options={houses} start={houses[0]?.value} />
          <StudentPicker students={students} />
        </>
      )}
    </SheetForm>
  );
}

export function HouseSheet({ closeHref, house, students, colours }: { closeHref: string; house?: { id: string; name: string; colour: string; captainStudentId: string | null }; students: PickStudent[]; colours: Opt[] }) {
  const c = useTyped("colour", house?.colour ?? colours[0]?.value);
  const [colour, setColour] = useState(c.value || "info");
  return (
    <SheetForm title={house ? `Change ${house.name}` : "Add a house"} sub="Name, colour and captain. Changes are logged." closeHref={closeHref} action={houseAction} submitLabel="Save" hidden={{ ...(house ? { houseId: house.id } : {}), colour }}>
      <SText name="name" label="Name" required maxLength={40} start={house?.name ?? ""} placeholder="For example: Tagore House" />
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Colour</span>
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Colour">
          {colours.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={colour === o.value} onClick={() => setColour(o.value)}
              className={cx("h-10 pl-2 pr-3 rounded-xl border flex items-center gap-2 text-[13.5px] font-semibold", colour === o.value ? "border-brand bg-brand/8 text-brand" : "border-line text-ink2")}>
              <span className={cx("w-6 h-6 rounded-full", HOUSE_BG[o.value])} aria-hidden="true" />{o.label}
            </button>
          ))}
        </div>
      </div>
      <StudentPicker students={students} name="captainStudentId" single label="Captain" required={false} start={house?.captainStudentId ? [house.captainStudentId] : []} />
    </SheetForm>
  );
}


/* ---------- Clubs and teams ---------- */

export function ClubSheet({ closeHref, club, staff }: { closeHref: string; club?: { id: string; name: string; inChargeId: string | null; meets: string | null }; staff: Opt[] }) {
  return (
    <SheetForm title={club ? `Change ${club.name}` : "New club"} closeHref={closeHref} action={clubAction} submitLabel="Save" hidden={club ? { clubId: club.id } : undefined}>
      <SText name="name" label="Name" required maxLength={60} start={club?.name ?? ""} placeholder="For example: Eco Club" />
      <SSelect name="inChargeId" label="In-charge" options={[{ value: "", label: "Not set yet" }, ...staff]} start={club?.inChargeId ?? ""} />
      <SText name="meets" label="Meets" maxLength={60} start={club?.meets ?? ""} placeholder="For example: Thursdays, 2:20 PM" />
    </SheetForm>
  );
}

export function TeamSheet({ closeHref, team, staff }: { closeHref: string; team?: { id: string; name: string; sport: string; coachId: string | null; coachName: string | null }; staff: Opt[] }) {
  const c = useTyped("coachId", team?.coachId ?? (team?.coachName ? "" : staff[0]?.value ?? ""));
  const [coach, setCoach] = useState(c.value);
  return (
    <SheetForm title={team ? `Change ${team.name}` : "New team"} closeHref={closeHref} action={teamAction} submitLabel="Save" hidden={team ? { teamId: team.id } : undefined}>
      <SText name="name" label="Team" required maxLength={60} start={team?.name ?? ""} placeholder="For example: Under-14 Cricket, boys" />
      <SText name="sport" label="Sport" required maxLength={40} start={team?.sport ?? ""} placeholder="Cricket, Football, Athletics…" />
      <SSelect name="coachId" label="Coach" options={[...staff, { value: "", label: "A visiting coach" }]} start={coach} onChange={(e) => setCoach(e.target.value)} />
      {!coach && <SText name="coachName" label="Visiting coach's name" required maxLength={60} start={team?.coachName ?? ""} />}
    </SheetForm>
  );
}

export function MembersSheet({ closeHref, kind, groupId, name, students, members }: { closeHref: string; kind: "club" | "team"; groupId: string; name: string; students: PickStudent[]; members: number }) {
  return (
    <SheetForm title={`Add members to ${name}`} sub={`${members} ${members === 1 ? "member" : "members"} now. Pick students by class. They see it on their profile.`} closeHref={closeHref}
      action={membersAction} submitLabel="Add members" hidden={{ kind, groupId }}>
      <StudentPicker students={students} label="Students" />
    </SheetForm>
  );
}

export function SessionSheet({ closeHref, kind, groupId, name, members, today, venue }: { closeHref: string; kind: "club" | "team"; groupId: string; name: string; members: PickStudent[]; today: string; venue?: string }) {
  const [on, setOn] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  return (
    <SheetForm title={kind === "club" ? `Record meeting: ${name}` : `Training attendance: ${name}`} sub="Tick who came." closeHref={closeHref} action={sessionAction}
      submitLabel={`Save · ${on.size} of ${members.length} present`} hidden={{ kind, groupId }}>
      <SDate name="date" label="Date" required start={today} max={today} />
      {kind === "club" ? <SText name="topic" label="Topic" maxLength={120} placeholder="For example: Seed ball making" /> : (
        <div className="grid grid-cols-2 gap-3">
          <SText name="time" label="Time" type="time" start="15:50" className="tnum" />
          <SText name="venue" label="Venue" maxLength={80} start={venue ?? "School ground"} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ink2">{on.size} of {members.length} present</p>
        <button type="button" className="text-[12.5px] font-semibold text-brand h-8" onClick={() => setOn(on.size === members.length ? new Set() : new Set(members.map((m) => m.id)))}>{on.size === members.length ? "Untick all" : "Tick all"}</button>
      </div>
      <ul className="flex flex-col max-h-[36vh] overflow-y-auto scroll-thin rounded-xl border border-line divide-y divide-line/60">
        {members.map((m) => (
          <li key={m.id}>
            <label className={cx("flex items-center gap-3 px-3 py-2 cursor-pointer", on.has(m.id) ? "bg-ok/5" : "")}>
              <KeepCheck type="checkbox" name="present" value={m.id} checked={on.has(m.id)} onChange={(e) => setOn((x) => { const n = new Set(x); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} className={tickCls} />
              <Avatar name={m.name} size={28} />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium truncate">{m.name}</span><span className="block text-[12px] text-ink3">{m.place}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </SheetForm>
  );
}

export function FixtureSheet({ closeHref, teams, today }: { closeHref: string; teams: Opt[]; today: string }) {
  const g = useTyped("ground", "HOME");
  const [ground, setGround] = useState(g.value || "HOME");
  return (
    <SheetForm title="Add a fixture" sub="A match or competition. Record the result after it is played." closeHref={closeHref} action={fixtureAction} submitLabel="Add fixture" hidden={{ ground }}>
      <SSelect name="teamId" label="Team" options={[{ value: "", label: "No team (a meet or tournament)" }, ...teams]} start={teams[0]?.value ?? ""} />
      <SText name="title" label="Match or competition" required maxLength={120} placeholder="For example: Under-17 Football vs Delhi Public School" />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={today} />
        <SText name="time" label="Time" type="time" className="tnum" />
      </div>
      <Segmented label="Ground" value={ground} onChange={setGround} options={[{ value: "HOME", label: "Home" }, { value: "AWAY", label: "Away" }, { value: "NEUTRAL", label: "Neutral venue" }]} className="w-full" />
      <SText name="venue" label="Venue" maxLength={80} placeholder="For example: Gachibowli Stadium" />
    </SheetForm>
  );
}

export function ResultSheet({ closeHref, fixtureId, title }: { closeHref: string; fixtureId: string; title: string }) {
  const r = useTyped("result", "WON");
  const [result, setResult] = useState(r.value || "WON");
  return (
    <SheetForm title="Record the result" sub={title} closeHref={closeHref} action={resultAction} submitLabel="Save result" hidden={{ fixtureId, result }}>
      <Segmented label="Result" value={result} onChange={setResult} options={[{ value: "WON", label: "Won" }, { value: "LOST", label: "Lost" }, { value: "DRAW", label: "Draw" }, { value: "PLACED", label: "Placed" }]} className="w-full" />
      <SText name="score" label="Score or place" maxLength={80} placeholder="For example: Won by 34 runs, or 3rd" />
    </SheetForm>
  );
}

export function FitnessSheet({ closeHref, students, today }: { closeHref: string; students: PickStudent[]; today: string }) {
  return (
    <SheetForm title="Record a fitness test" sub="BMI is worked out from height and weight." closeHref={closeHref} action={fitnessAction} submitLabel="Save test">
      <StudentPicker students={students} name="studentId" single label="Student" />
      <SDate name="date" label="Date" required start={today} max={today} />
      <div className="grid grid-cols-2 gap-3">
        <SText name="heightCm" label="Height (cm)" inputMode="decimal" className="tnum" />
        <SText name="weightKg" label="Weight (kg)" inputMode="decimal" className="tnum" />
        <SText name="run" label="600 m run (min:sec)" placeholder="2:45" className="tnum" />
        <SText name="reachCm" label="Sit-and-reach (cm)" inputMode="decimal" className="tnum" />
      </div>
      <SText name="note" label="Note" maxLength={200} />
    </SheetForm>
  );
}
